// ABOUTME: Converts a built HTML page into the Markdown served to agents: YAML front matter, the <main> content, then the page's JSON-LD.
// ABOUTME: Runs at build time over dist/ (see src/integrations/agentMarkdown.ts); site chrome and other people's words (webmentions) are dropped.

import type { Element, Root, RootContent } from 'hast';
import { fromHtml } from 'hast-util-from-html';
import { select, selectAll } from 'hast-util-select';
import { toMdast } from 'hast-util-to-mdast';
import { toMarkdown } from 'mdast-util-to-markdown';
import { gfmToMarkdown } from 'mdast-util-gfm';
import { toString } from 'hast-util-to-string';
import { dump as dumpYaml } from 'js-yaml';

/** Suffix BaseLayout appends to page titles. */
export const SITE_NAME = 'The mind of Esteban';

/**
 * Removed from <main> before conversion. Decorative glyphs (aria-hidden),
 * the post meta line (its date is in the front matter), the author h-card
 * (also in the front matter) and webmentions, which are other people's words.
 */
export const DROP_SELECTORS = [
  '[aria-hidden="true"]',
  'script',
  'style',
  'template',
  'form',
  '.article__meta',
  '.author-hcard',
  '.responses',
];

interface Posting {
  '@type'?: string;
  datePublished?: string;
  author?: { name?: string };
  /** schema.org allows a list or one comma-separated string; src/lib/jsonLd.ts writes the string. */
  keywords?: string | string[];
}

function keywordList(keywords: Posting['keywords']): string[] {
  if (!keywords) return [];
  return Array.isArray(keywords) ? keywords : keywords.split(/\s*,\s*/).filter(Boolean);
}

function attr(node: Element | undefined, name: string): string | undefined {
  const value = node?.properties?.[name];
  return typeof value === 'string' ? value : undefined;
}

function removeMatching(root: Element, selectors: string[]): void {
  const doomed = new Set<RootContent>(selectAll(selectors.join(', '), root));
  const prune = (node: Element | Root) => {
    node.children = node.children.filter((child) => !doomed.has(child)) as typeof node.children;
    for (const child of node.children) if (child.type === 'element') prune(child);
  };
  prune(root);
}

/** Gives code blocks a language class, the only signal hast-util-to-mdast reads. */
function labelCode(root: Element): void {
  for (const pre of selectAll('pre[data-language]', root)) {
    const code = select('code', pre);
    if (code) code.properties.className = [`language-${attr(pre, 'dataLanguage')}`];
  }
  for (const code of selectAll('.shortcode-terminal code', root)) {
    code.properties.className = ['language-sh'];
  }
}

/** A quote's figcaption (tweets, Blockquote) moves inside the blockquote as an "— author" line. */
function foldQuoteCaptions(root: Element): void {
  for (const figure of selectAll('figure', root)) {
    const quote = select(':scope > blockquote', figure);
    const caption = select(':scope > figcaption', figure);
    if (!quote || !caption) continue;
    quote.children.push({
      type: 'element',
      tagName: 'p',
      properties: {},
      children: [{ type: 'text', value: '— ' }, ...caption.children],
    });
    figure.children = figure.children.filter((child) => child !== caption);
  }
}

function absolutize(root: Element, base: URL): void {
  for (const link of selectAll('a[href]', root)) {
    link.properties.href = new URL(attr(link, 'href')!, base).toString();
  }
  for (const img of selectAll('img[src]', root)) {
    img.properties.src = new URL(attr(img, 'src')!, base).toString();
    delete img.properties.srcSet;
  }
}

function frontMatter(doc: Root, pageUrl: string, postings: Posting[]): string {
  const rawTitle = toString(select('title', doc)!).trim();
  const suffix = ` — ${SITE_NAME}`;
  const data: Record<string, unknown> = {
    title: rawTitle.endsWith(suffix) ? rawTitle.slice(0, -suffix.length) : rawTitle,
    url: pageUrl,
  };
  const description = attr(select('meta[name="description"]', doc), 'content');
  if (description) data.description = description;

  const posting = postings.find((p) => p['@type'] === 'BlogPosting');
  if (posting) {
    if (posting.author?.name) data.author = posting.author.name;
    if (posting.datePublished) data.published = posting.datePublished.slice(0, 10);
    const tags = keywordList(posting.keywords);
    if (tags.length) data.tags = tags;
  }
  return `---\n${dumpYaml(data, { lineWidth: -1 })}---\n`;
}

export function pageToMarkdown(html: string, site: URL): string {
  const doc = fromHtml(html);
  const pageUrl = attr(select('link[rel="canonical"]', doc), 'href') ?? site.toString();
  const jsonLd = selectAll('script[type="application/ld+json"]', doc).map((s) =>
    toString(s).trim(),
  );
  const postings = jsonLd.map((text) => JSON.parse(text) as Posting);

  const main = select('main', doc);
  if (!main) throw new Error(`No <main> in ${pageUrl}`);

  removeMatching(main, DROP_SELECTORS);
  labelCode(main);
  foldQuoteCaptions(main);
  absolutize(main, new URL(pageUrl));

  const body = toMarkdown(toMdast(main), { extensions: [gfmToMarkdown()] }).trim();
  const ld = jsonLd.length ? `\n\n\`\`\`json\n${jsonLd.join('\n')}\n\`\`\`` : '';

  return `${frontMatter(doc, pageUrl, postings)}\n${body}${ld}\n`;
}
