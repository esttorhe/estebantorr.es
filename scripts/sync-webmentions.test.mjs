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
  isTransientStatus,
  fetchWithRetry,
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

// ---------------------------------------------------------------------------
// markRemoved — mentions the sender has deleted
// ---------------------------------------------------------------------------

import { markRemoved } from './sync-webmentions.mjs';

const AT = '2026-09-01T12:00:00.000Z';

function targets(...ids) {
  return {
    'https://estebantorr.es/a-post': {
      responses: ids.map((id) => ({ id, type: 'in-reply-to', author: { name: 'X' } })),
      reactions: [],
    },
  };
}

// The whole point: webmention.io drops a deleted mention from the feed, but the
// sync only ever merges, so without this it stays published forever.
test('a mention absent from the feed is marked removed', () => {
  const result = markRemoved(targets(1, 2), new Set([1]), { at: AT });
  const [one, two] = result.targets['https://estebantorr.es/a-post'].responses;
  expect(one.removed).toBeUndefined();
  expect(two.removed).toBe(true);
  expect(two.removedAt).toBe(AT);
  expect(result.removedCount).toBe(1);
});

test('a mention still in the feed is left alone', () => {
  const result = markRemoved(targets(1, 2), new Set([1, 2]), { at: AT });
  expect(result.removedCount).toBe(0);
  for (const m of result.targets['https://estebantorr.es/a-post'].responses) {
    expect(m.removed).toBeUndefined();
  }
});

// webmention.io can restore a mention, and a sender can repost. A previously
// removed mention that comes back must render again.
test('a removed mention that reappears is un-marked', () => {
  const withRemoved = targets(1);
  withRemoved['https://estebantorr.es/a-post'].responses[0].removed = true;
  withRemoved['https://estebantorr.es/a-post'].responses[0].removedAt = AT;
  const result = markRemoved(withRemoved, new Set([1]), { at: AT });
  const m = result.targets['https://estebantorr.es/a-post'].responses[0];
  expect(m.removed).toBeUndefined();
  expect(m.removedAt).toBeUndefined();
});

// The dangerous failure mode: a transient API blip returning nothing would
// otherwise mark the entire archive deleted and blank every Responses region.
test('an empty feed never removes anything', () => {
  const result = markRemoved(targets(1, 2, 3), new Set(), { at: AT });
  expect(result.removedCount).toBe(0);
  expect(result.skipped).toBe(true);
});

// Likewise a partial response: losing most of the archive in one run is far
// more likely to be an API anomaly than everyone deleting at once.
test('a mass removal is refused rather than applied', () => {
  const result = markRemoved(targets(1, 2, 3, 4), new Set([1]), { at: AT });
  expect(result.removedCount).toBe(0);
  expect(result.skipped).toBe(true);
});

test('a removal within the ratio is applied', () => {
  const result = markRemoved(targets(1, 2, 3, 4), new Set([1, 2, 3]), { at: AT });
  expect(result.removedCount).toBe(1);
  expect(result.skipped).toBe(false);
});

test('already-removed mentions do not count toward the mass-removal ratio', () => {
  const t = targets(1, 2, 3, 4);
  for (const m of t['https://estebantorr.es/a-post'].responses.slice(1)) {
    m.removed = true;
  }
  // Only id 1 is present; 2-4 are already marked, so nothing new is removed.
  const result = markRemoved(t, new Set([1]), { at: AT });
  expect(result.removedCount).toBe(0);
  expect(result.skipped).toBe(false);
});

test('markRemoved does not mutate the input', () => {
  const before = targets(1, 2);
  markRemoved(before, new Set([1]), { at: AT });
  expect(before['https://estebantorr.es/a-post'].responses[1].removed).toBeUndefined();
});

test('reactions are checked as well as responses', () => {
  const t = {
    'https://estebantorr.es/a-post': {
      responses: [{ id: 1, type: 'in-reply-to', author: { name: 'X' } }],
      reactions: [{ id: 2, type: 'like-of', author: { name: 'Y' } }],
    },
  };
  const result = markRemoved(t, new Set([1]), { at: AT });
  expect(result.targets['https://estebantorr.es/a-post'].reactions[0].removed).toBe(true);
});

// ---------------------------------------------------------------------------
// fetchWithRetry
// ---------------------------------------------------------------------------

// webmention.io flaps rather than falling over: during an incident a majority
// of requests 502 while the rest are served normally. A single-shot fetch then
// fails most of the time even though the data is right there.

// A stand-in for `fetch` that replays a scripted list of outcomes, so the retry
// policy can be exercised without waiting on a real outage. `sleep` is stubbed
// out for the same reason — the test asserts on the delays rather than serving
// them.
function scriptedFetch(outcomes) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url: String(url), init });
    const outcome = outcomes[calls.length - 1];
    if (outcome instanceof Error) throw outcome;
    return { ok: outcome >= 200 && outcome < 300, status: outcome, statusText: String(outcome) };
  };
  impl.calls = calls;
  return impl;
}

