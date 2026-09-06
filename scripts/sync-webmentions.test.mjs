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
  isThreadSourced,
  threadRootsFor,
  statusRefFromUrl,
  shapeThreadReply,
  mergeThreadReplies,
  isThreadGone,
  isThreadTruncated,
  THREAD_DESCENDANTS_LIMIT,
  isConcealed,
  isPubliclyListed,
  threadDepth,
  THREAD_DEPTH_LIMIT,
  repliesFromContext,
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

// ---------------------------------------------------------------------------
// re-delivered mentions
// ---------------------------------------------------------------------------

// Bridgy re-sends a mention when a delivery is retried, and webmention.io files
// each delivery under its own wm-id. Deduping on id alone therefore lets a
// single reply render as three identical cards, which is what happened to the
// webmentions post during the webmention.io outage.

const reply1 = {
  id: 2029428,
  type: 'in-reply-to',
  url: 'https://mastodon.social/@esttorhe/117219077409822141',
  published: '2026-09-05T10:00:00Z',
  author: { name: 'Esteban Torres', url: 'https://mastodon.social/@esttorhe' },
  text: "I couldn't stay away from the fun ^^",
};

test('the same source url delivered under several wm-ids renders once', () => {
  const merged = mergeMentions(
    [reply1],
    [
      { ...reply1, id: 2029536 },
      { ...reply1, id: 2029651 },
    ],
  );
  expect(merged.length).toBe(1);
});

// Senders edit their posts, so the freshest delivery carries the freshest text.
test('the newest delivery of a re-sent mention is the one kept', () => {
  const merged = mergeMentions([reply1], [{ ...reply1, id: 2029651, text: 'edited afterwards' }]);
  expect(merged[0].id).toBe(2029651);
  expect(merged[0].text).toBe('edited afterwards');
});

// Two people liking the same post share a base URL and differ only in the
// fragment webmention.io appends — collapsing on the post URL would erase one.
test('likes from different people are not collapsed together', () => {
  const base = 'https://mastodon.social/@esttorhe/117219077409822141';
  const merged = mergeMentions(
    [],
    [
      {
        id: 1,
        type: 'like-of',
        url: `${base}#favorited-by-109279204427464085`,
        author: { name: 'Yves' },
      },
      { id: 2, type: 'like-of', url: `${base}#favorited-by-418802`, author: { name: 'Gilad' } },
    ],
  );
  expect(merged.length).toBe(2);
});

test('a like and a repost of the same post stay separate', () => {
  const url = 'https://mastodon.social/@esttorhe/117219077409822141';
  const merged = mergeMentions(
    [],
    [
      { id: 1, type: 'like-of', url, author: { name: 'Yves' } },
      { id: 2, type: 'repost-of', url, author: { name: 'Yves' } },
    ],
  );
  expect(merged.length).toBe(2);
});

// Without a url there is nothing to compare but the id, and collapsing on a
// missing field would merge unrelated senders into one card.
test('mentions with no url are kept apart', () => {
  const merged = mergeMentions(
    [],
    [
      { id: 1, type: 'mention-of', author: { name: 'Someone' } },
      { id: 2, type: 'mention-of', author: { name: 'Someone else' } },
    ],
  );
  expect(merged.length).toBe(2);
});

test('distinct replies from the same author are both kept', () => {
  const merged = mergeMentions(
    [],
    [
      reply1,
      { ...reply1, id: 2029652, url: 'https://mastodon.social/@esttorhe/117220145745984801' },
    ],
  );
  expect(merged.length).toBe(2);
});

// ---------------------------------------------------------------------------
// thread replies
// ---------------------------------------------------------------------------

// Webmentions are pushed: a reply only reaches the site if the sender's software
// decides to send one. Bridgy resolves targets from the post being replied to,
// one level up — so a reply to a reply finds no link to the site and never
// arrives. Reading the thread instead is a pull, and depth stops mattering.

test('a mention read from a thread is distinguishable from a delivered one', () => {
  expect(isThreadSourced({ id: 1, source: 'thread' })).toBe(true);
  expect(isThreadSourced({ id: 1 })).toBe(false);
  expect(isThreadSourced(undefined)).toBe(false);
});

