// ABOUTME: Builds the robots.txt body: content signals, AI training crawler blocks, and the sitemap reference.
// ABOUTME: Served by src/pages/robots.txt.ts; the sitemap URL is derived from the configured site.

/** AI training crawlers that get `Disallow: /`. */
const TRAINING_CRAWLERS = [
  'Amazonbot',
  'Applebot-Extended',
  'Bytespider',
  'CCBot',
  'ClaudeBot',
  'Diffbot',
  'Google-Extended',
  'GPTBot',
  'omgili',
  'anthropic-ai',
  'Claude-Web',
  'cohere-ai',
  'MistralAI-Training',
  'meta-externalagent',
  'GoogleOther',
  'Baiduspider',
  'AwarioSmartBot',
  'AwarioRssBot',
  'QualifiedBot',
  'Cotoyogi',
  'ICC-Crawler',
  'atlassian-bot',
  'FishBot',
  'BorderxBot',
  'NavuBot',
  'SemrushBot-SWA',
  'WARDBot',
  'magpie-crawler',
  'KimiBot',
  'CitibotSiteCrawler',
];

/** Shared with the Worker, which sends the same policy as a header on Markdown responses. */
export const CONTENT_SIGNALS = 'search=yes,ai-train=no,ai-input=yes';

export function buildRobotsTxt(site: URL): string {
  return [
    // Vocabulary per https://contentsignals.org: search, ai-input, ai-train — each yes or no.
    '# Content signals: search allowed, AI training not allowed, AI input (answers, grounding) allowed.',
    'User-agent: *',
    `Content-Signal: ${CONTENT_SIGNALS}`,
    'Allow: /',
    '',
    '# Training crawlers',
    ...TRAINING_CRAWLERS.map((bot) => `User-agent: ${bot}`),
    'Disallow: /',
    '',
    // @astrojs/sitemap writes sitemap-index.xml at the site root.
    `Sitemap: ${new URL('sitemap-index.xml', site)}`,
    '',
  ].join('\n');
}
