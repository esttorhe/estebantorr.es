// ABOUTME: Regenerates src/data/webmentions.json from the webmention.io domain feed, and self-hosts sender avatars under public/assets/images/webmentions/.
// ABOUTME: Mentions are merged into the committed cache rather than replacing it, so the archive survives webmention.io going away.
//
// Usage:
//   bun run webmentions:sync            # needs WEBMENTION_IO_TOKEN in the environment
//   bun run webmentions:sync -- --dry   # fetch + report, write nothing
//
// The token comes from webmention.io once you sign in with your domain (it is
// shown on the dashboard). Only the whole-domain query needs it; the per-page
// `?target=` endpoint is public.
//
// For local runs, put it in `.env` (gitignored) — bun loads that automatically,
// so there is nothing to export. CI reads it from the WEBMENTION_IO_TOKEN
// repository secret; see .github/workflows/sync-webmentions.yml.

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

// Shared with the site so the two can never disagree about what counts as the
// same page. Run this script with bun (see package.json) — it transpiles the
// .ts import natively.
import { normalizeTarget, classifyProperty } from '../src/lib/webmentionTarget.ts';

export { normalizeTarget, classifyProperty };

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

const SITE_DOMAIN = 'estebantorr.es';
const API_BASE = 'https://webmention.io/api/mentions.jf2';
const PER_PAGE = 100;

const outputJsonPath = resolve(projectRoot, 'src', 'data', 'webmentions.json');
const avatarsDir = resolve(projectRoot, 'public', 'assets', 'images', 'webmentions');
const avatarsPublicPrefix = '/assets/images/webmentions';

function log(msg) {
  process.stdout.write(`[sync-webmentions] ${msg}\n`);
}

// ---------------------------------------------------------------------------
// Pure transforms (exported for scripts/sync-webmentions.test.mjs)
// ---------------------------------------------------------------------------

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}

