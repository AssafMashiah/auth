# OAuth provider update fix and Care repair

Prepared 2026-10-22. Worker redeployed after explicit user authorization on
2026-10-22. The production provider data repair remains unexecuted.
Initial checkout: clean `fix/oauth-exchange-reason-v2`, HEAD `715eb5a`.
No AGENTS.md found in the checkout (excluding dependencies) or its ancestor directories.

## Configuration contract

`configureProvider` is an upsert for every project. The admin modal sends client
ID, replacement secret, provider name and enabled status. Previously its omitted
endpoint/scopes/configuration fields were overwritten with null.

| Field | Omitted / undefined on update | Explicit value | New provider, omitted |
| --- | --- | --- | --- |
| Endpoints | Preserve nonblank stored URL; recover missing/blank URL from built-in default | Valid URL replaces stored URL; empty string and null rejected | Built-in default, otherwise null |
| scopes | Preserve stored JSON exactly, including null and `[]` | Array replaces; `[]` clears; null rejected | Provider defaults |
| additionalConfig | Preserve stored JSON exactly, including null and `{}` | Object replaces; `{}` clears; null rejected | null |
| enabled | Preserve stored true/false (legacy null falls back to true) | Boolean replaces; null rejected | true |

Client ID and client secret remain required on configure; supplied secret is
AES-GCM encrypted when ENCRYPTION_KEY is configured, as before. The service now
enforces the existing validation schema before writing, because this admin route
was not validating its payload. The path's project ID takes precedence over the
body. Endpoint defaults cover Google, GitHub and Microsoft. Apple/custom have no
invented endpoint defaults. Apple native ID-token sign-in remains separate.

Google recovery deliberately uses this service's existing v2 userinfo default,
`https://www.googleapis.com/oauth2/v2/userinfo`, preserving its existing identity
extraction contract. Google's maintained client exposes this endpoint:
https://github.com/googleapis/google-api-nodejs-client/blob/main/src/apis/oauth2/v2.ts
Authorization and token defaults agree with Google's discovery document:
https://accounts.google.com/.well-known/openid-configuration

The code recovers stored missing endpoints during configure, not on every OAuth
start request. Deploying code alone therefore does not repair the broken row.
Existing custom scopes/configuration lost before this fix cannot be reconstructed
from provider defaults; recover them only from an approved known-good record.
The targeted repair deliberately leaves them untouched.

## Production procedure — endpoint data repair still pending explicit approval

Target from the current tracked `wrangler.toml`:

- Worker `auth`, route `auth.buildingis.art`.
- Cloudflare account `5eab29f46ec31fb183a82b0861479d5c`.
- D1 binding `DB`, database `auth-db`, ID `e3413ce5-42f6-4336-aaba-c8e4bd3fb0dd`.
- Provider selector: project `calisthenics_care`, provider `google` (unique pair).

These identifiers are source configuration, not live deployment verification.
Before execution, confirm authenticated account, Worker, existing D1 binding and
current deployed version using account-owned credentials. Use the required D1
read/write and Workers deployment permissions for these operations. Never print
credentials, run SELECT *, export the database into logs, reset the database,
recreate the provider, rotate ENCRYPTION_KEY, or re-provision the project.

1. Review and publish the code through the normal review process. Re-run tests and
   the Worker type check. Build the admin using `npm run build:admin`; package
   locally using `npx wrangler deploy --config wrangler.toml --dry-run`.
2. Identify the deployed version for rollback, and verify the existing D1 recovery
   point/Time Travel availability through the Cloudflare account. Capture only
   endpoint URLs from the inspection below for a possible endpoint-only rollback.
   Do not read the client secret or encrypted secret.
3. Inspect the row using the read-only file (after approval):

   ```sh
   npx wrangler d1 execute DB --config wrangler.toml --remote --file scripts/repairs/calisthenics-care-google-inspect.sql
   ```

   Require exactly one matching provider, confirm the expected enabled status and
   affected missing endpoints. Verify the redirect allowlist contains the exact
   intended callback `https://health.sharpthought.app/auth/google/callback`.
   Stop on mismatch; the repair does not alter redirects. Do not log the OAuth
   start response's state/browser cookies or any callback code/token.
4. Deploy only the reviewed Worker and built assets to the same target:

   ```sh
   npx wrangler deploy --config wrangler.toml --keep-vars
   ```

   This fix needs no schema migration. Avoid `npm run deploy` for this repair:
   that script also installs dependencies and applies remote migrations. Reconcile
   tracked variables/bindings against the live target before deployment;
   `--keep-vars` preserves extra remotely managed variables, but tracked values
   still take precedence.
