// ABOUTME: Cloudflare Worker that relays webmention.io webhooks to GitHub's repository_dispatch, so a new mention publishes in about a minute instead of waiting for the daily cron.
// ABOUTME: It exists only because webmention.io cannot send an Authorization header; all decision logic lives in relay.ts, which is unit-tested.

import { secretsMatch, validatePayload, dispatchBody, dispatchHeaders } from './relay';

interface Env {
  /** Shared secret configured on webmention.io's webhook settings page. */
  WEBMENTION_WEBHOOK_SECRET?: string;
  /** Fine-grained PAT with Contents: read and write on the site repo. */
  GITHUB_DISPATCH_TOKEN?: string;
  /** owner/repo — a plain var, not a secret. */
  GITHUB_REPO?: string;
}

// webmention.io's payload is a few hundred bytes. Anything much larger is not
// from them, and reading it would just burn CPU on an unauthenticated request.
const MAX_BODY_BYTES = 16 * 1024;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method not allowed\n', { status: 405, headers: { Allow: 'POST' } });
    }

    const declaredLength = Number(request.headers.get('content-length') ?? '0');
    if (declaredLength > MAX_BODY_BYTES) {
      return new Response('Payload too large\n', { status: 413 });
    }

    // Fail closed when unconfigured: without this, a relay missing its bindings
    // would accept anything and hand it to an empty token.
    if (!env.WEBMENTION_WEBHOOK_SECRET || !env.GITHUB_DISPATCH_TOKEN || !env.GITHUB_REPO) {
      console.error('relay is not fully configured — refusing');
      return new Response('Not configured\n', { status: 503 });
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return new Response('Bad JSON\n', { status: 400 });
    }
    if (typeof payload !== 'object' || payload === null) {
      return new Response('Bad JSON\n', { status: 400 });
    }

    if (!secretsMatch((payload as { secret?: unknown }).secret, env.WEBMENTION_WEBHOOK_SECRET)) {
      // Deliberately vague, and never logs the provided value.
      return new Response('Forbidden\n', { status: 403 });
    }

    const webhook = validatePayload(payload);
    if (!webhook) {
      return new Response('Unprocessable payload\n', { status: 422 });
    }

    const response = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/dispatches`, {
      method: 'POST',
      headers: dispatchHeaders(env.GITHUB_DISPATCH_TOKEN),
      body: dispatchBody(webhook),
    });

    if (!response.ok) {
      // Log the status, never the token. webmention.io retries on a 5xx, so
      // surfacing the failure is better than swallowing it.
      console.error(`repository_dispatch failed: ${response.status} ${response.statusText}`);
      return new Response('Dispatch failed\n', { status: 502 });
    }

    return new Response(null, { status: 204 });
  },
};
