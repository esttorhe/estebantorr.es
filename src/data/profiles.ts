// ABOUTME: Esteban's profiles elsewhere on the web — the single list behind the footer's rel=me links and JSON-LD sameAs.
// ABOUTME: Adding or removing a profile here updates both the h-card (Footer.astro) and the Person structured data (lib/jsonLd.ts).

export interface Profile {
  /** Lowercase label shown in the footer. */
  label: string;
  href: string;
}

export const PROFILES: readonly Profile[] = [
  { label: 'github', href: 'https://github.com/esttorhe' },
  { label: 'mastodon', href: 'https://mastodon.social/@esttorhe' },
  { label: 'linkedin', href: 'https://linkedin.com/in/estebantorres' },
  { label: 'bluesky', href: 'https://bsky.app/profile/estebantorr.es' },
];
