// ABOUTME: Tests for the Worker's Markdown routing: Accept negotiation, the slug.md alias, content types and headers.
// ABOUTME: Run with `bun test`.

import { test, expect } from 'bun:test';
import {
  prefersMarkdown,
  negotiatedMarkdownPath,
  aliasMarkdownPath,
  markdownContentType,
  markdownHeaders,
  markdownAlternateLink,
} from './agentMarkdown';
import { CONTENT_SIGNALS } from '../lib/robots';

const CHROME =
  'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7';

// ---------------------------------------------------------------------------
// prefersMarkdown
// ---------------------------------------------------------------------------

test('a client asking only for Markdown gets it', () => {
  expect(prefersMarkdown('text/markdown')).toBe(true);
});

test('Markdown preferred over HTML gets Markdown', () => {
  expect(prefersMarkdown('text/markdown, text/html;q=0.9')).toBe(true);
  expect(prefersMarkdown('text/markdown, */*;q=0.1')).toBe(true);
});

test('browsers get HTML', () => {
  expect(prefersMarkdown(CHROME)).toBe(false);
  expect(prefersMarkdown('text/html')).toBe(false);
});

test('HTML preferred over Markdown gets HTML', () => {
  expect(prefersMarkdown('text/html, text/markdown;q=0.5')).toBe(false);
});

// A tie is not a preference; HTML is the default representation.
test('equal q-values go to HTML', () => {
  expect(prefersMarkdown('text/markdown, text/html')).toBe(false);
});

// A wildcard is a fallback, not a request for Markdown — but it does count as
// accepting HTML when it outranks Markdown.
test('wildcards never ask for Markdown', () => {
  expect(prefersMarkdown('*/*')).toBe(false);
  expect(prefersMarkdown('text/*')).toBe(false);
  expect(prefersMarkdown('*/*, text/markdown;q=0.5')).toBe(false);
});

test('q=0 means not acceptable', () => {
  expect(prefersMarkdown('text/markdown;q=0')).toBe(false);
});

test('missing or empty Accept gets HTML', () => {
  expect(prefersMarkdown(null)).toBe(false);
  expect(prefersMarkdown('')).toBe(false);
});

test('media types and parameters ignore case and spacing', () => {
  expect(prefersMarkdown('Text/Markdown ; Q=1 , text/html ; q=0.2')).toBe(true);
});

// ---------------------------------------------------------------------------
// negotiatedMarkdownPath
// ---------------------------------------------------------------------------

test('page URLs map to their index.md', () => {
  expect(negotiatedMarkdownPath('/')).toBe('/index.md');
  expect(negotiatedMarkdownPath('/2015/06/swift-2-throws-tip/')).toBe(
    '/2015/06/swift-2-throws-tip/index.md',
  );
  expect(negotiatedMarkdownPath('/about')).toBe('/about/index.md');
});

test('files are not negotiated', () => {
  expect(negotiatedMarkdownPath('/rss.xml')).toBeNull();
  expect(negotiatedMarkdownPath('/_astro/me.CAdoQfZE.jpg')).toBeNull();
  expect(negotiatedMarkdownPath('/about/index.md')).toBeNull();
});

// ---------------------------------------------------------------------------
// aliasMarkdownPath
// ---------------------------------------------------------------------------

test('slug.md is an alias for slug/index.md', () => {
  expect(aliasMarkdownPath('/2015/06/swift-2-throws-tip.md')).toBe(
    '/2015/06/swift-2-throws-tip/index.md',
  );
  expect(aliasMarkdownPath('/about.md')).toBe('/about/index.md');
});

test('real index.md files and other paths are not aliases', () => {
  expect(aliasMarkdownPath('/about/index.md')).toBeNull();
  expect(aliasMarkdownPath('/index.md')).toBeNull();
  expect(aliasMarkdownPath('/about/')).toBeNull();
  expect(aliasMarkdownPath('/.md')).toBeNull();
});

// ---------------------------------------------------------------------------
// markdownContentType
// ---------------------------------------------------------------------------

// Browsers download text/markdown instead of showing it.
test('a browser opening an .md URL gets text/plain so it displays', () => {
  expect(markdownContentType(CHROME)).toBe('text/plain; charset=utf-8');
});

test('agents and plain clients get text/markdown', () => {
  expect(markdownContentType('text/markdown')).toBe('text/markdown; charset=utf-8');
  expect(markdownContentType('*/*')).toBe('text/markdown; charset=utf-8');
  expect(markdownContentType(null)).toBe('text/markdown; charset=utf-8');
});

// ---------------------------------------------------------------------------
// markdownHeaders
// ---------------------------------------------------------------------------

test('Markdown responses vary on Accept, carry the content signals and point at the HTML page', () => {
  expect(markdownHeaders('https://estebantorr.es/about/', 'text/markdown; charset=utf-8')).toEqual({
    'Content-Type': 'text/markdown; charset=utf-8',
    Vary: 'Accept',
    'Content-Signal': CONTENT_SIGNALS,
    Link: '<https://estebantorr.es/about/>; rel="canonical"',
  });
});

// ---------------------------------------------------------------------------
// markdownAlternateLink
// ---------------------------------------------------------------------------

// The HTTP twin of the <link rel="alternate"> tag, for agents that read headers before the body.
test('HTML pages advertise their Markdown version in a Link header', () => {
  expect(markdownAlternateLink('https://estebantorr.es/about/index.md')).toBe(
    '<https://estebantorr.es/about/index.md>; rel="alternate"; type="text/markdown"',
  );
});
