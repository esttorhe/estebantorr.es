// ABOUTME: Builds the /llms.txt body in the llmstxt.org format: H1, blockquote summary, then H2 link lists.
// ABOUTME: Served by src/pages/llms.txt.ts; entries come from the blog and TIL collections.

export interface LlmsEntry {
  path: string;
  title: string;
  description?: string;
  date: Date;
}

const link = (site: URL, title: string, path: string, notes?: string) =>
  `- [${title}](${new URL(path, site)})${notes ? `: ${notes}` : ''}`;

/** Pages link to the Markdown agents get, written next to each page at build time. */
const pageLink = (site: URL, title: string, path: string, notes?: string) =>
  link(site, title, `${path}index.md`, notes);

const newestFirst = (entries: LlmsEntry[]) => [...entries].sort((a, b) => +b.date - +a.date);

export function buildLlmsTxt(
  site: URL,
  content: { posts: LlmsEntry[]; tils: LlmsEntry[] },
): string {
  return [
    '# Esteban Torres',
    '',
    '> Personal site of Esteban Torres, an Engineering Manager at Peec AI. Costa Rican, living in Berlin. Writes mostly about engineering, leadership and productivity.',
    '',
    'The writing is the main content: long-form posts under Writing, and short notes under Today I Learned. Each link goes to the Markdown version of the page; drop index.md from a URL for the HTML page.',
    '',
    '## About',
    '',
    pageLink(site, 'About', '/about/', 'Who Esteban is and what he works on'),
    pageLink(site, 'CV', '/cv/', 'Work history and skills'),
    pageLink(
      site,
      'Services',
      '/services/',
      'Fractional CTO, software development, engineering leadership coaching, SOC 2 / ISO 27001 groundwork; limited availability',
    ),
    pageLink(site, 'Talks', '/talks/', 'Conference and meetup talks'),
    pageLink(site, 'Portfolio', '/portfolio/', 'Selected projects'),
    '',
    '## Writing',
    '',
    ...newestFirst(content.posts).map((p) => pageLink(site, p.title, p.path, p.description)),
    '',
    '## Today I Learned',
    '',
    ...newestFirst(content.tils).map((t) => pageLink(site, t.title, t.path, t.description)),
    '',
    '## Optional',
    '',
    pageLink(site, 'Library', '/library/', 'Books read, with ratings and reviews'),
    link(site, 'RSS feed', '/rss.xml'),
    link(site, 'Sitemap', '/sitemap-index.xml'),
    '',
  ].join('\n');
}
