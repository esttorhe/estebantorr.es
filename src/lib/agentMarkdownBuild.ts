// ABOUTME: Writes index.md next to every built page, and checks a whole build for missing or broken Markdown.
// ABOUTME: The writer runs from the astro:build:done hook; the checker runs in CI after the build and fails the deploy.

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { load as loadYaml } from 'js-yaml';
import { pageToMarkdown } from './agentMarkdown';
import { isIndexedPage } from './indexedPages';

/** Strings that only appear in sections the converter drops. */
const DROPPED_MARKERS = ['webmention.io/estebantorr.es/webmention', 'Wrote about this?'];

/** `pathnames` are Astro build pathnames: '' for the home page, 'about/' and so on. */
export function writeAgentMarkdown(distDir: string, pathnames: string[], site: URL): number {
  let written = 0;
  for (const pathname of pathnames) {
    if (!isIndexedPage(`/${pathname}`)) continue;
    const htmlFile = join(distDir, pathname, 'index.html');
    if (!existsSync(htmlFile)) continue;
    const markdown = pageToMarkdown(readFileSync(htmlFile, 'utf8'), site);
    writeFileSync(join(distDir, pathname, 'index.md'), markdown);
    written += 1;
  }
  return written;
}

/** Returns one line per problem; an empty list means the build is good. */
export function checkAgentMarkdown(distDir: string): string[] {
  const sitemaps = readdirSync(distDir).filter((f) => /^sitemap-\d+\.xml$/.test(f));
  if (sitemaps.length === 0) return ['no sitemap-*.xml found'];

  const urls = sitemaps.flatMap((f) =>
    [...readFileSync(join(distDir, f), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]),
  );

  const problems: string[] = [];
  for (const url of urls) {
    const path = new URL(url).pathname;
    const mdFile = join(distDir, path, 'index.md');
    if (!existsSync(mdFile)) {
      problems.push(`${path}: missing index.md`);
      continue;
    }
    const markdown = readFileSync(mdFile, 'utf8');

    const match = markdown.match(/^---\n([\s\S]*?)\n---\n/);
    let data: Record<string, unknown> | undefined;
    try {
      data = match ? (loadYaml(match[1]) as Record<string, unknown>) : undefined;
    } catch {
      data = undefined;
    }
    if (!data || typeof data.title !== 'string') {
      problems.push(`${path}: front matter does not parse`);
      continue;
    }
    if (data.url !== url) problems.push(`${path}: front matter url is ${data.url}`);

    const leaked = DROPPED_MARKERS.find((marker) => markdown.includes(marker));
    if (leaked) problems.push(`${path}: contains dropped content (${leaked})`);
  }
  return problems;
}
