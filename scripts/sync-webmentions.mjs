// ABOUTME: Regenerates src/data/webmentions.json from the webmention.io domain feed, and self-hosts sender avatars under public/assets/images/webmentions/.
// ABOUTME: Mentions are merged into the committed cache rather than replacing it, so the archive survives webmention.io going away.
//
// Usage:
//   bun run webmentions:sync            # needs WEBMENTION_IO_TOKEN in the environment
//   bun run webmentions:sync -- --dry   # fetch + report, write nothing
//
// The token comes from webmention.io once you sign in with your domain (it is
// shown on the dashboard). Only the whole-domain query needs it; the per-page
// `?target=` endpoint is public.
//
// For local runs, put it in `.env` (gitignored) — bun loads that automatically,
// so there is nothing to export. CI reads it from the WEBMENTION_IO_TOKEN
// repository secret; see .github/workflows/sync-webmentions.yml.

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

// Shared with the site so the two can never disagree about what counts as the
// same page. Run this script with bun (see package.json) — it transpiles the
// .ts import natively.
import { normalizeTarget, classifyProperty, OWN_IDENTITIES } from '../src/lib/webmentionTarget.ts';

export { normalizeTarget, classifyProperty };

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

const SITE_DOMAIN = 'estebantorr.es';
const API_BASE = 'https://webmention.io/api/mentions.jf2';
const PER_PAGE = 100;

// webmention.io flaps rather than falling over: during an incident their load
// balancer keeps routing to a pool where only some backends are healthy.
//
// The catch is that a pooled keep-alive connection sticks to whichever backend
// it first landed on, so a process that draws a broken one 502s on every request
// forever while curl — a fresh connection per call — succeeds half the time.
// Retrying down the same socket is therefore useless; `connection: close` is
// what actually makes an attempt an independent draw. Measured against the live
// outage: 0/12 on keep-alive, 3/12 with a fresh connection each time.
const FETCH_ATTEMPTS = 6;
const FETCH_BACKOFF_MS = 1000;

const outputJsonPath = resolve(projectRoot, 'src', 'data', 'webmentions.json');
const avatarsDir = resolve(projectRoot, 'public', 'assets', 'images', 'webmentions');
const avatarsPublicPrefix = '/assets/images/webmentions';

function log(msg) {
  process.stdout.write(`[sync-webmentions] ${msg}\n`);
}

// ---------------------------------------------------------------------------
// Pure transforms (exported for scripts/sync-webmentions.test.mjs)
// ---------------------------------------------------------------------------

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}

