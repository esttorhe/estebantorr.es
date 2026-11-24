// ABOUTME: Tests for writing index.md files next to built pages, and for the whole-build check that blocks a deploy.
// ABOUTME: Uses a throwaway dist/ in the OS temp dir. Run with `bun test`.

import { test, expect, beforeEach } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeAgentMarkdown, checkAgentMarkdown } from './agentMarkdownBuild';

const site = new URL('https://estebantorr.es');
let dist: string;

function html(path: string, main: string) {
  return `<!doctype html><html><head><title>Page — The mind of Esteban</title>
<link rel="canonical" href="https://estebantorr.es${path}"></head>
<body><main id="main">${main}</main></body></html>`;
}

function writePage(path: string, main = '<h1>Page</h1>') {
  mkdirSync(join(dist, path), { recursive: true });
  writeFileSync(join(dist, path, 'index.html'), html(path, main));
}

function writeSitemap(paths: string[]) {
  const urls = paths.map((p) => `<url><loc>https://estebantorr.es${p}</loc></url>`).join('');
  writeFileSync(join(dist, 'sitemap-0.xml'), `<?xml version="1.0"?><urlset>${urls}</urlset>`);
}

beforeEach(() => {
  if (dist) rmSync(dist, { recursive: true, force: true });
  dist = mkdtempSync(join(tmpdir(), 'agent-md-'));
});

// ---------------------------------------------------------------------------
// writeAgentMarkdown
// ---------------------------------------------------------------------------

test('writes index.md next to each built page, using Astro build pathnames', () => {
  writePage('/');
  writePage('/about/');
  const written = writeAgentMarkdown(dist, ['', 'about/'], site);
  expect(written).toBe(2);
  expect(readFileSync(join(dist, 'about', 'index.md'), 'utf8')).toContain(
    'url: https://estebantorr.es/about/',
  );
  expect(existsSync(join(dist, 'index.md'))).toBe(true);
});

test('skips the CV print source and endpoints that are not HTML pages', () => {
  writePage('/cv/print/');
  writeFileSync(join(dist, 'llms.txt'), 'x');
  expect(writeAgentMarkdown(dist, ['cv/print/', 'llms.txt'], site)).toBe(0);
  expect(existsSync(join(dist, 'cv', 'print', 'index.md'))).toBe(false);
});

// ---------------------------------------------------------------------------
// checkAgentMarkdown
// ---------------------------------------------------------------------------

test('a complete build has no problems', () => {
  writePage('/');
  writePage('/about/');
  writeSitemap(['/', '/about/']);
  writeAgentMarkdown(dist, ['', 'about/'], site);
  expect(checkAgentMarkdown(dist)).toEqual([]);
});

test('a sitemap page without index.md is a problem', () => {
  writePage('/about/');
  writeSitemap(['/about/']);
  expect(checkAgentMarkdown(dist)).toEqual(['/about/: missing index.md']);
});

test('front matter that does not parse, or names another URL, is a problem', () => {
  writePage('/a/');
  writePage('/b/');
  writeSitemap(['/a/', '/b/']);
  writeFileSync(join(dist, 'a', 'index.md'), '---\ntitle: [unclosed\n---\n\n# A\n');
  writeFileSync(
    join(dist, 'b', 'index.md'),
    '---\ntitle: B\nurl: https://estebantorr.es/elsewhere/\n---\n\n# B\n',
  );
  expect(checkAgentMarkdown(dist)).toEqual([
    '/a/: front matter does not parse',
    '/b/: front matter url is https://estebantorr.es/elsewhere/',
  ]);
});

// The webmention form posts to webmention.io; seeing it means the responses
// section survived the drop list.
test('a dropped section leaking into the Markdown is a problem', () => {
  writePage('/post/');
  writeSitemap(['/post/']);
  writeFileSync(
    join(dist, 'post', 'index.md'),
    '---\ntitle: Post\nurl: https://estebantorr.es/post/\n---\n\nSend to https://webmention.io/estebantorr.es/webmention\n',
  );
  expect(checkAgentMarkdown(dist)).toEqual([
    '/post/: contains dropped content (webmention.io/estebantorr.es/webmention)',
  ]);
});

test('a build with no sitemap is a problem, not a pass', () => {
  expect(checkAgentMarkdown(dist)).toEqual(['no sitemap-*.xml found']);
});
