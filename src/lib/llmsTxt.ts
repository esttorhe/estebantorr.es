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
    'The writing is the main content: long-form posts under Writing, and short notes under Today I Learned. Each link goes to the HTML page.',
    '',
    '## About',
    '',
    link(site, 'About', '/about/', 'Who Esteban is and what he works on'),
    link(site, 'CV', '/cv/', 'Work history and skills'),
    link(site, 'Talks', '/talks/', 'Conference and meetup talks'),
    link(site, 'Portfolio', '/portfolio/', 'Selected projects'),
    '',
    '## Writing',
    '',
    ...newestFirst(content.posts).map((p) => link(site, p.title, p.path, p.description)),
    '',
    '## Today I Learned',
    '',
    ...newestFirst(content.tils).map((t) => link(site, t.title, t.path, t.description)),
    '',
    '## Optional',
    '',
    link(site, 'Library', '/library/', 'Books read, with ratings and reviews'),
    link(site, 'RSS feed', '/rss.xml'),
    link(site, 'Sitemap', '/sitemap-index.xml'),
    '',
  ].join('\n');
}