// A stable, filesystem-safe filename stem for a sender's avatar. Keyed on the
// author URL (not the photo URL, which webmention.io rotates) so a re-sync
// finds the file already on disk and skips the download.
export function avatarSlug(authorUrl) {
  const digest = createHash('sha1')
    .update(String(authorUrl ?? ''))
    .digest('hex')
    .slice(0, 12);
  const host = hostOf(authorUrl);
  if (!host) return digest;
  const hostStem = host
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${hostStem}-${digest}`;
}

// Trims a JF2 entry down to the fields the UI actually renders. Text is kept in
// full rather than truncated — owning the mention is the whole point of syncing
// it into the repo, so the UI clamps visually instead.
export function shapeMention(raw) {
  const author = raw.author ?? {};
  const text = typeof raw.content?.text === 'string' ? raw.content.text.trim() : '';
  const title = typeof raw.name === 'string' ? raw.name.trim() : '';

  const shaped = {
    id: raw['wm-id'],
    type: raw['wm-property'],
    url: raw.url,
    published: raw.published || raw['wm-received'],
    author: {
      // Anonymous senders still deserve a card, and the source host is the most
      // honest label available.
      name: (typeof author.name === 'string' && author.name.trim()) || hostOf(raw.url) || 'Someone',
      url: author.url,
      // Replaced with a local path once the avatar is downloaded.
      photo: author.photo,
    },
  };

  if (text) shaped.text = text;
  if (title) shaped.title = title;

  return shaped;
}

// What actually makes two entries the same mention. Bridgy re-sends when a
// delivery is retried and webmention.io files each attempt under its own wm-id,
// so the id identifies the delivery, not the mention — the source URL does.
// Type is part of the key because a like and a repost of one post are different
// mentions, and the URL alone is not enough to tell them apart.
//
// Falling back to the id when there is no URL keeps distinct anonymous senders
// from collapsing into a single card.
function mentionIdentity(mention) {
  return mention.url ? `${mention.type}\n${mention.url}` : `id:${mention.id}`;
}

// Which of two copies of the same mention to keep. A delivered webmention beats
// one read from a thread: it carries webmention.io's normalized author data and
// a self-hosted avatar, where the thread copy has only what the API returned —
// and Mastodon's snowflake ids dwarf wm-ids, so an id comparison alone would
// always pick the poorer copy. Otherwise the newest delivery wins, since
// senders edit their posts.
function winsOver(candidate, incumbent) {
  if (isThreadSourced(candidate) !== isThreadSourced(incumbent)) {
    return isThreadSourced(incumbent);
  }
  return compareIds(candidate.id, incumbent.id) > 0;
}

// wm-ids are numbers, Mastodon snowflakes are strings too large to be numbers.
// BigInt orders both exactly; anything unparseable falls back to string order so
// a malformed id cannot throw mid-sync.
function compareIds(a, b) {
  try {
    const left = BigInt(a);
    const right = BigInt(b);
    return left < right ? -1 : left > right ? 1 : 0;
  } catch {
    return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
  }
}

// Union of the committed cache and a fresh fetch, deduped by wm-id with the
// incoming copy winning (senders edit their posts), then collapsed by identity
// so a re-delivered mention renders once rather than once per delivery. Sorted
// by id so a sync that found nothing new produces an empty diff instead of a
// reshuffled file.
export function mergeMentions(existing = [], incoming = []) {
  const byId = new Map();
  for (const mention of existing) byId.set(mention.id, mention);
  for (const mention of incoming) byId.set(mention.id, mention);

  const byIdentity = new Map();
  for (const mention of byId.values()) {
    const key = mentionIdentity(mention);
    const seen = byIdentity.get(key);
    if (!seen || winsOver(mention, seen)) byIdentity.set(key, mention);
  }

  return [...byIdentity.values()].sort((a, b) => compareIds(a.id, b.id));
}

export function groupByTarget(rawMentions) {
  const grouped = {};

  for (const raw of rawMentions) {
    const bucket = classifyProperty(raw['wm-property']);
    if (bucket === 'ignore') continue;

    const target = normalizeTarget(raw['wm-target']);
    if (!target) continue;

    grouped[target] ??= { responses: [], reactions: [] };
    grouped[target][bucket === 'response' ? 'responses' : 'reactions'].push(shapeMention(raw));
  }

  return grouped;
}

// ---------------------------------------------------------------------------
// Thread replies
// ---------------------------------------------------------------------------
//
// Webmentions are pushed, and Bridgy resolves targets from the post being
// replied to — one level up, not the thread root. A reply to a reply therefore
// finds no link to the site and is never delivered. Reading the thread from the
// instance is a pull, so depth stops mattering.

const THREAD_SOURCE = 'thread';

// Marks the mentions that were read rather than delivered. They need their own
// handling in the removal sweeps, since they are by definition never in
// webmention.io's feed.
export function isThreadSourced(mention) {
  return mention?.source === THREAD_SOURCE;
}

// The heads of the threads worth reading for one target: the site owner's own
// posts that already appear in the archive. Announcing a post on Mastodon is
// therefore the entire configuration — nothing to keep in sync by hand.
export function threadRootsFor(bucket) {
  const roots = new Set();

  for (const mention of [...(bucket?.responses ?? []), ...(bucket?.reactions ?? [])]) {
    // A retired root is no longer about this page — the announcement was
    // deleted, or edited to drop the link — so its thread stops being read.
    // Replies already imported stay; new ones would be landing on the wrong page.
    if (mention?.removed === true) continue;

    // Reactions carry a #favorited-by fragment naming the reactor; the status
    // itself is what we want.
    const url = (mention?.url ?? '').split('#')[0];

    for (const identity of OWN_IDENTITIES) {
      if (!url.startsWith(`${identity}/`)) continue;
      // A Mastodon status is the identity plus a numeric id; a Bluesky post is
      // the identity plus `post/<record key>`.
      const rest = url.slice(identity.length + 1);
      if (/^\d+$/.test(rest) || blueskyPostRefFromUrl(url)) roots.add(url);
    }
  }

  return [...roots].sort();
}

// Splits a Mastodon status URL into what the API needs. Returns null for
// anything that is not one, which is most of what the archive holds.
export function statusRefFromUrl(url) {
  const match = /^https:\/\/([^/]+)\/@[^/]+\/(\d+)$/.exec(url ?? '');
  return match ? { host: match[1], id: match[2] } : null;
}

const HTML_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  '#39': "'",
};

// The API hands back HTML; the archive stores plain text, the way webmention.io
// does, so both sources render identically.
function htmlToText(html) {
  return String(html ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (whole, name) => {
      const key = name.toLowerCase();
      if (key in HTML_ENTITIES) return HTML_ENTITIES[key];
      if (key.startsWith('#x')) return String.fromCodePoint(parseInt(key.slice(2), 16));
      if (key.startsWith('#')) return String.fromCodePoint(Number(key.slice(1)));
      return whole;
    })
    .trim();
}

// One status from a thread, in the same shape as a delivered mention so the
// merge and the UI cannot tell them apart.
export function shapeThreadReply(status) {
  const account = status?.account ?? {};
  const name =
    (typeof account.display_name === 'string' && account.display_name.trim()) ||
    account.acct ||
    hostOf(status?.url) ||
    'Someone';

  const shaped = {
    // Mastodon's snowflake, kept as the string the API returned: these run past
    // Number.MAX_SAFE_INTEGER, so coercing would round adjacent ids onto the
    // same value and let one reply overwrite another.
    id: String(status?.id),
    type: 'in-reply-to',
    url: status?.url,
    published: status?.created_at,
    author: { name, url: account.url, photo: account.avatar },
    source: THREAD_SOURCE,
  };

  const text = htmlToText(status?.content);
  if (text) shaped.text = text;
  // Absent rather than empty: the archive is committed, and a blank field on
  // every uncovered reply would be noise in the diff.
  if (isConcealed(status)) shaped.warning = status.spoiler_text.trim();

  return shaped;
}

// Folds freshly read replies into one target's buckets, and retires the ones
// that have since disappeared from the thread.
//
// `ok` says whether the thread was actually read. On a failed fetch the existing
// replies are left exactly as they are — treating a network blip as a deletion
// is the same mistake markRemoved guards against for the feed.
export function mergeThreadReplies(bucket, replies, { at, ok = true } = {}) {
  const responses = mergeMentions(bucket?.responses ?? [], replies);
  if (!ok) return { ...bucket, responses };

  const present = new Set(replies.map((reply) => reply.url));

  return {
    ...bucket,
    responses: responses.map((mention) => {
      // A reply that also arrived as a webmention is the feed's to manage.
      if (!isThreadSourced(mention)) return mention;

      if (!present.has(mention.url)) {
        return mention.removed === true ? mention : { ...mention, removed: true, removedAt: at };
      }

      if (mention.removed !== true) return mention;
      // Back in the thread — the author undeleted it, or the instance was down.
      const { removed, removedAt, ...rest } = mention;
      return rest;
    }),
  };
}

/**
 * Fraction of the archive that may be marked removed in a single run.
 *
 * Everyone deleting at once is far less likely than an API anomaly, so a
 * larger-than-this removal is refused and reported instead of applied.
 */
const MAX_REMOVAL_RATIO = 0.5;

/**
 * Marks mentions that have disappeared from the feed as removed.
 *
 * webmention.io drops a mention when the sender deletes their post or I delete
 * it from the dashboard, but the sync only ever merges — so without this a
 * retracted reply stays published on the site indefinitely.
 *
 * Removed mentions stay in the committed archive (the record that it happened
 * is worth keeping); only rendering skips them. A mention that comes back is
 * un-marked.
 *
 * Refuses to act when the feed is empty or when the removal would take out more
 * than MAX_REMOVAL_RATIO of the archive, because blanking every Responses
 * region on a transient API blip is far worse than showing a stale reply for
 * one more cycle.
 */
export function markRemoved(
  existingTargets,
  presentIds,
  { at, maxRemovalRatio = MAX_REMOVAL_RATIO } = {},
) {
  // Replies read from a thread are never in webmention.io's feed, so this sweep
  // would retire every one of them. mergeThreadReplies retires those instead,
  // against the thread it actually read.
  const all = Object.values(existingTargets)
    .flatMap((bucket) => [...bucket.responses, ...bucket.reactions])
    .filter((mention) => !isThreadSourced(mention));

  const newlyAbsent = all.filter((m) => !presentIds.has(m.id) && m.removed !== true);

  if (newlyAbsent.length > 0) {
    if (presentIds.size === 0) {
      return { targets: existingTargets, removedCount: 0, skipped: true, reason: 'empty feed' };
    }
    if (all.length > 0 && newlyAbsent.length / all.length > maxRemovalRatio) {
      return {
        targets: existingTargets,
        removedCount: 0,
        skipped: true,
        reason: `${newlyAbsent.length} of ${all.length} would be removed`,
      };
    }
  }

  const absentIds = new Set(newlyAbsent.map((m) => m.id));

  const reshape = (mention) => {
    if (absentIds.has(mention.id)) {
      return { ...mention, removed: true, removedAt: at };
    }
    if (presentIds.has(mention.id) && mention.removed === true) {
      // Back from the dead — webmention.io restored it, or the sender reposted.
      const { removed, removedAt, ...rest } = mention;
      return rest;
    }
    return mention;
  };

  const targets = Object.fromEntries(
    Object.entries(existingTargets).map(([target, bucket]) => [
      target,
      {
        responses: bucket.responses.map(reshape),
        reactions: bucket.reactions.map(reshape),
      },
    ]),
  );

  return { targets, removedCount: absentIds.size, skipped: false };
}

// ---------------------------------------------------------------------------
// I/O
// ---------------------------------------------------------------------------

// Worth a retry: the request never reached a healthy backend, so the same
// request may well succeed. A client error is the caller's own fault — retrying
// a bad token only delays the same failure and buries the real cause.
export function isTransientStatus(status) {
  return status === 429 || status >= 500;
}

// `fetchImpl` and `sleep` are seams for the tests, which script an outage rather
// than wait on a real one. Everything else calls this with the defaults.
export async function fetchWithRetry(url, options = {}) {
  const {
    attempts = FETCH_ATTEMPTS,
    backoffMs = FETCH_BACKOFF_MS,
    fetchImpl = fetch,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    onRetry = () => {},
  } = options;

  let lastResponse;
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    lastResponse = undefined;
    lastError = undefined;

    try {
      // Forces a new connection — and so a new backend draw — per attempt.
      lastResponse = await fetchImpl(url, { headers: { connection: 'close' } });
    } catch (error) {
      lastError = error;
    }

    if (lastResponse && (lastResponse.ok || !isTransientStatus(lastResponse.status))) {
      return lastResponse;
    }

    if (attempt === attempts) break;

    const delay = backoffMs * 2 ** (attempt - 1);
    onRetry({ attempt, attempts, delay, status: lastResponse?.status, error: lastError });
    await sleep(delay);
  }

  // Out of attempts. A status the caller can report beats an opaque throw, so
  // the response wins when there is one.
  if (lastResponse) return lastResponse;
  throw lastError;
}

// Turns a context payload into replies, and reports whether we saw the whole
// thread. `ok` gates only the removal sweep — replies that did come back are
// real whether or not the read was complete.
export function repliesFromContext(body) {
  // A body without a descendants array is not an empty thread, it is a response
  // we do not understand. Calling it empty would retire every reply we hold.
  if (!body || !Array.isArray(body.descendants)) {
    return { replies: [], ok: false, withheld: 0, count: 0, depth: 0, malformed: true };
  }

  const { descendants } = body;
  const listed = descendants.filter(isPubliclyListed);
  const depth = threadDepth(descendants);
  const truncated = isThreadTruncated(descendants.length) || depth >= THREAD_DEPTH_LIMIT;

  return {
    replies: listed.map(shapeThreadReply),
    ok: !truncated,
    withheld: descendants.length - listed.length,
    count: descendants.length,
    depth,
    malformed: false,
  };
}

// ---------------------------------------------------------------------------
// Bluesky
// ---------------------------------------------------------------------------

// Bluesky has the same shape of problem and the same fix: the thread is public,
// so read it rather than waiting for a webmention that only ever resolves one
// level up.

// The API's own ceiling — it rejects anything larger. Far past any blog thread,
// so a read that reaches it is the signal that something is unusual.
export const BLUESKY_DEPTH = 1000;

// A bsky.app post URL, in either the handle or the DID form.
//
// The two forms are deliberately *not* folded together for dedupe. Doing that
// would mean keying on the record key alone, and AT Protocol scopes those per
// repository — the spec guarantees `(did, collection, rkey)` is unique, not
// `(did, rkey)` — so two repos sharing a key would silently overwrite each
// other. Bridgy writes the DID form and so does shapeBlueskyReply, so the two
// already agree; if a handle-form copy ever did arrive it would show as a
// visible duplicate, which is the better failure of the two.
export function blueskyPostRefFromUrl(url) {
  const match = /^https:\/\/bsky\.app\/profile\/([^/]+)\/post\/([A-Za-z0-9._~-]+)$/.exec(url ?? '');
  return match ? { actor: match[1], rkey: match[2] } : null;
}

// One reply from a thread. Bridgy writes the post URL in DID form and the author
// URL in handle form; both are matched exactly, because the post URL is what
// dedupe compares and the author URL is what the avatar filename derives from.
export function shapeBlueskyReply(view) {
  const post = view?.post ?? {};
  const author = post.author ?? {};
  const rkey = String(post.uri ?? '')
    .split('/')
    .pop();

  const shaped = {
    // The whole at:// URI, not the bare record key. mergeMentions buckets by id
    // before identity dedupe runs, and record keys are repo-scoped — two repos
    // sharing one would collide there and lose a reply before the URL ever got
    // compared.
    id: post.uri,
    type: 'in-reply-to',
    url: `https://bsky.app/profile/${author.did}/post/${rkey}`,
    published: post.record?.createdAt || post.indexedAt,
    author: {
      name:
        (typeof author.displayName === 'string' && author.displayName.trim()) ||
        author.handle ||
        'Someone',
      url: author.handle ? `https://bsky.app/profile/${author.handle}` : undefined,
      photo: author.avatar,
    },
    source: THREAD_SOURCE,
  };

  const text = typeof post.record?.text === 'string' ? post.record.text.trim() : '';
  if (text) shaped.text = text;

  // Self-labels are Bluesky's content warning. Folded rather than dropped, the
  // same as a Mastodon spoiler.
  const labels = Array.isArray(post.labels)
    ? post.labels.map((label) => label?.val).filter(Boolean)
    : [];
  if (labels.length > 0) shaped.warning = labels.join(', ');

  return shaped;
}