function recordingSleep() {
  const delays = [];
  const sleep = async (ms) => {
    delays.push(ms);
  };
  sleep.delays = delays;
  return sleep;
}

test('5xx and 429 are transient; client errors are not', () => {
  expect(isTransientStatus(502)).toBe(true);
  expect(isTransientStatus(500)).toBe(true);
  expect(isTransientStatus(429)).toBe(true);
  expect(isTransientStatus(400)).toBe(false);
  expect(isTransientStatus(401)).toBe(false);
  expect(isTransientStatus(404)).toBe(false);
});

test('a first-try success is returned without sleeping', async () => {
  const fetchImpl = scriptedFetch([200]);
  const sleep = recordingSleep();

  const response = await fetchWithRetry('https://example.com/', { fetchImpl, sleep });

  expect(response.status).toBe(200);
  expect(fetchImpl.calls.length).toBe(1);
  expect(sleep.delays).toEqual([]);
});

test('a transient status is retried until it succeeds', async () => {
  const fetchImpl = scriptedFetch([502, 502, 200]);
  const sleep = recordingSleep();

  const response = await fetchWithRetry('https://example.com/', { fetchImpl, sleep });

  expect(response.status).toBe(200);
  expect(fetchImpl.calls.length).toBe(3);
});

test('backoff between retries grows exponentially', async () => {
  const fetchImpl = scriptedFetch([502, 502, 502, 200]);
  const sleep = recordingSleep();

  await fetchWithRetry('https://example.com/', { fetchImpl, sleep, backoffMs: 100 });

  expect(sleep.delays).toEqual([100, 200, 400]);
});

// Retrying a bad token just delays the same failure and hides the real cause.
test('a permanent status is returned immediately without retrying', async () => {
  const fetchImpl = scriptedFetch([401, 200]);
  const sleep = recordingSleep();

  const response = await fetchWithRetry('https://example.com/', { fetchImpl, sleep });

  expect(response.status).toBe(401);
  expect(fetchImpl.calls.length).toBe(1);
  expect(sleep.delays).toEqual([]);
});

test('the last response is returned once the attempts run out', async () => {
  const fetchImpl = scriptedFetch([502, 502, 502]);
  const sleep = recordingSleep();

  const response = await fetchWithRetry('https://example.com/', {
    fetchImpl,
    sleep,
    attempts: 3,
  });

  expect(response.status).toBe(502);
  expect(fetchImpl.calls.length).toBe(3);
  // Three attempts means two waits — no pointless sleep after the last one.
  expect(sleep.delays.length).toBe(2);
});

// A dropped connection is the same class of problem as a 502 and deserves the
// same treatment.
test('a network error is retried too', async () => {
  const fetchImpl = scriptedFetch([new Error('ECONNRESET'), 200]);
  const sleep = recordingSleep();

  const response = await fetchWithRetry('https://example.com/', { fetchImpl, sleep });

  expect(response.status).toBe(200);
  expect(fetchImpl.calls.length).toBe(2);
});

test('a network error on the final attempt is rethrown', async () => {
  const fetchImpl = scriptedFetch([new Error('ECONNRESET'), new Error('ECONNRESET')]);
  const sleep = recordingSleep();

  await expect(
    fetchWithRetry('https://example.com/', { fetchImpl, sleep, attempts: 2 }),
  ).rejects.toThrow('ECONNRESET');
});

test('each retry is reported so a slow sync explains itself in the log', async () => {
  const fetchImpl = scriptedFetch([502, 200]);
  const sleep = recordingSleep();
  const retries = [];

  await fetchWithRetry('https://example.com/', {
    fetchImpl,
    sleep,
    backoffMs: 100,
    onRetry: (info) => retries.push(info),
  });

  expect(retries.length).toBe(1);
  expect(retries[0].status).toBe(502);
  expect(retries[0].delay).toBe(100);
});

// The whole reason a retry works at all: a pooled keep-alive connection sticks
// to one backend, so retrying down the same socket re-asks the same broken
// server. Verified against the live outage — 0/12 on a reused connection versus
// 3/12 with a fresh one — so this header is load-bearing, not cargo cult.
test('every attempt asks for a fresh connection rather than reusing the pool', async () => {
  const fetchImpl = scriptedFetch([502, 502, 200]);
  const sleep = recordingSleep();

  await fetchWithRetry('https://example.com/', { fetchImpl, sleep });

  expect(fetchImpl.calls.length).toBe(3);
  for (const call of fetchImpl.calls) {
    expect(call.init?.headers?.connection).toBe('close');
  }
});
