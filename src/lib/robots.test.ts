// ABOUTME: Tests for the generated robots.txt body — content signals, AI-crawler blocks, sitemap reference.
// ABOUTME: Run with `bun test`.

import { test, expect } from 'bun:test';
import { buildRobotsTxt } from './robots';

const body = buildRobotsTxt(new URL('https://estebantorr.es'));

test('everyone is allowed, with content signals', () => {
  expect(body).toContain(
    'User-agent: *\nContent-Signal: search=yes,ai-train=no,ai-input=yes\nAllow: /\n',
  );
});

// contentsignals.org defines exactly three signals, each yes or no.
test('content signals only use the spec vocabulary', () => {
  const lines = body.split('\n').filter((line) => line.startsWith('Content-Signal:'));
  expect(lines.length).toBeGreaterThan(0);
  for (const line of lines) {
    for (const pair of line.replace('Content-Signal:', '').trim().split(',')) {
      expect(pair).toMatch(/^(search|ai-input|ai-train)=(yes|no)$/);
    }
  }
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
