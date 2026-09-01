# webmention-relay

A Cloudflare Worker that turns a webmention.io webhook into a GitHub
`repository_dispatch`, so a new mention reaches the site in about a minute
instead of waiting for the daily sync cron.

It exists for one reason: **webmention.io cannot send an `Authorization`
header**, and GitHub's dispatch API requires one. The Worker is the smallest
thing that can hold a token.

```
webmention.io
    │  POST { secret, source, target, post }
    ▼
estebantorres-webmention-relay.<subdomain>.workers.dev
    │  verify shared secret (constant-time)
    │  POST /repos/esttorhe/estebantorr.es/dispatches
    ▼
Sync webmentions workflow  →  commit  →  Deploy  →  live page
```

The payload is treated as a **trigger, not data**: the sync script re-fetches
the whole feed from webmention.io regardless, so a forged-but-correctly-signed
request can at worst cause a redundant sync.

## Setup

Run everything below **from this directory** — `bunx` is provided by the
mise-managed bun in `.mise.toml`, so it is only on `PATH` inside the repo:

```sh
cd workers/webmention-relay
```

(`bun x wrangler ...` is equivalent if `bunx` is unavailable. wrangler is not a
project dependency — it is fetched on demand here, and CI uses
`cloudflare/wrangler-action` instead.)

1. **Generate a shared secret** (any string up to 50 characters — that is
   webmention.io's field limit):

   ```sh
   openssl rand -hex 20
   ```

2. **Store it on the Worker:**

   ```sh
   bunx wrangler secret put WEBMENTION_WEBHOOK_SECRET
   ```

3. **Create a GitHub token.** A fine-grained PAT scoped to
   `esttorhe/estebantorr.es` with **Contents: read and write** — that is what
   `repository_dispatch` requires. Nothing else.

   ```sh
   bunx wrangler secret put GITHUB_DISPATCH_TOKEN
   ```

4. **Deploy:**

   ```sh
   bunx wrangler deploy
   ```

   Or push a change under `workers/webmention-relay/**` — `.github/workflows/deploy-relay.yml`
   deploys it automatically.

5. **Point webmention.io at it.** On <https://webmention.io/settings/webhooks>,
   for the `estebantorr.es` site, set the webhook URL to the deployed Worker URL
   and the secret to the value from step 1.

## Verifying it

An unauthenticated request must be rejected:

```sh
curl -i -X POST <worker-url> -d '{"source":"https://x.example/","target":"https://estebantorr.es/"}'
# → 403 Forbidden
```

A correctly-signed one returns `204` and should produce a `Sync webmentions`
run in Actions within seconds:

```sh
curl -i -X POST <worker-url> \
  -H 'Content-Type: application/json' \
  -d '{"secret":"<secret>","source":"https://x.example/","target":"https://estebantorr.es/"}'
# → 204, then check: gh run list --workflow=sync-webmentions.yml --limit 1
```

## Responses

| Status | Meaning                                                             |
| ------ | ------------------------------------------------------------------- |
| `204`  | Dispatched                                                          |
| `400`  | Body was not JSON                                                   |
| `403`  | Secret missing or wrong                                             |
| `405`  | Not a POST                                                          |
| `413`  | Body larger than 16 KB                                              |
| `422`  | No usable `source`/`target`, or `target` is not on `estebantorr.es` |
| `502`  | GitHub rejected the dispatch (check the Worker logs)                |
| `503`  | Worker is missing a binding — fails closed rather than open         |

Decision logic lives in `src/relay.ts` and is unit-tested in `src/relay.test.ts`
(`bun test`). `src/index.ts` is only the HTTP shell around it.