// The AppView answers a missing post with 400 and an error body of NotFound
// rather than a 404 — and answers an unresolvable handle exactly the same way.
// A DID never changes, so NotFound against one really does mean the post is
// gone; against a handle it may only mean the handle moved, which is no reason
// to retire anything.
export function isBlueskyPostGone(actor, body) {
  if (!String(actor).startsWith('did:')) return false;
  try {
    return JSON.parse(body)?.error === 'NotFound';
  } catch {
    return false;
  }
}

const THREAD_VIEW_POST = 'app.bsky.feed.defs#threadViewPost';

// The API nests replies; the archive is flat. Blocked and deleted posts come
// back as markers carrying no content, and are skipped rather than shaped.
export function blueskyRepliesFromThread(thread) {
  if (!thread || thread.$type !== THREAD_VIEW_POST || !thread.post) {
    return { replies: [], ok: false, depth: 0, malformed: true };
  }

  const replies = [];
  let deepest = 0;
  // A blocked or deleted reply comes back as a marker with no child list, so
  // anything underneath it is now invisible to us. Those descendants may well
  // still be live, and we already hold some of them — so the read counts as
  // incomplete and the sweep stands down rather than retiring them.
  let hidden = 0;

  let unreadable = false;

  const walk = (node, depth) => {
    // A 200 carrying a replies field that is not a list is a response we do not
    // understand — not an absence of replies.
    if (node.replies !== undefined && !Array.isArray(node.replies)) {
      unreadable = true;
      return;
    }

    for (const child of node.replies ?? []) {
      if (child?.$type !== THREAD_VIEW_POST || !child.post) {
        hidden += 1;
        continue;
      }
      replies.push(shapeBlueskyReply(child));
      if (depth > deepest) deepest = depth;
      walk(child, depth + 1);
    }
  };

  walk(thread, 1);

  if (unreadable) return { replies: [], ok: false, depth: 0, hidden: 0, malformed: true };

  return {
    replies,
    ok: deepest < BLUESKY_DEPTH && hidden === 0,
    depth: deepest,
    hidden,
    malformed: false,
  };
}

