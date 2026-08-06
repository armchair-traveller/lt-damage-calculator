# Live sharing operations

Live sharing is accountless. A browser keeps a local-first Jazz identity and proves possession to
the HTTP API with a 60-second bearer proof. Public build payloads are readable by link; edit
capabilities and redeemed editor grants are private, and clients cannot mutate any Jazz table
directly.

Device drafts remain in the calculator's own local library. The browser Jazz client is intentionally
memory-backed: its persisted auth secret supplies the stable device identity, while live queries
stream from the sync server without maintaining a second durable copy of each build in the browser.

## Configuration

Preview and Production must use separate Jazz Cloud apps. Give each environment its own
`PUBLIC_JAZZ_APP_ID` and matching `JAZZ_BACKEND_SECRET`; do not point a preview deployment at the
production app or reuse its backend secret. `PUBLIC_JAZZ_SERVER_URL` may be the same Jazz Cloud v2
endpoint. The app id and server URL are browser-visible, while the backend secret is server-only.
The runtime uses an in-memory backend context connected upstream to Jazz Cloud v2, so it does not
write serverless filesystem state.

Configure the Vercel environments as follows:

| Vercel environment | Jazz app | Runtime secrets |
| --- | --- | --- |
| Preview | A preview-only app id and backend secret | `JAZZ_BACKEND_SECRET`; leave `CRON_SECRET` and `JAZZ_ADMIN_SECRET` unset |
| Production | A production-only app id and backend secret | `JAZZ_BACKEND_SECRET` and a production-only `CRON_SECRET`; leave `JAZZ_ADMIN_SECRET` unset |

`JAZZ_ADMIN_SECRET` is a schema-release credential, not an application runtime credential. Keep it
only on a trusted release workstation or in a protected GitHub environment. Publish schema and
permissions to the matching Jazz app before deploying application code:

```sh
npm run jazz:validate
npx --no-install jazz-tools deploy "$PUBLIC_JAZZ_APP_ID" \
  --schema-dir src/lib \
  --server-url "$PUBLIC_JAZZ_SERVER_URL" \
  --admin-secret "$JAZZ_ADMIN_SECRET"
```

`npm run dev` uses the official Jazz SvelteKit development plugin, which starts a local persistent
Jazz server and publishes schema changes automatically.

### Production releases

Production releases run through `.github/workflows/production-release.yml`. Create a GitHub
environment named `Production`, restrict it to the `master` branch, and optionally require reviewer approval.
Add these secrets to that protected environment:

- `JAZZ_PRODUCTION_APP_ID`
- `JAZZ_PRODUCTION_SERVER_URL`
- `JAZZ_PRODUCTION_ADMIN_SECRET`
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

The workflow refuses to run if any required secret is empty. It validates and tests the selected
`master` commit, builds that exact checkout with the Vercel Production settings, deploys its Jazz
schema and permissions, and only then deploys the prebuilt artifact to Vercel Production. The
`git.deploymentEnabled.master` setting in `vercel.json` prevents an ordinary push from bypassing
this order while leaving Preview branch deployments automatic. A push to `master` runs
**Production release** automatically; `workflow_dispatch` is available for a manual retry.

Preview schema changes must likewise be published to the preview Jazz app from a trusted release
context before the corresponding preview is used. Never expose an admin secret to pull-request code
or configure it in Vercel.

### Optional hardening as usage grows

- Vercel's automatic DDoS mitigation, request-size limits, and the application's quotas are a
  reasonable starting point for a small trusted beta. If links are published broadly or traffic
  grows, add platform or WAF limits to anonymous create, edit-link redemption, and write routes.
  Local-first identities are free to mint, so per-identity quotas are a UX guardrail rather than a
  complete public abuse boundary.
- Alert on unexpected live-build API failures, missing daily cleanup completion logs, cleanup runs
  where `failed` is non-zero, and a growing expired-row backlog. Track backlog size or the age of the
  oldest expired row outside the request path so cleanup saturation is visible before retention
  targets are missed.

## Retention and limits

- An unpinned live build expires 30 days after its last successful content edit.
- The API rejects an expired build immediately, and subscribed app clients stop following it at its
  `expiresAt` timestamp. The daily job is storage cleanup, not the clock that enforces the app UX.
- Pinning makes it permanent until the creator unpins or stops it.
- Each local-first identity may have 20 active builds and 5 pinned builds.
- Each edit-link generation may be redeemed by at most 32 distinct editor identities; replacing
  the edit link removes the prior generation's active grants and starts a fresh editor set.
- Vercel calls `/api/internal/cleanup-live-builds` daily with `CRON_SECRET`. Each invocation drains
  batches of up to 50 rows until no expired rows remain or its eight-second runtime budget is used.
  A failed row does not block later candidates; completion logs report `examined`, `deleted`, and
  `failed`. Cleanup deletes capability/editor children before the build.
- Jazz v2 deletion is a tombstone in append-only history. Cleanup makes rows unavailable and keeps
  the active dataset bounded, but it does not promise immediate physical byte reclamation in Jazz
  Cloud. Payloads are therefore gzip-compressed and capped at 32 KiB compressed / 64 KiB decoded.

## Security model

View links are unlisted, not confidential. Anyone who obtains a view link can read the build, and
public Jazz rows may be enumerable. Because the payload is deliberately public to support direct
Jazz subscriptions, a custom Jazz client may still read an expired row until the cleanup job
deletes it; do not use expiry as a confidentiality boundary. Edit links carry a 256-bit fragment
secret; fragments are removed from the address bar before network loading begins and are not sent
in HTTP requests. The UI exchanges the secret for an identity-bound editor grant. Rotating an edit
link revokes all prior grants.

All content mutations go through the API. It validates proof, quotas, expiry, revision and JSON
Pointer leaf changes, then recomputes the frozen calculator summary before storing the compressed
envelope. Same-field divergence returns HTTP 409 with the current build; unrelated leaf changes can
merge. The service uses a Jazz batch and a per-instance lock, but Jazz v2 alpha does not expose a
distributed compare-and-swap primitive, so two simultaneous writes routed to different serverless
instances can still race. Clients must treat the returned revision and subsequent subscription as
authoritative.