// Announcing a post on Mastodon is the whole configuration: the announcement
// shows up in the archive as a mention, and its URL is the head of the thread.
test('thread roots are the site owner’s own status urls in a target', () => {
  const roots = threadRootsFor({
    responses: [
      { id: 1, url: 'https://mastodon.social/@esttorhe/117219077409822141' },
      { id: 2, url: 'https://indieweb.social/@yvg/117220108533049251' },
    ],
    reactions: [
      { id: 3, url: 'https://mastodon.social/@esttorhe/117219077409822141#favorited-by-1' },
    ],
  });
  expect(roots).toEqual(['https://mastodon.social/@esttorhe/117219077409822141']);
});

test('a target with no own status has no thread to read', () => {
  expect(
    threadRootsFor({ responses: [{ id: 1, url: 'https://example.com/post' }], reactions: [] }),
  ).toEqual([]);
});

test('a status url resolves to the instance and id needed to fetch it', () => {
  expect(statusRefFromUrl('https://mastodon.social/@esttorhe/117219077409822141')).toEqual({
    host: 'mastodon.social',
    id: '117219077409822141',
  });
  expect(statusRefFromUrl('https://estebantorr.es/2026/09/a-post/')).toBe(null);
  expect(statusRefFromUrl(undefined)).toBe(null);
});

const janStatus = {
  id: '117222360834519501',
  url: 'https://social.lol/@janmon/117222360834519501',
  created_at: '2026-09-06T05:07:57.000Z',
  content: '<p><span>@yvg</span> @esttorhe yeah, I should revisit<br />some parts &amp; pieces</p>',
  account: {
    acct: 'janmon@social.lol',
    display_name: 'Jan',
    url: 'https://social.lol/@janmon',
    avatar: 'https://files.social.lol/avatar.jpg',
  },
};

test('a thread reply is shaped like every other mention', () => {
  const m = shapeThreadReply(janStatus);
  expect(m.type).toBe('in-reply-to');
  expect(m.url).toBe('https://social.lol/@janmon/117222360834519501');
  expect(m.published).toBe('2026-09-06T05:07:57.000Z');
  expect(m.author.name).toBe('Jan');
  expect(m.author.url).toBe('https://social.lol/@janmon');
  expect(isThreadSourced(m)).toBe(true);
});

// The API hands back HTML; the archive stores plain text like webmention.io does.
test('reply markup becomes plain text with entities decoded', () => {
  expect(shapeThreadReply(janStatus).text).toBe(
    '@yvg @esttorhe yeah, I should revisit\nsome parts & pieces',
  );
});

test('paragraph breaks in a reply are preserved', () => {
  const m = shapeThreadReply({ ...janStatus, content: '<p>first</p><p>second</p>' });
  expect(m.text).toBe('first\n\nsecond');
});

test('an account with no display name falls back to its handle', () => {
  const m = shapeThreadReply({
    ...janStatus,
    account: { ...janStatus.account, display_name: '' },
  });
  expect(m.author.name).toBe('janmon@social.lol');
});

// webmention.io's copy carries normalized author data and a self-hosted avatar;
// the thread copy has only what the API returned. So when the same reply arrives
// both ways the delivered one wins, whichever id happens to be larger.
test('a delivered webmention beats the thread copy of the same reply', () => {
  const url = 'https://indieweb.social/@yvg/117220108533049251';
  const delivered = {
    id: 2029524,
    type: 'in-reply-to',
    url,
    author: { name: 'Yves', photo: '/local.jpg' },
  };
  const fromThread = {
    id: 117220108533049251,
    type: 'in-reply-to',
    url,
    source: 'thread',
    author: { name: 'Yves' },
  };

  expect(mergeMentions([delivered], [fromThread])[0].author.photo).toBe('/local.jpg');
  expect(mergeMentions([fromThread], [delivered])[0].author.photo).toBe('/local.jpg');
});

// markRemoved sweeps anything missing from webmention.io's feed. Thread replies
// are never in that feed, so without an exemption every one of them would be
// marked removed on the very next sync.
test('thread replies survive the webmention removal sweep', () => {
  const targets = {
    'https://estebantorr.es/p': {
      responses: [
        { id: 1, type: 'in-reply-to', url: 'https://a.example/1' },
        { id: 2, type: 'in-reply-to', url: 'https://b.example/2', source: 'thread' },
      ],
      reactions: [],
    },
  };
  const result = markRemoved(targets, new Set([1]), { at: 'now' });
  const [delivered, fromThread] = result.targets['https://estebantorr.es/p'].responses;
  expect(delivered.removed).toBeUndefined();
  expect(fromThread.removed).toBeUndefined();
  expect(result.removedCount).toBe(0);
});