// A failed read means one of two very different things. Only a definitive
// not-found — 404, or 410 for a tombstoned status — says the thread is gone and
// its replies should be retired with it. Everything else says merely that we
// could not look: a 5xx or dropped connection is a blip, and a 401 or 403 is an
// instance requiring auth or blocking the runner (indieweb.social answers 401 to
// unauthenticated reads). Retiring on any of those would be the
// blip-as-deletion mistake markRemoved exists to avoid.
export function isThreadGone(status) {
  return status === 404 || status === 410;
}

// Mastodon caps an unauthenticated context read at 40 ancestors and 60
// descendants, depth 20, and the endpoint is not paginated — there is no second
// page to ask for. A thread that comes back sitting on the cap has almost
// certainly been cut short, so the replies past it are unseen rather than
// deleted and the sweep has to stand down.
// Unauthenticated context reads return unlisted statuses as well as public
// ones. Unlisted means "do not list or index me" rather than "private", and
// copying one onto a public page — and into a public git repo — would override
// exactly that. An instance that omits the field gets the cautious reading.
export function isPubliclyListed(status) {
  return status?.visibility === 'public';
}

export const THREAD_DESCENDANTS_LIMIT = 60;

// Mastodon also cuts an unauthenticated read at depth 20, independently of the
// descendant cap, so a long narrow chain is truncated while the count stays well
// under it. Depth 1 is a direct reply to the root.
export const THREAD_DEPTH_LIMIT = 20;

