// ABOUTME: Permalinks for blog posts and TILs, plus the sitemap lastmod index built from their frontmatter dates.
// ABOUTME: Used by astro.config.mjs, which reads the content files directly because astro:content isn't available there.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { load as loadYaml } from 'js-yaml';

export interface ContentEntry {
  path: string;
  collection: 'blog' | 'til';
  date: Date;
  draft: boolean;
}

/** File ids look like `2014-12-new-year-resolutions.mdx`; the slug drops the date prefix and extension. */
export function entrySlug(id: string): string {
  return id.replace(/^\d{4}-\d{2}-/, '').replace(/\.mdx?$/, '');
}

/**
 * Mirrors getStaticPaths in src/pages/[year]/[month]/[...slug].astro. The route
 * reads year and month in the build's local time; CI builds in UTC, so UTC here
 * matches production.
 */
export function postPath(id: string, date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `/${year}/${month}/${entrySlug(id)}/`;
}

export function tilPath(id: string): string {
  return `/til/${entrySlug(id)}/`;
}

function readFrontmatter(file: string): Record<string, unknown> {
  const match = readFileSync(file, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return match ? ((loadYaml(match[1]) as Record<string, unknown>) ?? {}) : {};
}

/** Reads every blog post and TIL under `contentDir` (normally src/content). */
export function readContentEntries(contentDir: string): ContentEntry[] {
  const collections = ['blog', 'til'] as const;
  return collections.flatMap((collection) => {
    const dir = join(contentDir, collection);
    return readdirSync(dir)
      .filter((id) => /\.mdx?$/.test(id))
      .map((id) => {
        const data = readFrontmatter(join(dir, id));
        const date = new Date(String(data.date));
        return {
          path: collection === 'blog' ? postPath(id, date) : tilPath(id),
          collection,
          date,
          draft: data.draft === true,
        };
      });
  });
}

const w3cDate = (date: Date) => date.toISOString().slice(0, 10);

/**
 * Maps page paths to the date their content last changed. Entries use their
 * own date; `/blog/`, `/til/` and `/` use the newest entry they list.
 */
export function lastmodIndex(entries: ContentEntry[]): Map<string, string> {
  const index = new Map<string, string>();
  const newest: Record<string, Date> = {};

  const bump = (path: string, date: Date) => {
    if (!newest[path] || date > newest[path]) newest[path] = date;
  };

  for (const entry of entries) {
    if (entry.draft) continue;
    index.set(entry.path, w3cDate(entry.date));
    bump(entry.collection === 'blog' ? '/blog/' : '/til/', entry.date);
    bump('/', entry.date);
  }

  for (const [path, date] of Object.entries(newest)) index.set(path, w3cDate(date));
  return index;
}
