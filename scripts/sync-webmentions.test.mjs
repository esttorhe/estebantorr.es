// ABOUTME: Tests for the pure transform functions in sync-webmentions.mjs — target normalization, type classification, merging, grouping.
// ABOUTME: Run with `bun test scripts/sync-webmentions.test.mjs`.

import { test, expect } from 'bun:test';
import {
  normalizeTarget,
  classifyProperty,
  shapeMention,
  mergeMentions,
  groupByTarget,
  avatarSlug,
} from './sync-webmentions.mjs';

// ---------------------------------------------------------------------------
// normalizeTarget
// ---------------------------------------------------------------------------

// Astro emits directory-style routes, so the canonical URL of a post carries a
// trailing slash. Anyone linking to it may or may not include that slash, and
// webmention.io stores wm-target verbatim. Both forms have to collapse to one
// key or a post's mentions get split across two buckets.
test('trailing slash and no trailing slash collapse to the same key', () => {
  const withSlash = normalizeTarget('https://estebantorr.es/2026/06/ai-maximises-tech-debt/');
  const without = normalizeTarget('https://estebantorr.es/2026/06/ai-maximises-tech-debt');
  expect(withSlash).toBe(without);
});

test('http and https collapse to the same key', () => {
  expect(normalizeTarget('http://estebantorr.es/about/')).toBe(
    normalizeTarget('https://estebantorr.es/about/'),
  );
});

test('host case is normalized', () => {
  expect(normalizeTarget('https://EstebanTorr.es/About/')).toBe('https://estebantorr.es/About');
});

// Path case is meaningful — /About/ and /about/ are different files on a static
// host — so only the host gets lowercased.
test('path case is preserved', () => {
  expect(normalizeTarget('https://estebantorr.es/TIL/foo/')).not.toBe(
    normalizeTarget('https://estebantorr.es/til/foo/'),
  );
});

test('fragments are dropped', () => {
  expect(normalizeTarget('https://estebantorr.es/about/#contact')).toBe(
    'https://estebantorr.es/about',
  );
});

test('tracking query strings are dropped', () => {
  expect(normalizeTarget('https://estebantorr.es/about/?utm_source=mastodon')).toBe(
    'https://estebantorr.es/about',
  );
});

test('the site root normalizes to a bare origin rather than an empty path', () => {
  expect(normalizeTarget('https://estebantorr.es/')).toBe('https://estebantorr.es');
});

test('a malformed url returns null instead of throwing', () => {
  expect(normalizeTarget('not-a-url')).toBeNull();
  expect(normalizeTarget('')).toBeNull();
  expect(normalizeTarget(undefined)).toBeNull();
});

// ---------------------------------------------------------------------------
// classifyProperty
// ---------------------------------------------------------------------------

test('replies and mentions are responses', () => {
  expect(classifyProperty('in-reply-to')).toBe('response');
  expect(classifyProperty('mention-of')).toBe('response');
});

test('likes, reposts and bookmarks are reactions', () => {
  expect(classifyProperty('like-of')).toBe('reaction');
  expect(classifyProperty('repost-of')).toBe('reaction');
  expect(classifyProperty('bookmark-of')).toBe('reaction');
});

// RSVPs are event-specific and meaningless on a blog post, and an unknown
// property means webmention.io grew a type we don't render — both must be
// dropped rather than silently landing in one of the rendered buckets.
test('rsvp and unknown properties are ignored', () => {
  expect(classifyProperty('rsvp')).toBe('ignore');
  expect(classifyProperty('some-future-type')).toBe('ignore');
  expect(classifyProperty(undefined)).toBe('ignore');
});

// ---------------------------------------------------------------------------
// shapeMention
// ---------------------------------------------------------------------------

const reply = {
  type: 'entry',
  author: {
    type: 'card',
    name: 'Jan Monschke',
    url: 'https://janmonschke.com/',
    photo: 'https://webmention.io/avatar/x.jpg',
  },
  url: 'https://janmonschke.com/a-reply/',
  published: '2026-08-12T09:00:00Z',
  'wm-received': '2026-08-12T09:04:00Z',
  'wm-id': 1700,
  'wm-property': 'in-reply-to',
  'wm-target': 'https://estebantorr.es/2026/06/ai-maximises-tech-debt/',
  content: {
    text: 'This matches what I saw last quarter.',
    html: '<p>This matches what I saw last quarter.</p>',
  },
};

test('a reply keeps the fields the UI renders', () => {
  const shaped = shapeMention(reply);
  expect(shaped.id).toBe(1700);
  expect(shaped.type).toBe('in-reply-to');
  expect(shaped.url).toBe('https://janmonschke.com/a-reply/');
  expect(shaped.author.name).toBe('Jan Monschke');
  expect(shaped.author.url).toBe('https://janmonschke.com/');
  expect(shaped.text).toBe('This matches what I saw last quarter.');
  expect(shaped.published).toBe('2026-08-12T09:00:00Z');
});

// Text is stored in full rather than truncated — the whole point of syncing
// into the repo is owning the mention, and the UI clamps visually instead.
test('long reply text is stored in full, not truncated', () => {
  const long = 'x'.repeat(5000);
  const shaped = shapeMention({ ...reply, content: { text: long } });
  expect(shaped.text.length).toBe(5000);
});

