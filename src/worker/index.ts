// ABOUTME: Site Worker for estebantorr.es: serves the static build, hands agents the Markdown version, and reports AI-crawler hits to Peec.
// ABOUTME: Routing logic lives in agentMarkdown.ts, logging in crawlLog.ts; logging fails open and runs after the response.

import {
  isAiCrawler,
  accessLogEntry,
  peecRequestInit,
  PEEC_GENERIC_ACCESS_LOG_URL,
} from './crawlLog';
import {
  prefersMarkdown,
  negotiatedMarkdownPath,
  aliasMarkdownPath,
  markdownContentType,
  markdownHeaders,
} from './agentMarkdown';

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  /** Generic webhook API key from Peec's Crawl Insights setup. Secret. */
  PEEC_API_KEY?: string;
  /** The x-org-id value from the same setup screen. Secret. */
  PEEC_ORG_ID?: string;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

function reportCrawl(request: Request, response: Response, env: Env, ctx: ExecutionContext): void {
  if (!env.PEEC_API_KEY || !env.PEEC_ORG_ID) return;
  if (!isAiCrawler(request.headers.get('User-Agent'))) return;

  const country = (request as Request & { cf?: { country?: string } }).cf?.country;
  const entry = accessLogEntry(request, response.status, country, new Date());
  const init = peecRequestInit(entry, { apiKey: env.PEEC_API_KEY, orgId: env.PEEC_ORG_ID });

  ctx.waitUntil(
    fetch(PEEC_GENERIC_ACCESS_LOG_URL, { ...init, signal: AbortSignal.timeout(10_000) })
      .then((peecResponse) => {
        // Log the status only; the request carries the API key.
        if (!peecResponse.ok) console.error(`Peec access log rejected: ${peecResponse.status}`);
      })
      .catch((error: unknown) => console.error(`Peec access log failed: ${String(error)}`)),
  );
}

/** Serves a build-time index.md with the Markdown headers; a missing file passes through as-is. */
async function serveMarkdown(
  request: Request,
  env: Env,
  markdownPath: string,
  contentType: string,
): Promise<Response> {
  const url = new URL(request.url);
  const asset = await env.ASSETS.fetch(new Request(new URL(markdownPath, url), request));
  if (!asset.ok) return asset;
  const pageUrl = new URL(markdownPath.slice(0, -'index.md'.length), url).toString();
  return new Response(asset.body, { status: 200, headers: markdownHeaders(pageUrl, contentType) });
}

async function serve(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return env.ASSETS.fetch(request);

  const { pathname } = new URL(request.url);
  const accept = request.headers.get('Accept');

  const alias = aliasMarkdownPath(pathname);
  if (alias) return serveMarkdown(request, env, alias, markdownContentType(accept));
  if (pathname.endsWith('/index.md')) {
    return serveMarkdown(request, env, pathname, markdownContentType(accept));
  }

  const negotiated = negotiatedMarkdownPath(pathname);
  if (negotiated && prefersMarkdown(accept)) {
    const markdown = await serveMarkdown(request, env, negotiated, 'text/markdown; charset=utf-8');
    // A URL with no Markdown version (404 page, redirects) falls back to HTML.
    if (markdown.ok) return markdown;
  }

  const response = await env.ASSETS.fetch(request);
  if (!negotiated) return response;
  // Pages have two representations, so caches must key on Accept.
  const varied = new Response(response.body, response);
  varied.headers.append('Vary', 'Accept');
  return varied;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const response = await serve(request, env);
    try {
      reportCrawl(request, response, env, ctx);
    } catch (error) {
      console.error(`Peec access log skipped: ${String(error)}`);
    }
    return response;
  },
};