const threadReply = {
  id: 117222360834519501,
  type: 'in-reply-to',
  url: 'https://social.lol/@janmon/117222360834519501',
  source: 'thread',
  author: { name: 'Jan' },
};

test('a freshly read thread reply is added to the target', () => {
  const bucket = mergeThreadReplies({ responses: [], reactions: [] }, [threadReply], { at: 'now' });
  expect(bucket.responses.length).toBe(1);
  expect(bucket.responses[0].url).toBe(threadReply.url);
});

test('a thread reply deleted upstream is marked removed rather than dropped', () => {
  const bucket = mergeThreadReplies({ responses: [threadReply], reactions: [] }, [], { at: 'now' });
  expect(bucket.responses.length).toBe(1);
  expect(bucket.responses[0].removed).toBe(true);
  expect(bucket.responses[0].removedAt).toBe('now');
});

// A network blip is not a deletion — the same mistake markRemoved guards against.
test('a thread that could not be read leaves its replies untouched', () => {
  const bucket = mergeThreadReplies({ responses: [threadReply], reactions: [] }, [], {
    at: 'now',
    ok: false,
  });
  expect(bucket.responses[0].removed).toBeUndefined();
});

test('a thread reply that reappears is un-removed', () => {
  const gone = { ...threadReply, removed: true, removedAt: 'earlier' };
  const bucket = mergeThreadReplies({ responses: [gone], reactions: [] }, [threadReply], {
    at: 'now',
  });
  expect(bucket.responses[0].removed).toBeUndefined();
  expect(bucket.responses[0].removedAt).toBeUndefined();
});

test('a delivered mention is not touched by the thread sweep', () => {
  const delivered = { id: 7, type: 'in-reply-to', url: 'https://a.example/1' };
  const bucket = mergeThreadReplies({ responses: [delivered], reactions: [] }, [], { at: 'now' });
  expect(bucket.responses[0].removed).toBeUndefined();
});

// ---------------------------------------------------------------------------
// review follow-ups
// ---------------------------------------------------------------------------

// Mastodon snowflakes run past Number.MAX_SAFE_INTEGER: Number('117222360834519501')
// is 117222360834519500, and the very next id rounds to the same value. Coercing
// them would let one reply silently overwrite another in the id-keyed map.
test('a status id is kept exactly as the api returned it', () => {
  const m = shapeThreadReply({ ...janStatus, id: '117222360834519501' });
  expect(m.id).toBe('117222360834519501');
  expect(String(m.id)).toBe('117222360834519501');
});

test('two replies with adjacent ids both survive the merge', () => {
  const a = shapeThreadReply({
    ...janStatus,
    id: '117222360834519501',
    url: 'https://social.lol/@a/1',
  });
  const b = shapeThreadReply({
    ...janStatus,
    id: '117222360834519502',
    url: 'https://social.lol/@b/2',
  });
  expect(mergeMentions([], [a, b]).length).toBe(2);
});

// Sorting keeps the diff stable, so it has to cope with both kinds of id.
test('mixed wm-ids and status ids sort deterministically', () => {
  const wm = { id: 2029524, type: 'in-reply-to', url: 'https://a.example/1' };
  const t1 = {
    id: '117222360834519501',
    type: 'in-reply-to',
    url: 'https://b.example/2',
    source: 'thread',
  };
  const t2 = {
    id: '117222360834519499',
    type: 'in-reply-to',
    url: 'https://c.example/3',
    source: 'thread',
  };

  const once = mergeMentions([], [wm, t1, t2]).map((m) => String(m.id));
  const again = mergeMentions([], [t2, wm, t1]).map((m) => String(m.id));
  expect(once).toEqual(again);
  expect(once).toEqual(['2029524', '117222360834519499', '117222360834519501']);
});

