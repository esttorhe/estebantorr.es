// ABOUTME: Sends outbound webmentions for external links in published posts, so sites I link to are notified.
// ABOUTME: Reads the built dist/ HTML (what actually ships), discovers each target's endpoint per the W3C spec, and records every result in scripts/webmentions-sent.json so a redeploy never re-notifies.
//
// Usage:
//   bun run build && bun run webmentions:send
//   bun run webmentions:send -- --dry     # discover + report, send nothing
//   bun run webmentions:send -- --limit 5 # stop after 5 sends (useful first time)
//
// Requires no credentials: sending a webmention is an unauthenticated POST.

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

const SITE_HOST = 'estebantorr.es';
const distDir = resolve(projectRoot, 'dist');
const ledgerPath = resolve(__dirname, 'webmentions-sent.json');

const USER_AGENT = `estebantorr.es-webmention-sender (+https://${SITE_HOST}/)`;

/** How many times a failing or endpoint-less target is retried before giving up. */
export const MAX_ATTEMPTS = 3;

/** Politeness gap between sends, in ms. */
const SEND_DELAY_MS = 500;

function log(msg) {
  process.stdout.write(`[send-webmentions] ${msg}\n`);
}

// ---------------------------------------------------------------------------
// Pure transforms (exported for scripts/send-webmentions.test.mjs)
// ---------------------------------------------------------------------------

/**
 * Whether a URL is worth notifying.
 *
 * Loopback and private ranges are excluded deliberately: a link to one can only
 * be a mistake, and POSTing to it from CI would be a small SSRF footgun.
 */
export function isSendableTarget(url, ownHost) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
  if (parsed.host === ownHost) return false;

  const host = parsed.hostname;
  if (host === 'localhost' || host.endsWith('.localhost')) return false;
  if (/^127\./.test(host) || host === '::1' || host === '[::1]') return false;
  if (/^10\./.test(host) || /^192\.168\./.test(host)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;

  return true;
}

/**
 * Every external link in a page's post body, deduped and in document order.
 *
 * Scoped to `.e-content` on purpose. The footer publishes rel=me links to
 * GitHub, Mastodon, LinkedIn and Bluesky on every single page — scanning whole
 * documents would notify all of them once per post.
 */
export async function extractOutboundLinks(html, ownHost) {
  const found = [];
  const canonical = canonicalFromHtml(html) ?? `https://${ownHost}/`;

  const rewriter = new HTMLRewriter().on('.e-content a[href]', {
    element(el) {
      const href = el.getAttribute('href');
      if (!href) return;
      let absolute;
      try {
        absolute = new URL(href, canonical).toString();
      } catch {
        return;
      }
      if (!isSendableTarget(absolute, ownHost)) return;
      if (!found.includes(absolute)) found.push(absolute);
    },
  });

  await rewriter.transform(new Response(html)).text();
  return found;
}

function relTokens(value) {
  return String(value ?? '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * The endpoint advertised in an HTTP `Link` header, which the spec ranks above
 * anything in the document.
 *
 * `rel` is a space-separated token list, so matching is per-token — a value of
 * "webmentions" or "notawebmention" must not count.
 */
export function endpointFromLinkHeader(headerValue, baseUrl) {
  if (typeof headerValue !== 'string' || headerValue.trim() === '') return null;

  // Split on commas that separate values, not commas inside <...> or "...".
  const parts = headerValue.split(/,(?=\s*<)/);
  for (const part of parts) {
    const urlMatch = part.match(/<([^>]*)>/);
    if (!urlMatch) continue;
    const relMatch = part.match(/rel\s*=\s*"([^"]*)"|rel\s*=\s*([^;,\s]+)/i);
    if (!relMatch) continue;
    const rels = relTokens(relMatch[1] ?? relMatch[2]);
    if (!rels.includes('webmention')) continue;

    try {
      // An empty href means the target itself is the endpoint.
      return new URL(urlMatch[1], baseUrl).toString();
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * The endpoint advertised in the document — `<link>` or `<a>` carrying
 * rel=webmention, whichever appears first in document order.
 */
export async function endpointFromHtml(html, baseUrl) {
  let endpoint = null;

  const rewriter = new HTMLRewriter().on('link[rel], a[rel]', {
    element(el) {
      if (endpoint !== null) return;
      if (!relTokens(el.getAttribute('rel')).includes('webmention')) return;
      if (!el.hasAttribute('href')) return;
      // Bun's HTMLRewriter returns null from getAttribute for an empty
      // attribute, so href="" arrives as null even though the attribute is
      // present. The spec gives that case a meaning — the target page is its
      // own endpoint — so presence is checked separately and null coerced to ''.
      const href = el.getAttribute('href') ?? '';
      try {
        endpoint = new URL(href, baseUrl).toString();
      } catch {
        /* unresolvable href — keep looking */
      }
    },
  });

  await rewriter.transform(new Response(html)).text();
  return endpoint;
}

/**
 * Whether to attempt (source, target) now.
 *
 * A delivered pair is never retried — re-sending on every build would spam the
 * receiver. Failures and missing endpoints are retried, but capped: a site
 * without support today might add it later, yet re-probing forever costs a
 * request per link per run.
 */
export function shouldSend(ledger, source, target) {
  const record = ledger?.[source]?.[target];
  if (!record) return true;
  if (record.status === 'ok') return false;
  return (record.attempts ?? 0) < MAX_ATTEMPTS;
}

/** Returns a new ledger with this attempt recorded; never mutates the input. */
export function recordResult(ledger, source, target, result) {
  const previous = ledger?.[source]?.[target];
  return {
    ...ledger,
    [source]: {
      ...(ledger?.[source] ?? {}),
      [target]: {
        status: result.status,
        ...(result.code === undefined ? {} : { code: result.code }),
        attempts: (previous?.attempts ?? 0) + 1,
        at: result.at,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// I/O
// ---------------------------------------------------------------------------

function canonicalFromHtml(html) {
  const match = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i);
  return match ? match[1] : null;
}

/** Every built page that is a post — an h-entry with a body, so indexes are excluded. */
async function findPostPages(dir, pages = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      await findPostPages(path, pages);
    } else if (entry.name === 'index.html') {
      const html = await readFile(path, 'utf8');
      // The blog and TIL indexes are h-feeds of h-entry rows, but only a real
      // post page carries e-content.
      if (html.includes('h-entry') && html.includes('e-content')) {
        pages.push({ path, html, canonical: canonicalFromHtml(html) });
      }
    }
  }
  return pages;
}

async function discoverEndpoint(target) {
  const response = await fetch(target, {
    method: 'GET',
    headers: { 'User-Agent': USER_AGENT },
    redirect: 'follow',
  });

  // The response URL is the base for relative endpoints — it accounts for any
  // redirect the target performed.
  const base = response.url || target;

  const fromHeader = endpointFromLinkHeader(response.headers.get('link'), base);
  if (fromHeader) return fromHeader;

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('html')) return null;

  return endpointFromHtml(await response.text(), base);
}

async function sendWebmention(endpoint, source, target) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
    },
    body: new URLSearchParams({ source, target }).toString(),
    redirect: 'follow',
  });
  return response;
}

