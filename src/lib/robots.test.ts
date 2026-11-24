// ABOUTME: Tests for the generated robots.txt body — content signals, AI-crawler blocks, sitemap reference.
// ABOUTME: Run with `bun test`.

import { test, expect } from 'bun:test';
import { buildRobotsTxt } from './robots';

const body = buildRobotsTxt(new URL('https://estebantorr.es'));

test('everyone is allowed, with content signals and AIPREF usage preferences', () => {
  expect(body).toContain(
    'User-agent: *\nContent-Signal: search=yes,ai-train=no,ai-input=yes\nContent-Usage: search=y, ai-use=y, train-ai=n\nAllow: /\n',
  );
});

// draft-ietf-aipref-vocab-08 §6: labels train-ai, ai-use, search; values y or n.
test('Content-Usage only uses the AIPREF vocabulary', () => {
  const lines = body.split('\n').filter((line) => line.startsWith('Content-Usage:'));
  expect(lines.length).toBe(1);
  for (const pair of lines[0].replace('Content-Usage:', '').trim().split(', ')) {
    expect(pair).toMatch(/^(search|ai-use|train-ai)=(y|n)$/);
  }
});

// Both lines state one policy; they must never disagree.
test('Content-Signal and Content-Usage say the same thing', () => {
  const pairs = (prefix: string) =>
    Object.fromEntries(
      body
        .split('\n')
        .find((line) => line.startsWith(prefix))!
        .slice(prefix.length)
        .split(',')
        .map((pair) => pair.trim().split('=')),
    );
  const signal = pairs('Content-Signal:');
  const usage = pairs('Content-Usage:');
  const allowed = (value: string) => value === 'yes' || value === 'y';
  expect(allowed(usage.search)).toBe(allowed(signal.search));
  expect(allowed(usage['ai-use'])).toBe(allowed(signal['ai-input']));
  expect(allowed(usage['train-ai'])).toBe(allowed(signal['ai-train']));
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

// PetalBot indexes for Petal Search (Huawei); search is allowed, so it stays unblocked.
test('search crawlers are not in the blocked group', () => {
  expect(body).not.toContain('User-agent: PetalBot');
});

test('sitemap points at the index @astrojs/sitemap emits, derived from the site URL', () => {
  expect(body).toContain('Sitemap: https://estebantorr.es/sitemap-index.xml\n');
  expect(buildRobotsTxt(new URL('https://example.com/'))).toContain(
    'Sitemap: https://example.com/sitemap-index.xml\n',
  );
});
