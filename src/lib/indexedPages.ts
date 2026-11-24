// ABOUTME: The one rule for which built pages are public and listed: in the sitemap, with a Markdown version, linked for agents.
// ABOUTME: Kept dependency-free so the Worker, astro.config.mjs and the layout can all import it cheaply.

/** Every built page except the CV's PDF source (/cv/print/); the public CV is /cv/. */
export function isIndexedPage(pathname: string): boolean {
  return !/^\/cv\/print\/?$/.test(pathname);
}