// A stable, filesystem-safe filename stem for a sender's avatar. Keyed on the
// author URL (not the photo URL, which webmention.io rotates) so a re-sync
// finds the file already on disk and skips the download.
export function avatarSlug(authorUrl) {
  const digest = createHash('sha1')
    .update(String(authorUrl ?? ''))
    .digest('hex')
    .slice(0, 12);
  const host = hostOf(authorUrl);
  if (!host) return digest;
  const hostStem = host
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${hostStem}-${digest}`;
}

// Trims a JF2 entry down to the fields the UI actually renders. Text is kept in
// full rather than truncated — owning the mention is the whole point of syncing
// it into the repo, so the UI clamps visually instead.
export function shapeMention(raw) {
  const author = raw.author ?? {};
  const text = typeof raw.content?.text === 'string' ? raw.content.text.trim() : '';
  const title = typeof raw.name === 'string' ? raw.name.trim() : '';

  const shaped = {
    id: raw['wm-id'],
    type: raw['wm-property'],
    url: raw.url,
    published: raw.published || raw['wm-received'],
    author: {
      // Anonymous senders still deserve a card, and the source host is the most
      // honest label available.
      name: (typeof author.name === 'string' && author.name.trim()) || hostOf(raw.url) || 'Someone',
      url: author.url,
      // Replaced with a local path once the avatar is downloaded.
      photo: author.photo,
    },
  };

  if (text) shaped.text = text;
  if (title) shaped.title = title;

  return shaped;
}

// Union of the committed cache and a fresh fetch, deduped by wm-id with the
// incoming copy winning (senders edit their posts). Sorted by id so a sync that
// found nothing new produces an empty diff instead of a reshuffled file.
export function mergeMentions(existing = [], incoming = []) {
  const byId = new Map();
  for (const mention of existing) byId.set(mention.id, mention);
  for (const mention of incoming) byId.set(mention.id, mention);
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

export function groupByTarget(rawMentions) {
  const grouped = {};

  for (const raw of rawMentions) {
    const bucket = classifyProperty(raw['wm-property']);
    if (bucket === 'ignore') continue;

    const target = normalizeTarget(raw['wm-target']);
    if (!target) continue;

    grouped[target] ??= { responses: [], reactions: [] };
    grouped[target][bucket === 'response' ? 'responses' : 'reactions'].push(shapeMention(raw));
  }

  return grouped;
}

// ---------------------------------------------------------------------------
// I/O
// ---------------------------------------------------------------------------

async function fetchAllMentions(token) {
  const all = [];

  for (let page = 0; ; page += 1) {
    const url = new URL(API_BASE);
    url.searchParams.set('domain', SITE_DOMAIN);
    url.searchParams.set('token', token);
    url.searchParams.set('per-page', String(PER_PAGE));
    url.searchParams.set('page', String(page));

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `webmention.io returned ${response.status} ${response.statusText} for page ${page}`,
      );
    }

    const body = await response.json();
    const children = Array.isArray(body.children) ? body.children : [];
    all.push(...children);
    log(`fetched page ${page} — ${children.length} mention(s)`);

    if (children.length < PER_PAGE) break;
  }

  return all;
}

async function readExistingCache() {
  if (!existsSync(outputJsonPath)) return { targets: {} };
  try {
    const parsed = JSON.parse(await readFile(outputJsonPath, 'utf8'));
    return { targets: parsed.targets ?? {} };
  } catch (error) {
    throw new Error(`could not parse the existing ${outputJsonPath}: ${error.message}`);
  }
}

function extensionFromContentType(contentType) {
  if (!contentType) return null;
  if (contentType.includes('jpeg')) return 'jpg';
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('gif')) return 'gif';
  if (contentType.includes('svg')) return 'svg';
  return null;
}

// Maps an avatar slug to its existing filename on disk, so a re-sync skips the
// network entirely for senders already cached.
async function existingAvatarsBySlug() {
  if (!existsSync(avatarsDir)) return new Map();
  const files = await readdir(avatarsDir);
  const bySlug = new Map();
  for (const file of files) {
    const stem = file.slice(0, file.length - extname(file).length);
    bySlug.set(stem, file);
  }
  return bySlug;
}

// Downloads each sender's avatar into public/ and rewrites author.photo to the
// local path. Hotlinking would put a webmention.io request on every reader's
// page load — exactly the third-party runtime dependency that syncing at build
// time exists to avoid.
async function localizeAvatars(grouped, { dryRun }) {
  const cached = await existingAvatarsBySlug();
  const resolvedBySlug = new Map();
  let downloaded = 0;
  let failed = 0;

  const allMentions = Object.values(grouped).flatMap((bucket) => [
    ...bucket.responses,
    ...bucket.reactions,
  ]);

  for (const mention of allMentions) {
    const remotePhoto = mention.author.photo;
    if (typeof remotePhoto !== 'string' || remotePhoto.trim() === '') {
      delete mention.author.photo;
      continue;
    }

    const slug = avatarSlug(mention.author.url ?? mention.url);

    if (resolvedBySlug.has(slug)) {
      mention.author.photo = resolvedBySlug.get(slug);
      continue;
    }

    if (cached.has(slug)) {
      const localPath = `${avatarsPublicPrefix}/${cached.get(slug)}`;
      resolvedBySlug.set(slug, localPath);
      mention.author.photo = localPath;
      continue;
    }

    if (dryRun) {
      log(`would download avatar for ${mention.author.name}`);
      delete mention.author.photo;
      continue;
    }

    try {
      const response = await fetch(remotePhoto);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const ext =
        extensionFromContentType(response.headers.get('content-type')) ||
        extname(new URL(remotePhoto).pathname).replace('.', '') ||
        'jpg';

      await mkdir(avatarsDir, { recursive: true });
      const filename = `${slug}.${ext}`;
      await writeFile(resolve(avatarsDir, filename), Buffer.from(await response.arrayBuffer()));

      const localPath = `${avatarsPublicPrefix}/${filename}`;
      resolvedBySlug.set(slug, localPath);
      mention.author.photo = localPath;
      downloaded += 1;
    } catch (error) {
      // A dead avatar must not fail the sync — the card falls back to initials.
      log(`avatar failed for ${mention.author.name} (${error.message}) — falling back to initials`);
      delete mention.author.photo;
      failed += 1;
    }
  }

  return { downloaded, failed };
}

function mergeIntoCache(existingTargets, incomingTargets) {
  const merged = {};

  for (const target of new Set([
    ...Object.keys(existingTargets),
    ...Object.keys(incomingTargets),
  ])) {
    const before = existingTargets[target] ?? { responses: [], reactions: [] };
    const after = incomingTargets[target] ?? { responses: [], reactions: [] };
    merged[target] = {
      responses: mergeMentions(before.responses, after.responses),
      reactions: mergeMentions(before.reactions, after.reactions),
    };
  }

  // Sorted keys keep the committed file's diff readable.
  return Object.fromEntries(
    Object.keys(merged)
      .sort()
      .map((key) => [key, merged[key]]),
  );
}

function countMentions(targets) {
  return Object.values(targets).reduce(
    (total, bucket) => total + bucket.responses.length + bucket.reactions.length,
    0,
  );
}

async function main() {
  const dryRun = process.argv.includes('--dry');
  const token = process.env.WEBMENTION_IO_TOKEN;

  if (!token) {
    log(
      'WEBMENTION_IO_TOKEN is not set — sign in at https://webmention.io with your domain to get one.',
    );
    process.exit(1);
  }

  const existing = await readExistingCache();
  const existingCount = countMentions(existing.targets);

  const raw = await fetchAllMentions(token);
  log(`${raw.length} mention(s) in the domain feed`);

  const incoming = groupByTarget(raw);
  const avatars = await localizeAvatars(incoming, { dryRun });
  const targets = mergeIntoCache(existing.targets, incoming);
  const total = countMentions(targets);

  log(
    `${total} mention(s) across ${Object.keys(targets).length} page(s) — ` +
      `${total - existingCount} new, ${avatars.downloaded} avatar(s) downloaded, ${avatars.failed} failed`,
  );

  if (dryRun) {
    log('--dry: nothing written');
    return;
  }

  const payload = {
    // Written by scripts/sync-webmentions.mjs — see the header there.
    syncedAt: new Date().toISOString(),
    targets,
  };

  await writeFile(outputJsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  log(`wrote ${outputJsonPath}`);
}

// Only run when invoked directly, so the test file can import the transforms.
if (import.meta.main) {
  main().catch((error) => {
    log(`failed: ${error.message}`);
    process.exit(1);
  });
}