export function threadDepth(descendants) {
  const parentOf = new Map(
    descendants.map((status) => [
      String(status.id),
      status.in_reply_to_id == null ? null : String(status.in_reply_to_id),
    ]),
  );

  let deepest = 0;

  for (const status of descendants) {
    let depth = 1;
    let parent = parentOf.get(String(status.id));

    // Walking stops at the root, which is not itself a descendant. The bound
    // also stops a cycle from hanging the sync on malformed data.
    while (parent != null && parentOf.has(parent) && depth <= THREAD_DEPTH_LIMIT) {
      depth += 1;
      parent = parentOf.get(parent);
    }

    if (depth > deepest) deepest = depth;
  }

  return deepest;
}

export function isThreadTruncated(descendantCount) {
  return descendantCount >= THREAD_DESCENDANTS_LIMIT;
}

// A content warning is the author saying they do not want the body read
// unfolded. The reply is still worth having — dropping it would lose part of the
// conversation — so it is imported with its warning attached and the page folds
// the body behind it.
export function isConcealed(status) {
  return typeof status?.spoiler_text === 'string' && status.spoiler_text.trim() !== '';
}

// Sends each root to the network that can answer for it.
async function readThread(rootUrl) {
  if (statusRefFromUrl(rootUrl)) return readMastodonThread(rootUrl);
  if (blueskyPostRefFromUrl(rootUrl)) return readBlueskyThread(rootUrl);
  return { replies: [], ok: false };
}

