// ABOUTME: Tests for the generated /llms.txt body (llmstxt.org format).
// ABOUTME: Run with `bun test`.

import { test, expect } from 'bun:test';
import { buildLlmsTxt } from './llmsTxt';

const site = new URL('https://estebantorr.es');

const body = buildLlmsTxt(site, {
  posts: [
    {
      path: '/2014/12/new-year-resolutions/',
      title: 'New Year Resolutions',
      description: 'Reflecting on 2014.',
      date: new Date('2014-12-31'),
    },
    { path: '/2020/05/career-change/', title: 'Career change', date: new Date('2020-05-01') },
  ],
  tils: [
    {
      path: '/til/superfile-cli/',
      title: 'Superfile CLI',
      description: 'A terminal file manager.',
      date: new Date('2026-07-30'),
    },
  ],
});

test('starts with the H1 and a blockquote summary, as the spec orders them', () => {
  const lines = body.split('\n');
  expect(lines[0]).toBe('# Esteban Torres');
  expect(lines[1]).toBe('');
  expect(lines[2].startsWith('> ')).toBe(true);
});

test('page links point at the Markdown version, with absolute URLs', () => {
  expect(body).toContain('- [About](https://estebantorr.es/about/index.md)');
  expect(body).not.toMatch(/\]\(\//);
});

test('posts are listed newest first, with descriptions as notes when present', () => {
  const posts = body.slice(body.indexOf('## Writing'), body.indexOf('## Today I Learned'));
  expect(posts.indexOf('Career change')).toBeLessThan(posts.indexOf('New Year Resolutions'));
  expect(posts).toContain(
    '- [New Year Resolutions](https://estebantorr.es/2014/12/new-year-resolutions/index.md): Reflecting on 2014.',
  );
  expect(posts).toContain(
    '- [Career change](https://estebantorr.es/2020/05/career-change/index.md)\n',
  );
});

test('TILs get their own section', () => {
  expect(body).toContain(
    '## Today I Learned\n\n- [Superfile CLI](https://estebantorr.es/til/superfile-cli/index.md): A terminal file manager.',
  );
});

test('secondary links sit under Optional, the last section', () => {
  const optional = body.slice(body.indexOf('## Optional'));
  expect(optional).toContain('https://estebantorr.es/library/index.md');
  // Feeds are not pages, so they keep their own URL.
  expect(optional).toContain('(https://estebantorr.es/rss.xml)');
  expect(body.lastIndexOf('## ')).toBe(body.indexOf('## Optional'));
});
