// ABOUTME: Pure logic for the webmention.io -> GitHub repository_dispatch relay, split out from the fetch handler so it is testable without Miniflare.
// ABOUTME: webmention.io cannot send an Authorization header, so this is the only reason the relay exists.

/** The shape webmention.io POSTs. See views/webhooks.erb in aaronpk/webmention.io. */
export interface WebhookPayload {
  secret?: unknown;
  source?: unknown;
  target?: unknown;
  /** Present and true when a mention was deleted, in which case `post` is absent. */
  deleted?: unknown;
  post?: unknown;
}

export interface ValidatedWebhook {
  source: string;
  target: string;
  deleted: boolean;
}

/**
 * Constant-time string comparison.
 *
 * The Workers runtime has no crypto.timingSafeEqual, so this compares byte by
 * byte without an early return. Length is compared up front — that leaks only
 * the secret's length, which is not the secret.
 */
export function secretsMatch(provided: unknown, expected: string | undefined): boolean {
  if (typeof provided !== 'string' || typeof expected !== 'string') return false;
  if (expected.length === 0) return false;
  if (provided.length !== expected.length) return false;

  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Extracts the fields we forward, rejecting anything malformed.
 *
 * The relay deliberately forwards only source, target and the deleted flag: the
 * sync script re-fetches the whole feed from webmention.io anyway, so the
 * payload is a trigger rather than a data source. Not trusting it as data means
 * a forged-but-correctly-signed request can at worst cause a redundant sync.
 */
export function validatePayload(payload: WebhookPayload): ValidatedWebhook | null {
  const { source, target, deleted } = payload;
  if (typeof source !== 'string' || source === '') return null;
  if (typeof target !== 'string' || target === '') return null;

  // A target on someone else's domain means this webhook was not meant for us.
  let targetUrl: URL;
  try {
    targetUrl = new URL(target);
  } catch {
    return null;
  }
  if (targetUrl.host !== 'estebantorr.es') return null;

  return { source, target, deleted: deleted === true };
}

/** The repository_dispatch body. `webmention_received` is the type the sync workflow listens for. */
export function dispatchBody(webhook: ValidatedWebhook): string {
  return JSON.stringify({
    event_type: 'webmention_received',
    client_payload: {
      source: webhook.source,
      target: webhook.target,
      deleted: webhook.deleted,
    },
  });
}

export function dispatchHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
    // GitHub rejects API requests without one.
    'User-Agent': 'estebantorr.es-webmention-relay',
  };
}
