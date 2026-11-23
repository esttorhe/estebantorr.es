// ABOUTME: Builds schema.org JSON-LD for the site: a sitewide WebSite + Person graph and per-entry BlogPosting.
// ABOUTME: Rendered by src/components/seo/JsonLd.astro; serializeJsonLd makes the output safe inside a <script>.

import { PROFILES } from '../data/profiles';

const SITE_NAME = 'The mind of Esteban';
const AUTHOR_NAME = 'Esteban Torres';

/** Profiles that identify the same person — the same list the footer marks rel=me. */
const SAME_AS = PROFILES.map((profile) => profile.href);

export const PERSON_ID = (site: URL) => new URL('#person', site).toString();
export const WEBSITE_ID = (site: URL) => new URL('#website', site).toString();

const home = (site: URL) => new URL('/', site).toString();

/** The WebSite and its author, emitted on every page. */
export function siteGraph(site: URL, personImage?: string) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': WEBSITE_ID(site),
        url: home(site),
        name: SITE_NAME,
        inLanguage: 'en',
        publisher: { '@id': PERSON_ID(site) },
      },
      {
        '@type': 'Person',
        '@id': PERSON_ID(site),
        name: AUTHOR_NAME,
        url: home(site),
        ...(personImage && { image: personImage }),
        jobTitle: 'Engineering Manager',
        worksFor: { '@type': 'Organization', name: 'Peec AI', url: 'https://peec.ai' },
        workLocation: { '@type': 'Place', name: 'Berlin, Germany' },
        sameAs: SAME_AS,
      },
    ],
  };
}

export interface PostingInput {
  /** Absolute canonical URL of the entry. */
  url: string;
  headline: string;
  description?: string;
  datePublished: Date;
  /** Absolute URL of a raster image representing the entry. */
  image?: string;
  keywords: string[];
}

/** A blog post or TIL entry. */
export function blogPosting(site: URL, input: PostingInput) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    '@id': `${input.url}#article`,
    url: input.url,
    mainEntityOfPage: input.url,
    headline: input.headline,
    ...(input.description && { description: input.description }),
    datePublished: input.datePublished.toISOString(),
    ...(input.image && { image: input.image }),
    ...(input.keywords.length > 0 && { keywords: input.keywords.join(', ') }),
    inLanguage: 'en',
    // Google asks for author name + url inline; @id ties it to the sitewide Person.
    author: { '@id': PERSON_ID(site), name: AUTHOR_NAME, url: home(site) },
    publisher: { '@id': PERSON_ID(site) },
    isPartOf: { '@id': WEBSITE_ID(site) },
  };
}

/**
 * JSON for a <script type="application/ld+json"> body. `<` is escaped as <
 * so content like "</script>" in a title can't end the element early; JSON
 * parsers read the escape back as the original character.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
