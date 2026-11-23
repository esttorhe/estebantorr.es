// ABOUTME: Tests for the schema.org JSON-LD builders — sitewide Person/WebSite graph and per-entry BlogPosting.
// ABOUTME: Run with `bun test`. Shapes follow schema.org plus Google's Article structured-data guidance.

import { test, expect } from 'bun:test';
import { siteGraph, blogPosting, serializeJsonLd, PERSON_ID, WEBSITE_ID } from './jsonLd';
import { PROFILES } from '../data/profiles';

const site = new URL('https://estebantorr.es');

test('site graph carries a WebSite and a Person, linked by @id', () => {
  const graph = siteGraph(site, 'https://estebantorr.es/_astro/me.jpg');
  expect(graph['@context']).toBe('https://schema.org');

  const [website, person] = graph['@graph'];
  expect(website).toMatchObject({
    '@type': 'WebSite',
    '@id': WEBSITE_ID(site),
    url: 'https://estebantorr.es/',
    name: 'The mind of Esteban',
    publisher: { '@id': PERSON_ID(site) },
  });
  expect(person).toMatchObject({
    '@type': 'Person',
    '@id': 'https://estebantorr.es/#person',
    name: 'Esteban Torres',
    url: 'https://estebantorr.es/',
    image: 'https://estebantorr.es/_astro/me.jpg',
    jobTitle: 'Engineering Manager',
    worksFor: { '@type': 'Organization', name: 'Peec AI', url: 'https://peec.ai' },
    workLocation: { '@type': 'Place', name: 'Berlin, Germany' },
  });
  expect(person.sameAs).toContain('https://github.com/esttorhe');
  expect(person.sameAs).toContain('https://bsky.app/profile/estebantorr.es');
});

test('sameAs is exactly the shared profile list the footer renders as rel=me', () => {
  const [, person] = siteGraph(site)['@graph'];
  expect(person.sameAs).toEqual(PROFILES.map((p) => p.href));
});

test('blog posting has the fields Google asks for, with the author pointing at the Person', () => {
  const posting = blogPosting(site, {
    url: 'https://estebantorr.es/2020/05/career-change/',
    headline: 'Career change',
    description: 'Moving from iOS to management.',
    datePublished: new Date('2020-05-04T00:00:00Z'),
    image: 'https://estebantorr.es/_astro/hero.jpg',
    keywords: ['career', 'leadership'],
  });

  expect(posting).toMatchObject({
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    '@id': 'https://estebantorr.es/2020/05/career-change/#article',
    url: 'https://estebantorr.es/2020/05/career-change/',
    mainEntityOfPage: 'https://estebantorr.es/2020/05/career-change/',
    headline: 'Career change',
    description: 'Moving from iOS to management.',
    datePublished: '2020-05-04T00:00:00.000Z',
    image: 'https://estebantorr.es/_astro/hero.jpg',
    keywords: 'career, leadership',
    inLanguage: 'en',
    author: { '@id': PERSON_ID(site), name: 'Esteban Torres', url: 'https://estebantorr.es/' },
    publisher: { '@id': PERSON_ID(site) },
    isPartOf: { '@id': WEBSITE_ID(site) },
  });
});

test('optional blog posting fields are omitted, not emitted empty', () => {
  const posting = blogPosting(site, {
    url: 'https://estebantorr.es/til/x/',
    headline: 'X',
    datePublished: new Date('2024-01-01T00:00:00Z'),
    keywords: [],
  });
  expect('description' in posting).toBe(false);
  expect('image' in posting).toBe(false);
  expect('keywords' in posting).toBe(false);
});

test('serialization round-trips and cannot close the script tag early', () => {
  const data = { headline: 'Escaping </script><script>alert(1)</script> & friends' };
  const out = serializeJsonLd(data);
  expect(out).not.toContain('</script>');
  expect(out).not.toContain('<');
  expect(JSON.parse(out)).toEqual(data);
});