// The public AppView answers for any public post without a token, and accepts
// either a handle or a DID in the at:// URI.
async function readBlueskyThread(rootUrl) {
  const ref = blueskyPostRefFromUrl(rootUrl);
  if (!ref) return { replies: [], ok: false };

  const url =
    `https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread` +
    `?uri=${encodeURIComponent(`at://${ref.actor}/app.bsky.feed.post/${ref.rkey}`)}` +
    `&depth=${BLUESKY_DEPTH}`;

  let response;
  try {
    response = await fetchWithRetry(url, {
      onRetry: ({ attempt, attempts, delay, status, error }) =>
        log(
          `bluesky ${ref.rkey}: ${status ?? error?.message ?? 'request failed'} — ` +
            `retrying in ${delay}ms (attempt ${attempt}/${attempts})`,
        ),
    });
  } catch (error) {
    log(`bluesky ${ref.rkey}: ${error.message} — leaving its replies as they are`);
    return { replies: [], ok: false };
  }

  if (!response.ok) {
    // A gone thread is read from the body rather than the status line here.
    let gone = isThreadGone(response.status);
    if (response.status === 400) {
      const detail = await response.text().catch(() => '');
      gone = isBlueskyPostGone(ref.actor, detail);
    }
    log(
      `bluesky ${ref.rkey}: HTTP ${response.status} — ` +
        (gone ? 'the thread is gone, retiring its replies' : 'leaving its replies as they are'),
    );
    return { replies: [], ok: gone };
  }

  let body;
  try {
    body = await response.json();
  } catch (error) {
    log(
      `bluesky ${ref.rkey}: unreadable response (${error.message}) — leaving its replies as they are`,
    );
    return { replies: [], ok: false };
  }

  const result = blueskyRepliesFromThread(body?.thread);

  if (result.malformed) {
    log(
      `bluesky ${ref.rkey}: no readable thread in the response — leaving its replies as they are`,
    );
    return { replies: [], ok: false };
  }
  if (!result.ok) {
    log(
      `bluesky ${ref.rkey}: ${result.hidden} blocked or deleted branch(es), depth ${result.depth} — ` +
        `part of the thread is out of view, so keeping what it returned and retiring nothing`,
    );
  }

  return { replies: result.replies, ok: result.ok };
}

// Mastodon serves a status's whole thread publicly. Unauthenticated callers also
// see unlisted posts, which repliesFromContext filters out.
async function readMastodonThread(rootUrl) {
  const ref = statusRefFromUrl(rootUrl);
  if (!ref) return { replies: [], ok: false };

  const url = `https://${ref.host}/api/v1/statuses/${ref.id}/context`;

  let response;
  try {
    response = await fetchWithRetry(url, {
      onRetry: ({ attempt, attempts, delay, status, error }) =>
        log(
          `thread ${ref.id}: ${status ?? error?.message ?? 'request failed'} — ` +
            `retrying in ${delay}ms (attempt ${attempt}/${attempts})`,
        ),
    });
  } catch (error) {
    log(`thread ${ref.id}: ${error.message} — leaving its replies as they are`);
    return { replies: [], ok: false };
  }

  if (!response.ok) {
    const gone = isThreadGone(response.status);
    log(
      `thread ${ref.id}: HTTP ${response.status} — ` +
        (gone ? 'the thread is gone, retiring its replies' : 'leaving its replies as they are'),
    );
    return { replies: [], ok: gone };
  }

  let body;
  try {
    body = await response.json();
  } catch (error) {
    // A 200 carrying something that is not JSON — an interstitial, a proxy
    // error page. Not a thread, and not a reason to abort the whole sync.
    log(
      `thread ${ref.id}: unreadable response (${error.message}) — leaving its replies as they are`,
    );
    return { replies: [], ok: false };
  }

  const result = repliesFromContext(body);

  if (result.malformed) {
    log(`thread ${ref.id}: response had no descendants list — leaving its replies as they are`);
    return { replies: [], ok: false };
  }
  if (result.withheld > 0) {
    log(`thread ${ref.id}: skipping ${result.withheld} reply(ies) that are not public`);
  }
  if (!result.ok) {
    log(
      `thread ${ref.id}: ${result.count} replies at depth ${result.depth} — on Mastodon's cap, ` +
        `so the thread is likely cut short; keeping what it returned and not retiring the tail`,
    );
  }

  return { replies: result.replies, ok: result.ok };
}

function countBucket(bucket) {
  return (bucket?.responses?.length ?? 0) + (bucket?.reactions?.length ?? 0);
}

