// ABOUTME: Tests for the shared webmention vocabulary — self-author detection across every identity form.
// ABOUTME: Run with `bun test`. Target normalization is covered from the script side in scripts/sync-webmentions.test.mjs.

import { test, expect } from 'bun:test';
import { isSelfAuthor, isHiddenSelfResponse, OWN_IDENTITIES } from './webmentionTarget';

// The real case that prompted this: Bridgy Fed (bsky.brid.gy) backfeeds your own
// POSSE announcement to your own page as a mention-of, so the post ends up
// quoting you back at yourself in its Responses region.
test('the bluesky handle profile is self', () => {
  expect(isSelfAuthor('https://bsky.app/profile/estebantorr.es')).toBe(true);
});

// Bridgy Fed identifies the same account by DID rather than handle depending on
// which surface produced the mention, so both spellings have to be recognised.
test('the bluesky DID profile is self', () => {
  expect(isSelfAuthor('https://bsky.app/profile/did:plc:d3j753j2jsi5lk7pr7ho4ven')).toBe(true);
});

test('the mastodon profile is self', () => {
  expect(isSelfAuthor('https://mastodon.social/@esttorhe')).toBe(true);
});

test('the site itself is self', () => {
  expect(isSelfAuthor('https://estebantorr.es')).toBe(true);
  expect(isSelfAuthor('https://estebantorr.es/')).toBe(true);
});

// normalizeTarget does the comparing, so scheme and trailing-slash variants of
// an identity must collapse the same way targets do.
test('scheme and trailing-slash variants of an identity still match', () => {
  expect(isSelfAuthor('http://bsky.app/profile/estebantorr.es/')).toBe(true);
});

test('a real other person is not self', () => {
  expect(isSelfAuthor('https://ohai.social/@aligatr')).toBe(false);
  expect(isSelfAuthor('https://janmonschke.com/')).toBe(false);
});

// A same-host account that is not yours must not be swept up — matching is on
// the whole normalized URL, not the host.
test('a different account on the same host is not self', () => {
  expect(isSelfAuthor('https://mastodon.social/@someoneelse')).toBe(false);
  expect(isSelfAuthor('https://bsky.app/profile/someoneelse.example')).toBe(false);
});

// A mention with no author URL at all must not be treated as self, or anonymous
// senders would silently vanish from the page.
test('a missing or malformed author url is not self', () => {
  expect(isSelfAuthor(undefined)).toBe(false);
  expect(isSelfAuthor('')).toBe(false);
  expect(isSelfAuthor('not-a-url')).toBe(false);
});

test('every declared identity is recognised by isSelfAuthor', () => {
  for (const identity of OWN_IDENTITIES) {
    expect(isSelfAuthor(identity)).toBe(true);
  }
});

// ---------------------------------------------------------------------------
// isHiddenSelfResponse — which of my own mentions are noise
// ---------------------------------------------------------------------------

const ME = 'https://bsky.app/profile/estebantorr.es';
const ME_MASTODON = 'https://mastodon.social/@esttorhe';
const SOMEONE = 'https://ohai.social/@aligatr';

// The case this rule exists for: Bridgy Fed backfeeds my own POSSE
// announcement — title plus a link, no substance — as a mention-of.
test('my own mention-of is hidden', () => {
  expect(isHiddenSelfResponse(ME, 'mention-of')).toBe(true);
});

// The case the first version of this rule got wrong: my reply inside a thread
// is part of the conversation, and dropping it left the other person talking
// to nobody on my own page.
test('my own reply is shown', () => {
  expect(isHiddenSelfResponse(ME_MASTODON, 'in-reply-to')).toBe(false);
  expect(isHiddenSelfResponse(ME, 'in-reply-to')).toBe(false);
});

test('my own likes, reposts and bookmarks are hidden', () => {
  expect(isHiddenSelfResponse(ME, 'like-of')).toBe(true);
  expect(isHiddenSelfResponse(ME, 'repost-of')).toBe(true);
  expect(isHiddenSelfResponse(ME, 'bookmark-of')).toBe(true);
});

test('nothing from anyone else is ever hidden', () => {
  for (const type of [
    'in-reply-to',
    'mention-of',
    'like-of',
    'repost-of',
    'bookmark-of',
  ] as const) {
    expect(isHiddenSelfResponse(SOMEONE, type)).toBe(false);
  }
});

test('an absent author url is never hidden', () => {
  expect(isHiddenSelfResponse(undefined, 'mention-of')).toBe(false);
});
