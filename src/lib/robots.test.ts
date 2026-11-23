// ABOUTME: Tests for the generated robots.txt body — content signals, AI-crawler blocks, sitemap reference.
// ABOUTME: Run with `bun test`.

import { test, expect } from 'bun:test';
import { buildRobotsTxt } from './robots';

const body = buildRobotsTxt(new URL('https://estebantorr.es'));

test('everyone is allowed, with content signals', () => {
  expect(body).toContain(
    'User-agent: *\nContent-Signal: search=yes,ai-train=no,use=reference\nAllow: /\n',
  );
});

test('training crawlers share one group that disallows everything', () => {
  expect(body).toContain('User-agent: GPTBot\n');
  expect(body).toContain('User-agent: ClaudeBot\n');
  expect(body).toContain('User-agent: CitibotSiteCrawler\nDisallow: /\n');
});

test('sitemap points at the index @astrojs/sitemap emits, derived from the site URL', () => {
  expect(body).toContain('Sitemap: https://estebantorr.es/sitemap-index.xml\n');
  expect(buildRobotsTxt(new URL('https://example.com/'))).toContain(
    'Sitemap: https://example.com/sitemap-index.xml\n',
  );
});