// Plenty of sources omit `published`; webmention.io always records when it
// received the mention, so that is the fallback rather than dropping the date.
test('a missing published date falls back to wm-received', () => {
  const shaped = shapeMention({ ...reply, published: null });
  expect(shaped.published).toBe('2026-08-12T09:04:00Z');
});

test('html content is not carried into the JSON', () => {
  const shaped = shapeMention(reply);
  expect(shaped.html).toBeUndefined();
});

// A titled source (another blog post rather than a toot) exposes `name`, which
// is a better label for a "linked from" card than the raw body text.
test('a titled source keeps its name as the card title', () => {
  const shaped = shapeMention({
    ...reply,
    'wm-property': 'mention-of',
    name: 'Adding Webmentions to Your Static Blog',
  });
  expect(shaped.title).toBe('Adding Webmentions to Your Static Blog');
});

// Likes and reposts carry no content at all — only an author. Shaping must not
// invent an empty string that the UI would then render as a blank card body.
test('a like has no text field', () => {
  const shaped = shapeMention({
    author: {
      name: 'Someone',
      url: 'https://example.com/',
      photo: 'https://webmention.io/avatar/y.jpg',
    },
    url: 'https://example.com/like/1',
    'wm-id': 1701,
    'wm-property': 'like-of',
    'wm-target': 'https://estebantorr.es/about/',
    'wm-received': '2026-08-12T10:00:00Z',
  });
  expect(shaped.text).toBeUndefined();
  expect(shaped.type).toBe('like-of');
});

// An anonymous sender still deserves a card; the UI needs *some* label, and the
// source host is the most honest one available.
test('a mention with no author name falls back to the source host', () => {
  const shaped = shapeMention({
    ...reply,
    author: {},
    url: 'https://example.org/notes/1',
  });
  expect(shaped.author.name).toBe('example.org');
});

// ---------------------------------------------------------------------------
// mergeMentions
// ---------------------------------------------------------------------------

test('merging dedupes by id and keeps the incoming version', () => {
  const existing = [{ id: 1, text: 'old' }];
  const incoming = [{ id: 1, text: 'edited' }];
  const merged = mergeMentions(existing, incoming);
  expect(merged).toHaveLength(1);
  expect(merged[0].text).toBe('edited');
});

// Sorting by id keeps the committed JSON stable across syncs, so a re-sync that
// found nothing new produces an empty diff instead of a reshuffled file.
test('merged output is sorted by id ascending for a stable diff', () => {
  const merged = mergeMentions([{ id: 30 }, { id: 10 }], [{ id: 20 }]);
  expect(merged.map((m) => m.id)).toEqual([10, 20, 30]);
});

test('merging preserves mentions the incoming page did not include', () => {
  const merged = mergeMentions([{ id: 1 }, { id: 2 }], [{ id: 3 }]);
  expect(merged.map((m) => m.id)).toEqual([1, 2, 3]);
});

test('merging into an empty cache just sorts the incoming set', () => {
  expect(mergeMentions([], [{ id: 5 }, { id: 2 }]).map((m) => m.id)).toEqual([2, 5]);
});

// ---------------------------------------------------------------------------
// groupByTarget
// ---------------------------------------------------------------------------

test('mentions are grouped under their normalized target and split by bucket', () => {
  const grouped = groupByTarget([
    { ...reply, 'wm-id': 1 },
    {
      ...reply,
      'wm-id': 2,
      'wm-property': 'like-of',
      content: undefined,
      // same post, but linked without the trailing slash
      'wm-target': 'https://estebantorr.es/2026/06/ai-maximises-tech-debt',
    },
  ]);

  const key = 'https://estebantorr.es/2026/06/ai-maximises-tech-debt';
  expect(Object.keys(grouped)).toEqual([key]);
  expect(grouped[key].responses.map((m) => m.id)).toEqual([1]);
  expect(grouped[key].reactions.map((m) => m.id)).toEqual([2]);
});

test('ignored types are dropped entirely rather than grouped', () => {
  const grouped = groupByTarget([{ ...reply, 'wm-id': 9, 'wm-property': 'rsvp' }]);
  expect(Object.keys(grouped)).toHaveLength(0);
});

// A mention whose target we can't parse would otherwise land under a "null"
// key and render on no page while silently inflating the file.
test('a mention with an unparseable target is dropped', () => {
  const grouped = groupByTarget([{ ...reply, 'wm-id': 9, 'wm-target': 'nonsense' }]);
  expect(Object.keys(grouped)).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// avatarSlug
// ---------------------------------------------------------------------------

// Avatars are self-hosted rather than hotlinked, so each needs a filename that
// is stable across syncs (no re-download every run) and safe on disk.
test('the same author url always produces the same avatar slug', () => {
  expect(avatarSlug('https://janmonschke.com/')).toBe(avatarSlug('https://janmonschke.com/'));
});

test('different author urls produce different avatar slugs', () => {
  expect(avatarSlug('https://janmonschke.com/')).not.toBe(avatarSlug('https://example.com/'));
});

test('an avatar slug is filesystem-safe', () => {
  expect(avatarSlug('https://mastodon.social/@esttorhe')).toMatch(/^[a-z0-9-]+$/);
});