test('the newer of two thread copies still wins', () => {
  const url = 'https://social.lol/@janmon/1';
  const older = {
    id: '117222360834519501',
    type: 'in-reply-to',
    url,
    source: 'thread',
    text: 'first',
  };
  const newer = {
    id: '117222360834519502',
    type: 'in-reply-to',
    url,
    source: 'thread',
    text: 'edited',
  };
  expect(mergeMentions([older], [newer])[0].text).toBe('edited');
  expect(mergeMentions([newer], [older])[0].text).toBe('edited');
});

// A deleted or newly-private root answers 404, which is Mastodon saying the
// thread is gone — its replies should be retired. A 502 says nothing of the
// kind, and retiring on one would be the blip-as-deletion mistake again.
test('only a definitive not-found means the thread is gone', () => {
  expect(isThreadGone(404)).toBe(true);
  expect(isThreadGone(410)).toBe(true);
  // An instance that requires auth, or blocks the runner, is saying "you may
  // not look" — not "this was deleted". indieweb.social answers 401 to
  // unauthenticated ActivityPub reads, so this is not hypothetical.
  expect(isThreadGone(401)).toBe(false);
  expect(isThreadGone(403)).toBe(false);
  expect(isThreadGone(418)).toBe(false);
  expect(isThreadGone(502)).toBe(false);
  expect(isThreadGone(429)).toBe(false);
  expect(isThreadGone(undefined)).toBe(false);
});

// Mastodon caps an unauthenticated context read at 60 descendants and depth 20
// (documented, and not paginated — there is no second page to ask for). A thread
// that comes back at the cap has almost certainly been cut short, and the
// replies past it are missing rather than deleted.
test('a thread read at the descendant cap counts as truncated', () => {
  expect(isThreadTruncated(0)).toBe(false);
  expect(isThreadTruncated(59)).toBe(false);
  expect(isThreadTruncated(THREAD_DESCENDANTS_LIMIT)).toBe(true);
  expect(isThreadTruncated(THREAD_DESCENDANTS_LIMIT + 5)).toBe(true);
});

// The guard has to reach mergeThreadReplies as ok:false, or a big thread would
// have its tail retired on every sync.
test('a truncated read leaves the replies it could not see alone', () => {
  const unseen = {
    id: '117222360834519501',
    type: 'in-reply-to',
    url: 'https://social.lol/@janmon/1',
    source: 'thread',
    author: { name: 'Jan' },
  };
  const bucket = mergeThreadReplies({ responses: [unseen], reactions: [] }, [], {
    at: 'now',
    ok: !isThreadTruncated(THREAD_DESCENDANTS_LIMIT),
  });
  expect(bucket.responses[0].removed).toBeUndefined();
});

// A content warning is the author saying they do not want the body read
// unfolded. The reply is kept — dropping it would lose the conversation — but
// the warning travels with it so the page can fold the body and let the reader
// choose, which is what the warning asks for.
test('a reply behind a content warning is recognised', () => {
  expect(isConcealed({ spoiler_text: 'spoilers for the finale' })).toBe(true);
  expect(isConcealed({ spoiler_text: '' })).toBe(false);
  expect(isConcealed({ spoiler_text: '   ' })).toBe(false);
  expect(isConcealed({})).toBe(false);
  expect(isConcealed(undefined)).toBe(false);
});

// Unauthenticated context reads return unlisted statuses as well as public
// ones — unlisted means "do not list or index me", not "private". Copying one
// onto a public page, and into a public git repo, overrides exactly the choice
// its author made.
test('only public replies are eligible to be imported', () => {
  expect(isPubliclyListed({ visibility: 'public' })).toBe(true);
  expect(isPubliclyListed({ visibility: 'unlisted' })).toBe(false);
  expect(isPubliclyListed({ visibility: 'private' })).toBe(false);
  expect(isPubliclyListed({ visibility: 'direct' })).toBe(false);
  // An instance that omits the field gets the cautious reading, not the
  // permissive one.
  expect(isPubliclyListed({})).toBe(false);
  expect(isPubliclyListed(undefined)).toBe(false);
});

// Mastodon also cuts an unauthenticated read at depth 20, independently of the
// 60-descendant cap — so a long narrow chain is truncated while the count stays
// well under the cap.
test('thread depth is measured from the root', () => {
  const flat = [
    { id: '2', in_reply_to_id: '1' },
    { id: '3', in_reply_to_id: '1' },
  ];
  expect(threadDepth(flat)).toBe(1);

  const chain = [
    { id: '2', in_reply_to_id: '1' },
    { id: '3', in_reply_to_id: '2' },
    { id: '4', in_reply_to_id: '3' },
  ];
  expect(threadDepth(chain)).toBe(3);
  expect(threadDepth([])).toBe(0);
});

