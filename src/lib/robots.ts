// ABOUTME: Builds the robots.txt body: content signals and AIPREF usage preferences, AI training crawler blocks, and the sitemap reference.
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

/** The site's AI usage policy. Both robots.txt vocabularies below are derived from it. */
const AI_POLICY = { search: true, aiInput: true, aiTrain: false };

/**
 * Cloudflare's Content Signals (https://contentsignals.org). Shared with the
 * Worker, which sends the same policy as a header on Markdown responses.
 */
export const CONTENT_SIGNALS = [
  `search=${AI_POLICY.search ? 'yes' : 'no'}`,
  `ai-train=${AI_POLICY.aiTrain ? 'yes' : 'no'}`,
  `ai-input=${AI_POLICY.aiInput ? 'yes' : 'no'}`,
].join(',');

/**
 * The IETF AIPREF equivalent (draft-ietf-aipref-vocab-08, draft-ietf-aipref-attach-05).
 * Still a draft: if the labels change, update them here. AIPREF's "search" also
 * covers training models used only for search, so it is slightly broader than
 * Content Signals' search=yes.
 */
export const CONTENT_USAGE = [
  `search=${AI_POLICY.search ? 'y' : 'n'}`,
  `ai-use=${AI_POLICY.aiInput ? 'y' : 'n'}`,
  `train-ai=${AI_POLICY.aiTrain ? 'y' : 'n'}`,
].join(', ');

export function buildRobotsTxt(site: URL): string {
  return [
    // Vocabulary per https://contentsignals.org: search, ai-input, ai-train — each yes or no.
    '# Content signals: search allowed, AI training not allowed, AI input (answers, grounding) allowed.',
    'User-agent: *',
    `Content-Signal: ${CONTENT_SIGNALS}`,
    `Content-Usage: ${CONTENT_USAGE}`,
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
