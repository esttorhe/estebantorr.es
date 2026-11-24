// ABOUTME: Pure routing logic for serving the build-time Markdown to agents: Accept negotiation, the slug.md alias, headers.
// ABOUTME: Used by src/worker/index.ts; the Markdown files themselves come from src/integrations/agentMarkdown.ts.

import { CONTENT_SIGNALS } from '../lib/robots';

/** q-value of the most specific Accept entry matching `type`, or 0 when nothing matches. */
function quality(accept: string, type: string, allowWildcards: boolean): number {
  const [major] = type.split('/');
  let best: { specificity: number; q: number } | undefined;

  for (const part of accept.split(',')) {
    const [rawRange, ...params] = part.split(';').map((s) => s.trim().toLowerCase());
    if (!rawRange) continue;

    const specificity =
      rawRange === type ? 3 : rawRange === `${major}/*` ? 2 : rawRange === '*/*' ? 1 : 0;
    if (specificity === 0 || (specificity < 3 && !allowWildcards)) continue;

    const qParam = params.find((p) => p.startsWith('q='));
    const q = qParam ? Number(qParam.slice(2)) : 1;
    if (Number.isNaN(q)) continue;

    if (!best || specificity > best.specificity) best = { specificity, q };
  }
  return best?.q ?? 0;
}

/**
 * True when the client ranks text/markdown strictly above text/html. Only an
 * explicit text/markdown asks for Markdown; wildcards count towards HTML, and
 * ties go to HTML, so browsers can never land on Markdown by accident.
 */
export function prefersMarkdown(accept: string | null): boolean {
  if (!accept) return false;
  const markdown = quality(accept, 'text/markdown', false);
  return markdown > 0 && markdown > quality(accept, 'text/html', true);
}

/** The index.md behind a page URL, or null for files (anything with an extension). */
export function negotiatedMarkdownPath(pathname: string): string | null {
  if (pathname.endsWith('/')) return `${pathname}index.md`;
  const lastSegment = pathname.slice(pathname.lastIndexOf('/') + 1);
  if (lastSegment.includes('.')) return null;
  return `${pathname}/index.md`;
}

/** `/slug.md` is a guessable alias for `/slug/index.md`; real index.md files pass through. */
export function aliasMarkdownPath(pathname: string): string | null {
  const match = pathname.match(/^(.*\/)([^/]+)\.md$/);
  if (!match || match[2] === 'index') return null;
  return `${match[1]}${match[2]}/index.md`;
}

/**
 * Browsers asking for an .md URL get text/plain, which they display instead of
 * downloading. Anything else that is not asking for HTML gets text/markdown.
 */
export function markdownContentType(accept: string | null): string {
  const browser = !prefersMarkdown(accept) && quality(accept ?? '', 'text/html', false) > 0;
  return browser ? 'text/plain; charset=utf-8' : 'text/markdown; charset=utf-8';
}

export function markdownHeaders(pageUrl: string, contentType: string): Record<string, string> {
  return {
    'Content-Type': contentType,
    Vary: 'Accept',
    'Content-Signal': CONTENT_SIGNALS,
    Link: `<${pageUrl}>; rel="canonical"`,
  };
}

/** Link header pointing an HTML response at its Markdown version, mirroring the <link rel="alternate"> tag. */
export function markdownAlternateLink(markdownUrl: string): string {
  return `<${markdownUrl}>; rel="alternate"; type="text/markdown"`;
}