test('a chain reaching the depth cutoff counts as an incomplete read', () => {
  const chain = [];
  for (let i = 2; i <= THREAD_DEPTH_LIMIT + 1; i += 1) {
    chain.push({ id: String(i), in_reply_to_id: String(i - 1) });
  }
  expect(chain.length).toBeLessThan(THREAD_DESCENDANTS_LIMIT);
  expect(isThreadTruncated(chain.length)).toBe(false);
  expect(threadDepth(chain)).toBeGreaterThanOrEqual(THREAD_DEPTH_LIMIT);
});

test('a content warning travels with the reply rather than dropping it', () => {
  const m = shapeThreadReply({ ...janStatus, spoiler_text: 'spoilers for the finale' });
  expect(m.warning).toBe('spoilers for the finale');
  expect(m.text).toBe('@yvg @esttorhe yeah, I should revisit\nsome parts & pieces');
});

// Absent rather than empty: the archive is committed, and a blank field on every
// uncovered reply is noise in the diff.
test('a reply with no content warning carries no warning field', () => {
  expect('warning' in shapeThreadReply(janStatus)).toBe(false);
  expect('warning' in shapeThreadReply({ ...janStatus, spoiler_text: '   ' })).toBe(false);
});

// A root that has been retired — the announcement deleted, or edited to drop the
// link — must stop pulling in replies. It stays in the archive as a record, but
// its thread is no longer about this page, and new replies to it would otherwise
// keep landing here.
test('a retired root stops being read', () => {
  const bucket = {
    responses: [
      {
        id: 1,
        url: 'https://mastodon.social/@esttorhe/117219077409822141',
        removed: true,
        removedAt: 'earlier',
      },
    ],
    reactions: [],
  };
  expect(threadRootsFor(bucket)).toEqual([]);
});

test('a live root alongside a retired one is still read', () => {
  const bucket = {
    responses: [
      { id: 1, url: 'https://mastodon.social/@esttorhe/111', removed: true },
      { id: 2, url: 'https://mastodon.social/@esttorhe/222' },
    ],
    reactions: [],
  };
  expect(threadRootsFor(bucket)).toEqual(['https://mastodon.social/@esttorhe/222']);
});

// Hitting a cap means "we did not see all of it", not "we saw none of it": the
// replies that did come back are still real and still belong on the page. `ok`
// only decides whether the removal sweep may run.
test('a capped thread still yields the replies it did return', () => {
  const descendants = [];
  for (let i = 1; i <= THREAD_DESCENDANTS_LIMIT; i += 1) {
    descendants.push({
      id: String(1000 + i),
      url: `https://social.lol/@someone/${i}`,
      visibility: 'public',
      created_at: '2026-09-06T00:00:00.000Z',
      content: `<p>reply ${i}</p>`,
      account: { acct: 'someone@social.lol', display_name: 'Someone' },
    });
  }
  const result = repliesFromContext({ descendants });
  expect(result.replies.length).toBe(THREAD_DESCENDANTS_LIMIT);
  expect(result.ok).toBe(false);
});

// A body we do not understand is not an empty thread. Treating it as one would
// retire every reply already in the archive.
test('a context payload with no descendants array is not an empty thread', () => {
  expect(repliesFromContext({}).ok).toBe(false);
  expect(repliesFromContext(null).ok).toBe(false);
  expect(repliesFromContext({ descendants: 'nope' }).ok).toBe(false);
  expect(repliesFromContext({}).replies).toEqual([]);
});

test('a genuinely empty thread is complete, so its replies can be retired', () => {
  const result = repliesFromContext({ descendants: [] });
  expect(result.ok).toBe(true);
  expect(result.replies).toEqual([]);
});

test('unlisted replies are dropped while the rest come through', () => {
  const result = repliesFromContext({
    descendants: [
      { ...janStatus, visibility: 'public' },
      { ...janStatus, id: '2', url: 'https://social.lol/@x/2', visibility: 'unlisted' },
    ],
  });
  expect(result.replies.length).toBe(1);
  expect(result.withheld).toBe(1);
});
