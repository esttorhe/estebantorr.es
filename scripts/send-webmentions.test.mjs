// ABOUTME: Tests for the outbound sender in send-webmentions.mjs — link extraction, endpoint discovery, and the sent-ledger rules.
// ABOUTME: Run with `bun test`.

import { test, expect } from 'bun:test';
import {
  extractOutboundLinks,
  endpointFromLinkHeader,
  endpointFromHtml,
  isSendableTarget,
  shouldSend,
  recordResult,
  MAX_ATTEMPTS,
  MAX_TRANSIENT_ATTEMPTS,
  isTransientFailure,
} from './send-webmentions.mjs';

const OWN_HOST = 'estebantorr.es';

// ---------------------------------------------------------------------------
// extractOutboundLinks — must see only the post body
// ---------------------------------------------------------------------------

const page = `<html><head>
  <link rel="canonical" href="https://estebantorr.es/2026/06/a-post/">
</head><body>
  <nav><a href="https://github.com/esttorhe">nav link</a></nav>
  <article class="article h-entry">
    <div class="prose e-content">
      <p>See <a href="https://janmonschke.com/adding-webmentions/">this post</a> and
         <a href="https://webmention.io/">webmention.io</a>.</p>
      <p>Also <a href="https://janmonschke.com/adding-webmentions/">the same link twice</a>,
         an <a href="/2026/02/internal/">internal one</a>,
         a <a href="mailto:someone@example.com">mailto</a>,
         and an <a href="#anchor">anchor</a>.</p>
    </div>
  </article>
  <footer><a href="https://linkedin.com/in/estebantorres" rel="me">footer link</a></footer>
</body></html>`;

// The footer carries rel=me links to github/mastodon/linkedin on every single
// page. Scanning the whole document would notify all of them for every post.
test('only links inside e-content are collected', async () => {
  const links = await extractOutboundLinks(page, OWN_HOST);
  expect(links).not.toContain('https://github.com/esttorhe');
  expect(links).not.toContain('https://linkedin.com/in/estebantorres');
});

test('external body links are collected and deduped', async () => {
  const links = await extractOutboundLinks(page, OWN_HOST);
  expect(links).toContain('https://janmonschke.com/adding-webmentions/');
  expect(links).toContain('https://webmention.io/');
  expect(links.filter((l) => l === 'https://janmonschke.com/adding-webmentions/')).toHaveLength(1);
});

// Notifying yourself is pointless, and mailto/anchor targets have no endpoint.
test('internal, mailto and anchor links are skipped', async () => {
  const links = await extractOutboundLinks(page, OWN_HOST);
  expect(links.some((l) => l.includes('estebantorr.es'))).toBe(false);
  expect(links.some((l) => l.startsWith('mailto:'))).toBe(false);
  expect(links.some((l) => l.includes('#anchor'))).toBe(false);
});

test('a page with no e-content yields nothing', async () => {
  const links = await extractOutboundLinks(
    '<html><body><a href="https://example.com/">x</a></body></html>',
    OWN_HOST,
  );
  expect(links).toEqual([]);
});

// ---------------------------------------------------------------------------
// isSendableTarget
// ---------------------------------------------------------------------------

test('external https targets are sendable', () => {
  expect(isSendableTarget('https://example.com/post/', OWN_HOST)).toBe(true);
});

test('own-host and non-http targets are not sendable', () => {
  expect(isSendableTarget('https://estebantorr.es/about/', OWN_HOST)).toBe(false);
  expect(isSendableTarget('mailto:a@b.com', OWN_HOST)).toBe(false);
  expect(isSendableTarget('javascript:alert(1)', OWN_HOST)).toBe(false);
  expect(isSendableTarget('not-a-url', OWN_HOST)).toBe(false);
});

// A loopback or private target can only be a mistake, and sending to one from
// CI would be a small SSRF footgun.
test('loopback and private hosts are not sendable', () => {
  expect(isSendableTarget('http://localhost:4321/x/', OWN_HOST)).toBe(false);
  expect(isSendableTarget('http://127.0.0.1/x/', OWN_HOST)).toBe(false);
  expect(isSendableTarget('http://192.168.1.5/x/', OWN_HOST)).toBe(false);
  expect(isSendableTarget('http://10.0.0.1/x/', OWN_HOST)).toBe(false);
});

