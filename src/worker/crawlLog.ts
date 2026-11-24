// ABOUTME: Pure logic for forwarding AI-crawler hits to Peec's Generic webhook (Crawl Insights).
// ABOUTME: Split out from the site Worker's fetch handler so it is testable with bun test.

export const PEEC_GENERIC_ACCESS_LOG_URL = 'https://api.peec.ai/agent-analytics/generic-access-log';

/**
 * User-agent tokens Peec counts as AI crawlers, matched case-insensitively.
 * Peec drops every other user agent at ingest, so sending them would only leak
 * visitor data. Source: DETECTABLE_BOT_REGEX in Peec's
 * types/consts/AGENT_ANALYTICS_PROVIDER_MAPPINGS.ts.
 */
const AI_CRAWLER_TOKENS = [
  'gptbot',
  'anthropic-ai',
  'google-extended',
  'meta-externalagent',
  'applebot-extended',
  'amazonbot',
  'bytespider',
  'ccbot',
  'ai2bot',
  'ai2bot-dolma',
  'cohere-ai',
  'cohere-training-data-crawler',
  'deepseekbot',
  'pangubot',
  'webzio-extended',
  'firecrawlagent',
  'diffbot',
  'brightbot',
  'facebookbot',
  'omgili',
  'timpibot',
  'grokbot',
  'oai-searchbot',
  'claude-searchbot',
  'perplexitybot',
  'amzn-searchbot',
  'azureai-searchbot',
  'google-cloudvertexbot',
  'meta-webindexer',
  'applebot',
  'grok-deepsearch',
  'xai-grok',
  'exasearchbot',
  'shapbot',
  'chatgpt-user',
  'claude-user',
  'perplexity-user',
  'manus-user',
  'googleagent-mariner',
  'novaact',
  'gemini-deep-research',
  'mistralai-user',
  'duckassistbot',
  'quillbot.com',
  'meta-externalfetcher',
  'claude-code',
  'exauser',
  'shap-user',
  'mycentralaiscraperbot',
  'google-agent',
  'omgilibot',
  'claudebot',
  'claude-web',
  'youbot',
];

/** One entry of the JSON array the Generic webhook accepts. */
export interface AccessLogEntry {
  timestamp: string;
  request_method: string;
  request_url: string;
  response_status: number;
  user_agent: string;
  country_code?: string;
  client_ip?: string;
  referer?: string;
}

export interface PeecCredentials {
  apiKey: string;
  orgId: string;
}

export function isAiCrawler(userAgent: string | null): boolean {
  if (!userAgent) return false;
  const haystack = userAgent.toLowerCase();
  return AI_CRAWLER_TOKENS.some((token) => haystack.includes(token));
}

// Cloudflare reports XX for unknown and T1 for Tor; Peec only accepts real
// ISO 3166 alpha-2 codes and rejects the whole entry otherwise.
function usableCountryCode(country: string | undefined): string | undefined {
  if (!country || !/^[A-Z]{2}$/.test(country) || country === 'XX') return undefined;
  return country;
}

export function accessLogEntry(
  request: Request,
  responseStatus: number,
  country: string | undefined,
  now: Date,
): AccessLogEntry {
  const entry: AccessLogEntry = {
    timestamp: now.toISOString(),
    request_method: request.method,
    request_url: request.url,
    response_status: responseStatus,
    user_agent: request.headers.get('User-Agent') ?? '',
  };

  const countryCode = usableCountryCode(country);
  if (countryCode) entry.country_code = countryCode;

  const clientIp = request.headers.get('CF-Connecting-IP');
  if (clientIp) entry.client_ip = clientIp;

  const referer = request.headers.get('Referer');
  if (referer) entry.referer = referer;

  return entry;
}

export function peecRequestInit(entry: AccessLogEntry, credentials: PeecCredentials): RequestInit {
  return {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${credentials.apiKey}`,
      'x-org-id': credentials.orgId,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([entry]),
  };
}
