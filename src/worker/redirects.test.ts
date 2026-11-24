// ABOUTME: Tests for permanent redirects from Hugo-era URLs that crawlers still request.
// ABOUTME: Run with `bun test`.

import { test, expect } from 'bun:test';
import { legacyRedirect } from './redirects';

// Hugo published the site feed at /index.xml; the Astro feed is /rss.xml.
test('the old site feed goes to the RSS feed', () => {
  expect(legacyRedirect('/index.xml')).toBe('/rss.xml');
});

// There are no per-tag feeds any more, so the whole feed is the closest match.
test('old per-tag feeds go to the RSS feed', () => {
  expect(legacyRedirect('/tags/hugo/index.xml')).toBe('/rss.xml');
  expect(legacyRedirect('/tags/problem-solving/index.xml')).toBe('/rss.xml');
});

test('guessed sitemap URLs go to the sitemap index', () => {
  expect(legacyRedirect('/sitemap')).toBe('/sitemap-index.xml');
  expect(legacyRedirect('/sitemap.xml')).toBe('/sitemap-index.xml');
});

test('current URLs are left alone', () => {
  expect(legacyRedirect('/')).toBeNull();
  expect(legacyRedirect('/rss.xml')).toBeNull();
  expect(legacyRedirect('/sitemap-index.xml')).toBeNull();
  expect(legacyRedirect('/2020/05/career-change/')).toBeNull();
  expect(legacyRedirect('/tags/hugo/')).toBeNull();
  expect(legacyRedirect('/tags/a/b/index.xml')).toBeNull();
});