// ---------------------------------------------------------------------------
// endpointFromLinkHeader — highest precedence per the spec
// ---------------------------------------------------------------------------

const BASE = 'https://example.com/post/';

test('an absolute endpoint in the Link header is found', () => {
  expect(
    endpointFromLinkHeader(
      '<https://webmention.io/example.com/webmention>; rel="webmention"',
      BASE,
    ),
  ).toBe('https://webmention.io/example.com/webmention');
});

test('a relative endpoint in the Link header resolves against the target', () => {
  expect(endpointFromLinkHeader('</wm>; rel="webmention"', BASE)).toBe('https://example.com/wm');
});

// rel is a space-separated token list, and matching must be per-token so that
// "webmention" inside another word does not count.
test('rel is matched as a token, not a substring', () => {
  expect(endpointFromLinkHeader('<https://a.example/wm>; rel="me webmention"', BASE)).toBe(
    'https://a.example/wm',
  );
  expect(endpointFromLinkHeader('<https://a.example/wm>; rel="webmentions"', BASE)).toBeNull();
  expect(endpointFromLinkHeader('<https://a.example/wm>; rel="notawebmention"', BASE)).toBeNull();
});

test('rel matching is case-insensitive', () => {
  expect(endpointFromLinkHeader('<https://a.example/wm>; rel="WebMention"', BASE)).toBe(
    'https://a.example/wm',
  );
});

test('the first webmention rel wins among several Link values', () => {
  const header =
    '<https://a.example/first>; rel="webmention", <https://a.example/second>; rel="webmention"';
  expect(endpointFromLinkHeader(header, BASE)).toBe('https://a.example/first');
});

test('unrelated Link values are ignored', () => {
  expect(endpointFromLinkHeader('<https://a.example/style.css>; rel="preload"', BASE)).toBeNull();
  expect(endpointFromLinkHeader('', BASE)).toBeNull();
  expect(endpointFromLinkHeader(null, BASE)).toBeNull();
});

// ---------------------------------------------------------------------------
// endpointFromHtml
// ---------------------------------------------------------------------------

test('a <link rel=webmention> in the head is found', async () => {
  const html =
    '<html><head><link rel="webmention" href="https://webmention.io/x/webmention"></head><body></body></html>';
  expect(await endpointFromHtml(html, BASE)).toBe('https://webmention.io/x/webmention');
});

test('an <a rel=webmention> in the body is found', async () => {
  const html = '<html><body><a rel="webmention" href="/wm">send</a></body></html>';
  expect(await endpointFromHtml(html, BASE)).toBe('https://example.com/wm');
});

// Per the spec, whichever comes first in document order wins — including when
// an <a> precedes a <link>.
test('the first webmention element in document order wins', async () => {
  const html =
    '<html><body><a rel="webmention" href="/first">a</a><link rel="webmention" href="/second"></body></html>';
  expect(await endpointFromHtml(html, BASE)).toBe('https://example.com/first');
});

// The spec says an empty href means the target page itself is the endpoint.
test('an empty href resolves to the target itself', async () => {
  const html = '<html><head><link rel="webmention" href=""></head></html>';
  expect(await endpointFromHtml(html, BASE)).toBe(BASE);
});

test('a page with no webmention rel yields null', async () => {
  expect(await endpointFromHtml('<html><body><a href="/x">x</a></body></html>', BASE)).toBeNull();
});

// ---------------------------------------------------------------------------
// Ledger
// ---------------------------------------------------------------------------

const S = 'https://estebantorr.es/2026/06/a-post/';
const T = 'https://example.com/post/';

test('an unseen pair is sent', () => {
  expect(shouldSend({}, S, T)).toBe(true);
});

// Re-sending a delivered webmention on every build would spam the receiver.
test('a delivered pair is never sent again', () => {
  const ledger = recordResult({}, S, T, { status: 'ok', code: 202 });
  expect(shouldSend(ledger, S, T)).toBe(false);
});

test('a permanently failing pair is retried until the attempt cap', () => {
  let ledger = {};
  for (let i = 1; i < MAX_ATTEMPTS; i += 1) {
    ledger = recordResult(ledger, S, T, { status: 'failed', code: 404 });
    expect(shouldSend(ledger, S, T)).toBe(true);
  }
  ledger = recordResult(ledger, S, T, { status: 'failed', code: 404 });
  expect(shouldSend(ledger, S, T)).toBe(false);
});

