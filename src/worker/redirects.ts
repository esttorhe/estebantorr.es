// ABOUTME: Permanent redirects from Hugo-era URLs (feeds, sitemap) that crawlers still request, to their Astro equivalents.
// ABOUTME: Lives in the Worker because run_worker_first means a _redirects file would not apply (Cloudflare static-assets docs).

const EXACT: Record<string, string> = {
  '/index.xml': '/rss.xml',
  '/sitemap': '/sitemap-index.xml',
  '/sitemap.xml': '/sitemap-index.xml',
};

/** Hugo's per-tag feeds; the site has a single feed now. */
const TAG_FEED = /^\/tags\/[^/]+\/index\.xml$/;

/** The path to redirect to permanently, or null when the URL is current. */
export function legacyRedirect(pathname: string): string | null {
  if (pathname in EXACT) return EXACT[pathname];
  if (TAG_FEED.test(pathname)) return '/rss.xml';
  return null;
}
