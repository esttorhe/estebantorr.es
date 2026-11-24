// ABOUTME: Tests for content permalinks and the sitemap lastmod index built from content frontmatter.
// ABOUTME: Runs against the real src/content entries. Run with `bun test`.

import { test, expect } from 'bun:test';
import { postPath, tilPath, readContentEntries, lastmodIndex } from './contentPaths';

test('post permalinks keep the Hugo /:year/:month/:title/ shape', () => {
  expect(postPath('2014-12-new-year-resolutions.mdx', new Date('2014-12-31'))).toBe(
    '/2014/12/new-year-resolutions/',
  );
});

test('TIL permalinks are /til/:slug/', () => {
  expect(tilPath('2026-07-superfile-cli.mdx')).toBe('/til/superfile-cli/');
});

test('content entries are read from the real collections', () => {
  const entries = readContentEntries('src/content');
  const resolutions = entries.find((e) => e.path === '/2014/12/new-year-resolutions/');
  expect(resolutions).toEqual({
    path: '/2014/12/new-year-resolutions/',
    collection: 'blog',
    date: new Date('2014-12-31'),
    draft: false,
  });
  expect(entries.some((e) => e.collection === 'til')).toBe(true);
});

test('each entry gets its date as a W3C date', () => {
  const index = lastmodIndex([
    { path: '/2014/12/a/', collection: 'blog', date: new Date('2014-12-31'), draft: false },
  ]);
  expect(index.get('/2014/12/a/')).toBe('2014-12-31');
});

test('drafts are left out', () => {
  const index = lastmodIndex([
    { path: '/2026/01/wip/', collection: 'blog', date: new Date('2026-01-02'), draft: true },
  ]);
  expect(index.has('/2026/01/wip/')).toBe(false);
});

// The home page and the two indexes change whenever an entry is published.
test('index pages take the newest entry date of what they list', () => {
  const index = lastmodIndex([
    { path: '/2020/05/old/', collection: 'blog', date: new Date('2020-05-01'), draft: false },
    { path: '/2024/03/new/', collection: 'blog', date: new Date('2024-03-09'), draft: false },
    { path: '/til/x/', collection: 'til', date: new Date('2025-01-15'), draft: false },
    { path: '/til/wip/', collection: 'til', date: new Date('2026-01-01'), draft: true },
  ]);
  expect(index.get('/blog/')).toBe('2024-03-09');
  expect(index.get('/til/')).toBe('2025-01-15');
  expect(index.get('/')).toBe('2025-01-15');
});