// Reads the thread behind every target that has one and folds the replies in.
async function applyThreadReplies(targets, { at, dryRun }) {
  const readByTarget = {};
  const okByTarget = {};

  for (const [target, bucket] of Object.entries(targets)) {
    const roots = threadRootsFor(bucket);
    if (roots.length === 0) continue;

    const replies = [];
    // One unreadable root is enough to hold back the sweep for this target: a
    // partial view of the thread would look like the missing replies were
    // deleted.
    let ok = true;

    for (const root of roots) {
      const result = await readThread(root);
      // Even a partial read returns real replies — an incomplete view only
      // means we must not conclude anything about what is missing.
      replies.push(...result.replies);
      if (!result.ok) ok = false;
    }

    readByTarget[target] = { responses: replies, reactions: [] };
    okByTarget[target] = ok;
  }

  // Same treatment as delivered mentions: the avatar is copied locally rather
  // than hotlinked from whichever instance the replier is on.
  const avatars = await localizeAvatars(readByTarget, { dryRun });

  const out = { ...targets };
  let added = 0;

  for (const [target, bucket] of Object.entries(readByTarget)) {
    const before = countBucket(out[target]);
    out[target] = mergeThreadReplies(out[target], bucket.responses, {
      at,
      ok: okByTarget[target],
    });
    added += countBucket(out[target]) - before;
  }

  return { targets: out, avatars, added, threadsRead: Object.keys(readByTarget).length };
}

async function fetchAllMentions(token) {
  const all = [];

  for (let page = 0; ; page += 1) {
    const url = new URL(API_BASE);
    url.searchParams.set('domain', SITE_DOMAIN);
    url.searchParams.set('token', token);
    url.searchParams.set('per-page', String(PER_PAGE));
    url.searchParams.set('page', String(page));
    // Oldest-first. With the default newest-first ordering, a mention arriving
    // mid-pagination shifts every later item down a slot and one gets skipped —
    // which markRemoved would then read as a deletion.
    url.searchParams.set('sort-dir', 'up');

    const response = await fetchWithRetry(url, {
      onRetry: ({ attempt, attempts, delay, status, error }) =>
        log(
          `page ${page}: ${status ?? error?.message ?? 'request failed'} — ` +
            `retrying in ${delay}ms (attempt ${attempt}/${attempts})`,
        ),
    });
    if (!response.ok) {
      throw new Error(
        `webmention.io returned ${response.status} ${response.statusText} for page ${page}`,
      );
    }

    const body = await response.json();
    const children = Array.isArray(body.children) ? body.children : [];
    all.push(...children);
    log(`fetched page ${page} — ${children.length} mention(s)`);

    if (children.length < PER_PAGE) break;
  }

  return all;
}

async function readExistingCache() {
  if (!existsSync(outputJsonPath)) return { targets: {} };
  try {
    const parsed = JSON.parse(await readFile(outputJsonPath, 'utf8'));
    return { targets: parsed.targets ?? {} };
  } catch (error) {
    throw new Error(`could not parse the existing ${outputJsonPath}: ${error.message}`);
  }
}

function extensionFromContentType(contentType) {
  if (!contentType) return null;
  if (contentType.includes('jpeg')) return 'jpg';
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('gif')) return 'gif';
  if (contentType.includes('svg')) return 'svg';
  return null;
}

// Maps an avatar slug to its existing filename on disk, so a re-sync skips the
// network entirely for senders already cached.
async function existingAvatarsBySlug() {
  if (!existsSync(avatarsDir)) return new Map();
  const files = await readdir(avatarsDir);
  const bySlug = new Map();
  for (const file of files) {
    const stem = file.slice(0, file.length - extname(file).length);
    bySlug.set(stem, file);
  }
  return bySlug;
}

// Downloads each sender's avatar into public/ and rewrites author.photo to the
// local path. Hotlinking would put a webmention.io request on every reader's
// page load — exactly the third-party runtime dependency that syncing at build
// time exists to avoid.
async function localizeAvatars(grouped, { dryRun }) {
  const cached = await existingAvatarsBySlug();
  const resolvedBySlug = new Map();
  let downloaded = 0;
  let failed = 0;

  const allMentions = Object.values(grouped).flatMap((bucket) => [
    ...bucket.responses,
    ...bucket.reactions,
  ]);

  for (const mention of allMentions) {
    const remotePhoto = mention.author.photo;
    if (typeof remotePhoto !== 'string' || remotePhoto.trim() === '') {
      delete mention.author.photo;
      continue;
    }

    const slug = avatarSlug(mention.author.url ?? mention.url);

    if (resolvedBySlug.has(slug)) {
      mention.author.photo = resolvedBySlug.get(slug);
      continue;
    }

    if (cached.has(slug)) {
      const localPath = `${avatarsPublicPrefix}/${cached.get(slug)}`;
      resolvedBySlug.set(slug, localPath);
      mention.author.photo = localPath;
      continue;
    }

    if (dryRun) {
      log(`would download avatar for ${mention.author.name}`);
      delete mention.author.photo;
      continue;
    }

    try {
      const response = await fetch(remotePhoto);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const ext =
        extensionFromContentType(response.headers.get('content-type')) ||
        extname(new URL(remotePhoto).pathname).replace('.', '') ||
        'jpg';

      await mkdir(avatarsDir, { recursive: true });
      const filename = `${slug}.${ext}`;
      await writeFile(resolve(avatarsDir, filename), Buffer.from(await response.arrayBuffer()));

      const localPath = `${avatarsPublicPrefix}/${filename}`;
      resolvedBySlug.set(slug, localPath);
      mention.author.photo = localPath;
      downloaded += 1;
    } catch (error) {
      // A dead avatar must not fail the sync — the card falls back to initials.
      log(`avatar failed for ${mention.author.name} (${error.message}) — falling back to initials`);
      delete mention.author.photo;
      failed += 1;
    }
  }

  return { downloaded, failed };
}