async function readLedger() {
  if (!existsSync(ledgerPath)) return {};
  try {
    return JSON.parse(await readFile(ledgerPath, 'utf8'));
  } catch (error) {
    throw new Error(`could not parse ${ledgerPath}: ${error.message}`);
  }
}

async function writeLedger(ledger) {
  // Sorted keys keep the committed diff readable and stable.
  const sorted = Object.fromEntries(
    Object.keys(ledger)
      .sort()
      .map((source) => [
        source,
        Object.fromEntries(
          Object.keys(ledger[source])
            .sort()
            .map((target) => [target, ledger[source][target]]),
        ),
      ]),
  );
  await writeFile(ledgerPath, `${JSON.stringify(sorted, null, 2)}\n`, 'utf8');
}

function sleep(ms) {
  return new Promise((done) => setTimeout(done, ms));
}

async function main() {
  const dryRun = process.argv.includes('--dry');
  const limitFlag = process.argv.indexOf('--limit');
  const limit = limitFlag === -1 ? Infinity : Number(process.argv[limitFlag + 1]);
  const now = new Date().toISOString();

  if (!existsSync(distDir)) {
    log('dist/ not found — run `bun run build` first.');
    process.exit(1);
  }

  let ledger = await readLedger();
  const pages = await findPostPages(distDir);
  log(`${pages.length} post page(s) in dist/`);

  const work = [];
  for (const page of pages) {
    if (!page.canonical) {
      log(`skipping ${page.path} — no canonical URL`);
      continue;
    }
    for (const target of await extractOutboundLinks(page.html, SITE_HOST)) {
      if (shouldSend(ledger, page.canonical, target)) {
        work.push({ source: page.canonical, target });
      }
    }
  }

  log(`${work.length} (source, target) pair(s) to attempt`);
  if (dryRun) {
    for (const { source, target } of work) log(`  would send ${source} -> ${target}`);
    log('--dry: nothing sent, ledger untouched');
    return;
  }

  let sent = 0;
  let noEndpoint = 0;
  let failed = 0;
  let attempted = 0;

  for (const { source, target } of work) {
    if (attempted >= limit) {
      log(`--limit ${limit} reached — ${work.length - attempted} pair(s) left for the next run`);
      break;
    }
    attempted += 1;

    let result;
    try {
      const endpoint = await discoverEndpoint(target);
      if (!endpoint) {
        result = { status: 'no-endpoint', at: now };
        noEndpoint += 1;
        log(`no endpoint: ${target}`);
      } else {
        const response = await sendWebmention(endpoint, source, target);
        if (response.ok) {
          result = { status: 'ok', code: response.status, at: now };
          sent += 1;
          log(`sent ${response.status}: ${target}`);
        } else {
          result = { status: 'failed', code: response.status, at: now };
          failed += 1;
          log(`failed ${response.status}: ${target}`);
        }
      }
    } catch (error) {
      // A dead host must not abort the whole run — record and move on.
      result = { status: 'failed', at: now };
      failed += 1;
      log(`error: ${target} (${error.message})`);
    }

    ledger = recordResult(ledger, source, target, result);
    await sleep(SEND_DELAY_MS);
  }

  await writeLedger(ledger);
  log(`done — ${sent} sent, ${noEndpoint} without an endpoint, ${failed} failed`);
  log(`wrote ${ledgerPath}`);
}

if (import.meta.main) {
  main().catch((error) => {
    log(`failed: ${error.message}`);
    process.exit(1);
  });
}
