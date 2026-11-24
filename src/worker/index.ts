// ABOUTME: Site Worker for estebantorr.es: serves the static build, and reports AI-crawler hits to Peec Crawl Insights.
// ABOUTME: Logging fails open and runs after the response, so visitors never wait on or see it; logic lives in crawlLog.ts.

import {
  isAiCrawler,
  accessLogEntry,
  peecRequestInit,
  PEEC_GENERIC_ACCESS_LOG_URL,
} from './crawlLog';

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

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const response = await env.ASSETS.fetch(request);
    try {
      reportCrawl(request, response, env, ctx);
    } catch (error) {
      console.error(`Peec access log skipped: ${String(error)}`);
    }
    return response;
  },
};