// A site with no endpoint today may add one later, but re-probing forever costs
// a request per link per run — so it is capped like a failure.
test('a no-endpoint pair is retried but also capped', () => {
  let ledger = {};
  for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
    ledger = recordResult(ledger, S, T, { status: 'no-endpoint' });
  }
  expect(shouldSend(ledger, S, T)).toBe(false);
});

test('attempts accumulate rather than reset', () => {
  let ledger = recordResult({}, S, T, { status: 'failed', code: 404 });
  ledger = recordResult(ledger, S, T, { status: 'failed', code: 404 });
  expect(ledger[S][T].attempts).toBe(2);
});

// Different targets under the same source must not share a record.
test('targets are tracked independently under a source', () => {
  let ledger = recordResult({}, S, T, { status: 'ok', code: 202 });
  ledger = recordResult(ledger, S, 'https://other.example/', { status: 'failed', code: 404 });
  expect(shouldSend(ledger, S, T)).toBe(false);
  expect(shouldSend(ledger, S, 'https://other.example/')).toBe(true);
});

test('recordResult does not mutate the ledger it is given', () => {
  const before = {};
  const after = recordResult(before, S, T, { status: 'ok', code: 202 });
  expect(before).toEqual({});
  expect(after[S][T].status).toBe('ok');
});

// ---------------------------------------------------------------------------
// transient vs permanent failures
// ---------------------------------------------------------------------------

// The attempt cap exists to stop re-probing sites that will never support
// webmentions. A 502 says nothing about whether the target supports them — it
// says the receiver is having a bad day — so spending the same budget on it
// means an outage lasting MAX_ATTEMPTS runs abandons the pair for good.

test('server errors, rate limiting and network errors are transient', () => {
  expect(isTransientFailure({ status: 'failed', code: 502 })).toBe(true);
  expect(isTransientFailure({ status: 'failed', code: 503 })).toBe(true);
  expect(isTransientFailure({ status: 'failed', code: 429 })).toBe(true);
  expect(isTransientFailure({ status: 'failed' })).toBe(true);
});

test('client errors and non-failures are not transient', () => {
  expect(isTransientFailure({ status: 'failed', code: 404 })).toBe(false);
  expect(isTransientFailure({ status: 'failed', code: 400 })).toBe(false);
  expect(isTransientFailure({ status: 'no-endpoint' })).toBe(false);
  expect(isTransientFailure({ status: 'ok', code: 202 })).toBe(false);
});

test('a transient failure does not spend the permanent attempt budget', () => {
  let ledger = {};
  for (let i = 0; i < MAX_ATTEMPTS + 2; i += 1) {
    ledger = recordResult(ledger, S, T, { status: 'failed', code: 502 });
  }
  expect(ledger[S][T].attempts).toBe(0);
  expect(shouldSend(ledger, S, T)).toBe(true);
});

// Without a backstop an unreachable host would be re-probed on every run
// forever, which is the cost the attempt cap was introduced to avoid.
test('transient failures still stop eventually', () => {
  let ledger = {};
  for (let i = 1; i < MAX_TRANSIENT_ATTEMPTS; i += 1) {
    ledger = recordResult(ledger, S, T, { status: 'failed', code: 502 });
    expect(shouldSend(ledger, S, T)).toBe(true);
  }
  ledger = recordResult(ledger, S, T, { status: 'failed', code: 502 });
  expect(shouldSend(ledger, S, T)).toBe(false);
});

// An outage that clears must not leave the pair closer to being abandoned.
test('a transient failure followed by a permanent one spends only one attempt', () => {
  let ledger = recordResult({}, S, T, { status: 'failed', code: 502 });
  ledger = recordResult(ledger, S, T, { status: 'failed', code: 404 });
  expect(ledger[S][T].attempts).toBe(1);
  expect(ledger[S][T].transientAttempts).toBe(1);
});

// The ledger is committed, so entries that never saw a transient failure must
// keep their existing shape rather than gaining a zero field and churning the diff.
test('a pair with no transient failures carries no transientAttempts field', () => {
  const ledger = recordResult({}, S, T, { status: 'failed', code: 404 });
  expect('transientAttempts' in ledger[S][T]).toBe(false);
});
