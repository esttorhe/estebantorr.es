// ABOUTME: Tests for the rule deciding which pages are listed in the sitemap and get a Markdown version.
// ABOUTME: Run with `bun test`.

import { test, expect } from 'bun:test';
import { isIndexedPage } from './indexedPages';

// Same rule as the sitemap: every page except the CV print source.
test('every sitemap page gets Markdown, the CV print source does not', () => {
  expect(isIndexedPage('/')).toBe(true);
  expect(isIndexedPage('/2015/06/swift-2-throws-tip/')).toBe(true);
  expect(isIndexedPage('/library/2019/')).toBe(true);
  expect(isIndexedPage('/cv/print/')).toBe(false);
  expect(isIndexedPage('/cv/print')).toBe(false);
});
