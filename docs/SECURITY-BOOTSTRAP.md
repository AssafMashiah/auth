# Initial super-admin bootstrap

This release removes all committed and seeded super-admin credentials. The first privileged account must be created through the one-time bootstrap flow.

## Deploy

1. Set the deploy-time secret (do not commit its value):

   ```bash
   wrangler secret put AUTH_BOOTSTRAP_SECRET
   ```

2. With no `super_admin` row present, request a setup URL from `POST /api/admin/bootstrap` using an `X-Auth-Bootstrap-Secret` header containing that secret.
3. Open the returned URL and submit the first account to `POST /api/admin/bootstrap/complete`, again with the same header. The request body is `{ token, email, password, displayName }`.

The token is stored only as a hash, is invalidated when a replacement URL is issued, and is consumed before account creation. Requests fail if the secret is missing or wrong, a super-admin already exists, or the token is replayed.

## Required manual production remediation for Assaf

Do **not** rely on this release to alter existing D1 data. Before using bootstrap on the production database, manually remove the old seeded `admin_users` row and rotate/revoke its sessions in `admin_sessions`. Then rotate the old credentials anywhere they may have been copied.
