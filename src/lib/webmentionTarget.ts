// ABOUTME: Shared vocabulary for webmentions — target URL normalization and wm-property classification.
// ABOUTME: Imported by both scripts/sync-webmentions.mjs (writes the cache) and src/data/webmentions.ts (reads it), so the two can never disagree about what counts as the same page.

/** The `wm-property` values this site renders. */
export type MentionProperty =
  | 'in-reply-to'
  | 'mention-of'
  | 'like-of'
  | 'repost-of'
  | 'bookmark-of';

/** Which rendered bucket a `wm-property` belongs in. */
export type MentionBucket = 'response' | 'reaction' | 'ignore';

/** Replies and mentions carry content, so they render as cards. */
export const RESPONSE_PROPERTIES = new Set(['in-reply-to', 'mention-of']);

/** Likes, reposts and bookmarks carry only an author, so they render as a facepile. */
export const REACTION_PROPERTIES = new Set(['like-of', 'repost-of', 'bookmark-of']);

/**
 * Collapses every spelling of one page's URL onto a single cache key.
 *
 * Astro emits directory-style routes, so a post's canonical URL carries a
 * trailing slash — but senders link to whichever form they copied, and
 * webmention.io stores `wm-target` verbatim. Without this, one post's mentions
 * split across two buckets and half of them never render.
 *
 * Scheme and host are normalized; path case is not, because `/About/` and
 * `/about/` are genuinely different files on a static host.
 *
 * @returns the canonical key, or `null` when the URL can't be parsed.
 */
export function normalizeTarget(url: string | undefined | null): string | null {
  if (typeof url !== 'string' || url.trim() === '') return null;

  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  parsed.protocol = 'https:';
  parsed.hash = '';
  parsed.search = '';

  const path = parsed.pathname.replace(/\/+$/, '');
  return `${parsed.origin}${path}`;
}

/**
 * Maps a `wm-property` to its rendered bucket.
 *
 * `rsvp` is event-specific and meaningless on a blog post; anything unknown is
 * a type webmention.io grew after this was written, and must not silently land
 * in a rendered bucket.
 */
export function classifyProperty(wmProperty: string | undefined | null): MentionBucket {
  if (typeof wmProperty !== 'string') return 'ignore';
  if (RESPONSE_PROPERTIES.has(wmProperty)) return 'response';
  if (REACTION_PROPERTIES.has(wmProperty)) return 'reaction';
  return 'ignore';
}
