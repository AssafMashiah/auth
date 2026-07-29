# Auth security hardening

## Findings addressed
1. Removed committed super-admin seed credentials and added a one-time `AUTH_BOOTSTRAP_SECRET`-signed bootstrap endpoint backed by the `admin_bootstrap` D1 gate.
2. Enforced route-level admin RBAC.
3. Sanitized email HTML, sandboxed previews, and moved admin bearer material to HttpOnly cookie + CSRF protection.
4. Restricted credentialed CORS to `ADMIN_DOMAIN`.
5. Added 32-byte base64url OAuth state, browser-session binding, D1 10-minute TTL storage, one-time consumption, exact redirect URL allowlisting, and PKCE S256.
6. OAuth now issues the persisted, rotated refresh token used by password authentication.
7. Pinned Vitest discovery to `test/**/*.test.ts` and excludes `.worktrees/**`.
8. Added `scripts/annotate-deploy.sh`, which passes Git SHA and CI run URL as Wrangler Worker Version tag/message metadata.

## Files changed
- Auth routes/services/middleware, D1 migration `0001_security_hardening.sql`, security helper tests, admin UI API/preview code, and Vitest configuration.

## Manual production steps (Assaf)
1. Delete the existing seed-super-admin row from the production D1 `admin_users` table via the Cloudflare dashboard or a one-off operator script.
2. Revoke/rotate any admin sessions issued under that account (delete related `admin_sessions` rows).
3. Set the deployment secret: `wrangler secret put AUTH_BOOTSTRAP_SECRET`.
4. Deploy migrations before Worker traffic: `wrangler d1 migrations apply DB --remote`.
5. Deploy using `./scripts/annotate-deploy.sh` (or the equivalent CI invocation) so the SHA and CI run URL appear in Worker Version metadata.

## Live re-verification checklist
- An unknown Origin does not receive `Access-Control-Allow-Origin` or credentials.
- Browser JavaScript cannot read `admin_session`; state-changing admin requests without matching CSRF cookie/header fail.
- A viewer cannot mutate settings/projects/users; an admin cannot change admin users or provider configuration.
- A bad, expired, mismatched, or replayed OAuth state fails with 400; redirect URI must exactly match the project's stored list; provider receives S256 PKCE challenge.
- OAuth refresh rotates; replaying the old refresh token fails.
- Bootstrap URL works only before the first super_admin exists and cannot be replayed.