5. Apply the separately approved repair:

   ```sh
   npx wrangler d1 execute DB --config wrangler.toml --remote --file scripts/repairs/calisthenics-care-google-endpoints.sql
   ```

   The single UPDATE fills only missing/blank endpoint values, preserves nonblank
   overrides, and matches only Care's Google provider. It never reads or modifies
   client ID, encrypted secret, enabled status, scopes, configuration or users.
   The existing database trigger updates `updated_at`. A repeat is a no-op.
6. Repeat inspection. Expect Google authorize/token/userinfo URLs (or preserved
   pre-existing nonblank overrides). Use the normal Care client flow to verify
   OAuth start returns an HTTPS Google authorization URL with the exact callback,
   then complete a consented existing-user Google login. Confirm the account
   remains linked to the same user; check other project sign-in smoke tests.
   Do not rotate the real secret as a verification step. Local automated tests
   already cover secret replacement using fabricated credentials.

If a deployed-code rollback is necessary, restore the recorded Worker version;
D1 changes are separate. An endpoint-only rollback should use the recorded URLs
and provider ID, only while the current URLs still equal the repaired values.
Do not restore the entire database for this single-row repair or overwrite a
concurrent admin change. Never use provider deletion/recreation as rollback.

Wrangler 4.67.0's installed help was checked for `d1 execute --file --remote`,
`deploy --dry-run`, and `deploy --keep-vars`. D1 command reference:
https://developers.cloudflare.com/d1/wrangler-commands/

## Verification

Regression tests use Node 22's experimental built-in SQLite API and the real
Drizzle D1 adapter, with an in-memory D1 statement shim. No remote bindings or
production credentials are used. The initial SQL migration (including its update
trigger) is loaded. Only project lookup is stubbed.

Coverage includes the modal-shaped secret update with encryption, exact stored
custom configuration, disabled status, explicit replacements/empty collections,
rejection of null/empty endpoints, all three built-in defaults, partial endpoint
recovery, untouched other projects/providers, user links, and repair idempotence.
Node 22.16.0 was used; SQLite emits its normal experimental warning.

Final results on the prepared code:

- `npm test -- --run`: exit 0; 41 test files passed, 664 tests passed,
  1 existing test skipped (665 total). Includes 23 new regression cases.
- `npm run type-check`: exit 0 (`tsc --noEmit`).
- `git diff --check`: exit 0, no whitespace errors.
- Follow-up verification: installed admin dependencies with `npm ci --prefix admin`
  using the existing lockfile; no lockfile changes. `npm run build:admin` exits 0
  (admin TypeScript check and Vite production build).
- `wrangler deploy --config wrangler.toml --dry-run`: exit 0; Worker and admin
  assets package successfully. This local packaging check did not deploy.
- The admin dependency installation reported 12 audit findings (2 low,
  1 moderate, 9 high). These have not been triaged or remediated; no dependency
  upgrade was included in the OAuth fix.
- No real Google sign-in was performed. The endpoint data repair remains pending
  explicit approval; the Worker deployment is recorded below.

## Authorized redeployment, 2026-10-22

The user requested "redeploy and I will test". Verified Wrangler authentication
for the configured Assaf account and Workers write permissions. Inspected the
previous deployed version metadata without printing secret values: D1 binding and
tracked variables matched the checkout. Preserved remote variables and secrets.

- Command: `wrangler deploy --config wrangler.toml --keep-vars --message ...`.
- Previous version: `9ca74003-4ac1-48ec-8584-570e08dbfcb5`.
- New version: `47c34ad1-5cfa-4012-af21-6072afaa65dd`, confirmed at 100% traffic
  by `wrangler deployments list`, deployed at 14:48 Asia/Jerusalem.
- `/admin`: HTTP 200, references the locally built `index-iED8iMQp.js` asset.
- Anonymous `/api/admin/projects`: HTTP 401.
- `/health`: HTTP 403 from the external probe; health endpoint acceptance was
  not established. Admin and API route checks above succeeded.
- No migration, provider UPDATE, secret rotation, commit or push was performed.
  Google login and MCP client acceptance remain unverified.

Previously cleared endpoint URLs remain stored until the separate approved repair
is executed or an operator configures the provider again. The deployed fix recovers
missing built-in endpoints during that configure operation.
