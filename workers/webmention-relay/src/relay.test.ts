// ABOUTME: Tests for the relay's pure logic — secret comparison, payload validation, dispatch body.
// ABOUTME: Run with `bun test`.

import { test, expect } from 'bun:test';
import { secretsMatch, validatePayload, dispatchBody, dispatchHeaders } from './relay';

// ---------------------------------------------------------------------------
// secretsMatch
// ---------------------------------------------------------------------------

test('an identical secret matches', () => {
  expect(secretsMatch('s3cret', 's3cret')).toBe(true);
});

test('a different secret of the same length does not match', () => {
  expect(secretsMatch('s3cret', 's3creT')).toBe(false);
});

test('a different length does not match', () => {
  expect(secretsMatch('s3cret', 's3cret-longer')).toBe(false);
});

// An unconfigured relay must reject everything rather than accept everything —
// the failure mode of a missing binding has to be closed, not open.
test('an empty or missing expected secret rejects', () => {
  expect(secretsMatch('anything', '')).toBe(false);
  expect(secretsMatch('anything', undefined)).toBe(false);
});

test('a non-string provided secret rejects', () => {
  expect(secretsMatch(undefined, 's3cret')).toBe(false);
  expect(secretsMatch(42, 's3cret')).toBe(false);
  expect(secretsMatch({ toString: () => 's3cret' }, 's3cret')).toBe(false);
});

// ---------------------------------------------------------------------------
// validatePayload
// ---------------------------------------------------------------------------

const received = {
  secret: 's3cret',
  source: 'https://brid.gy/repost/mastodon/x/y/z',
  target: 'https://estebantorr.es/til/reduce-not-time-but-complexity/',
  post: { 'wm-property': 'repost-of' },
};

test('a received-mention payload validates', () => {
  expect(validatePayload(received)).toEqual({
    source: 'https://brid.gy/repost/mastodon/x/y/z',
    target: 'https://estebantorr.es/til/reduce-not-time-but-complexity/',
    deleted: false,
  });
});

// The deletion payload carries no `post` at all, so validation must not depend
// on it. See views/webhooks.erb in aaronpk/webmention.io.
test('a deletion payload validates and carries the flag', () => {
  const result = validatePayload({
    secret: 's3cret',
    source: 'https://example.com/reply/1',
    target: 'https://estebantorr.es/about/',
    deleted: true,
  });
  expect(result).toEqual({
    source: 'https://example.com/reply/1',
    target: 'https://estebantorr.es/about/',
    deleted: true,
  });
});

test('deleted is only true for a literal true', () => {
  expect(validatePayload({ ...received, deleted: 'yes' })?.deleted).toBe(false);
  expect(validatePayload({ ...received, deleted: 1 })?.deleted).toBe(false);
});

// A target on another domain means the webhook was misdirected or forged; the
// sync only ever reads estebantorr.es, so triggering it would be pointless work.
test('a target on another domain is rejected', () => {
  expect(validatePayload({ ...received, target: 'https://example.com/post/' })).toBeNull();
});

test('a malformed target is rejected', () => {
  expect(validatePayload({ ...received, target: 'not-a-url' })).toBeNull();
});

test('a missing source or target is rejected', () => {
  expect(validatePayload({ ...received, source: undefined })).toBeNull();
  expect(validatePayload({ ...received, target: undefined })).toBeNull();
  expect(validatePayload({ ...received, source: '' })).toBeNull();
});

test('non-string source or target is rejected', () => {
  expect(validatePayload({ ...received, source: 42 })).toBeNull();
});

// ---------------------------------------------------------------------------
// dispatchBody / dispatchHeaders
// ---------------------------------------------------------------------------

test('the dispatch body uses the event type the sync workflow listens for', () => {
  const body = JSON.parse(dispatchBody({ source: 'a', target: 'b', deleted: false }));
  expect(body.event_type).toBe('webmention_received');
  expect(body.client_payload).toEqual({ source: 'a', target: 'b', deleted: false });
});

// The secret must never be forwarded to GitHub — it is ours, not theirs.
test('the dispatch body does not leak the webhook secret', () => {
  const body = dispatchBody(validatePayload(received)!);
  expect(body).not.toContain('s3cret');
});

test('dispatch headers carry the token, api version and a user agent', () => {
  const h = dispatchHeaders('ghp_example');
  expect(h.Authorization).toBe('Bearer ghp_example');
  expect(h['X-GitHub-Api-Version']).toBe('2022-11-28');
  expect(h['User-Agent']).toBeTruthy();
});
