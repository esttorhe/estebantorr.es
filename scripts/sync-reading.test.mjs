// ABOUTME: Tests for the vault-note classification rules in sync-reading.mjs.
// ABOUTME: Run with `bun test scripts/sync-reading.test.mjs`.

import { test, expect } from 'bun:test';
import { classify } from './sync-reading.mjs';

test('read: true with a finished date is finished', () => {
  expect(classify({ read: true, finished: '2026-07-30' })).toBe('finished');
});

test('status: read with a finished date is finished even when read is false', () => {
  expect(classify({ read: false, status: 'read', finished: '2026-08-12' })).toBe('finished');
});

test('started but not finished is currently reading', () => {
  expect(classify({ read: false, started: '2026-08-12' })).toBe('currentlyReading');
});

test('status: reading without a finished date is currently reading', () => {
  expect(classify({ read: false, status: 'reading', started: '2026-08-12' })).toBe(
    'currentlyReading',
  );
});

test('backlog — never started, never finished — is skipped', () => {
  expect(classify({ read: false })).toBe('skipped');
});

// The bug: a note marked done via `status` while `read` stayed false has a
// finished date, so it matched neither the finished nor the currently-reading
// rule and vanished from the site without a trace.
test('done via status with a finished date is never silently dropped', () => {
  expect(
    classify({ read: false, status: 'read', started: '2026-08-04', finished: '2026-08-12' }),
  ).toBe('finished');
});

// A finished date alone is enough — some notes carry the date but neither
// completion marker. Dropping those is what hid Transmetropolitan Vol. 0.
test('a finished date with no completion marker is still finished', () => {
  expect(classify({ read: false, finished: '2026-07-30' })).toBe('finished');
});

test('status is matched case-insensitively and ignores surrounding whitespace', () => {
  expect(classify({ read: false, status: ' Read ', finished: '2026-08-12' })).toBe('finished');
});

// A DNF carries a finished date just like a completed book, so it needs an
// explicit opt-out or the date-driven rule would count it as read.
test('status: dnf is skipped despite having a finished date', () => {
  expect(
    classify({ read: false, status: 'dnf', started: '2026-07-29', finished: '2026-07-29' }),
  ).toBe('skipped');
});

// read: true with no dates at all can't be placed on a timeline — it has always
// been dropped, and must stay dropped rather than sorting as an invalid date.
test('marked read but with no dates is skipped', () => {
  expect(classify({ read: true, started: '', finished: '' })).toBe('skipped');
});