function mergeIntoCache(existingTargets, incomingTargets) {
  const merged = {};

  for (const target of new Set([
    ...Object.keys(existingTargets),
    ...Object.keys(incomingTargets),
  ])) {
    const before = existingTargets[target] ?? { responses: [], reactions: [] };
    const after = incomingTargets[target] ?? { responses: [], reactions: [] };
    merged[target] = {
      responses: mergeMentions(before.responses, after.responses),
      reactions: mergeMentions(before.reactions, after.reactions),
    };
  }

  // Sorted keys keep the committed file's diff readable.
  return Object.fromEntries(
    Object.keys(merged)
      .sort()
      .map((key) => [key, merged[key]]),
  );
}

function countMentions(targets) {
  return Object.values(targets).reduce(
    (total, bucket) => total + bucket.responses.length + bucket.reactions.length,
    0,
  );
}

async function main() {
  const dryRun = process.argv.includes('--dry');
  const token = process.env.WEBMENTION_IO_TOKEN;

  if (!token) {
    log(
      'WEBMENTION_IO_TOKEN is not set — sign in at https://webmention.io with your domain to get one.',
    );
    process.exit(1);
  }

  const now = new Date().toISOString();
  const existing = await readExistingCache();
  const existingCount = countMentions(existing.targets);

  const raw = await fetchAllMentions(token);
  log(`${raw.length} mention(s) in the domain feed`);

  const incoming = groupByTarget(raw);
  const avatars = await localizeAvatars(incoming, { dryRun });
  const merged = mergeIntoCache(existing.targets, incoming);

  // Bridgy only resolves targets one level up the thread, so a reply to a reply
  // is never delivered. Reading the Mastodon and Bluesky threads picks those up.
  const threads = await applyThreadReplies(merged, { at: now, dryRun });
  if (threads.threadsRead > 0) {
    log(
      `read ${threads.threadsRead} thread(s) — ${threads.added} reply(ies) not delivered as webmentions, ` +
        `${threads.avatars.downloaded} avatar(s) downloaded, ${threads.avatars.failed} failed`,
    );
  }

  // Anything in the archive but no longer in the feed has been deleted.
  const presentIds = new Set(raw.map((m) => m['wm-id']));
  const removal = markRemoved(threads.targets, presentIds, { at: now });
  if (removal.skipped) {
    log(`refusing to mark removals (${removal.reason}) — leaving the archive as-is`);
  } else if (removal.removedCount > 0) {
    log(
      `${removal.removedCount} mention(s) deleted at the source — marked removed, kept in the archive`,
    );
  }
  const targets = removal.targets;
  const total = countMentions(targets);

  log(
    `${total} mention(s) across ${Object.keys(targets).length} page(s) — ` +
      `${total - existingCount} new, ${avatars.downloaded} avatar(s) downloaded, ${avatars.failed} failed`,
  );

  if (dryRun) {
    log('--dry: nothing written');
    return;
  }

  // Leave the file completely alone when the mentions have not changed.
  //
  // `syncedAt` used to be stamped on every run, which meant a sync that found
  // nothing new still produced a one-line diff — and therefore a commit, and a
  // full deploy. Harmless daily; with the webhook firing per mention it is a
  // stream of empty commits. Both mergeIntoCache and mergeMentions sort their
  // output, so serializing is a sound equality check.
  // A skipped removal needs no special case: markRemoved returns the archive
  // untouched, so this comparison already decides not to write.
  const unchanged = JSON.stringify(targets) === JSON.stringify(existing.targets);

  if (unchanged) {
    log('no change — leaving the data file untouched so nothing is committed');
    return;
  }

  const payload = {
    // Written by scripts/sync-webmentions.mjs — see the header there.
    // Only advances when the mentions themselves change; see `unchanged` above.
    syncedAt: now,
    targets,
  };

  await writeFile(outputJsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  log(`wrote ${outputJsonPath}`);
}

// Only run when invoked directly, so the test file can import the transforms.
if (import.meta.main) {
  main().catch((error) => {
    log(`failed: ${error.message}`);
    process.exit(1);
  });
}
