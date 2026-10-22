# Data-preserving Thrive upstream integration review

Updated 2026-10-22; upstream remote configured and fetched. No upstream merge,
GitHub fork conversion or database migration has been performed. The separate
OAuth fix was deployed; see OAUTH-PROVIDER-REPAIR.md for deployment evidence.

## Confirmed source state

- Local/origin: `AssafMashiah/auth`, branch `fix/oauth-exchange-reason-v2`,
  initial inspection HEAD `715eb5a`. GitHub reports this repository is not a platform fork.
- User-confirmed Thrive upstream: https://github.com/thriv-es/cloudflare-auth,
  default branch `main`, not archived. Its main is
  `b18e493f6ac75de3b71a60a2c74a471ae1871f0e`; dev is
  `555d787bba1e6053158f5629c1afc1c452b813e1` at inspection.
- `thriv-es/auth` is archived and is not the proposed upstream.
- README attributes the original project to `evilUrge/cloudflare-auth`.
- Local history already includes a manual port from Thrive's dev (`4881aed`).
- `origin` remains `https://github.com/AssafMashiah/auth.git`.
- `upstream` now points to `https://github.com/thriv-es/cloudflare-auth.git`.
  Its branches were fetched without merging or changing implementation files.
  `git merge-base HEAD <main-sha>` and `<dev-sha>` both exit 1: no shared ancestor.
  Local history starts with `b723887 source repo import`.
- Thrive main's `configureProvider` has the same clearing bug, as well as the old
  `.returning()` behavior fixed locally. Importing it does not fix this incident.

The user confirmed the upstream repository on 2026-10-22. Use its default `main`
branch as the proposed integration target; `dev` remains a comparison source.
The user subsequently authorized linking the upstream while preserving all local
implementation changes. This updates only local Git configuration and remote
tracking refs; it does not change GitHub's fork metadata or production data.

## Fetching future updates

Run `git fetch upstream --no-tags` to refresh the parent source, then inspect it
with `git log -10 --oneline upstream/main` and
`git diff --stat HEAD upstream/main`. Fetching does not change your working tree.
The parent uses `main`, not `master`. Keep publishing your own work to `origin`.

Because the imported histories have no common ancestor, the diff compares whole
trees; it is not a list of unapplied fixes. Fetching makes updates available for
review, but does not automatically incorporate them. Use a reviewed selective
port, or the initial reconciliation below, when adopting an upstream change.

## Proposed fork workflow

### Required MCP preservation

The user requires continued access to this auth service through MCP from Claude
and GPT clients. This is an acceptance requirement for every upstream integration.
Preserve the existing MCP implementation wherever it is hosted, its endpoint and
transport, tool names and schemas, authentication/authorization, project isolation,
and client connection configuration. Keep credentials in their existing protected
configuration; do not copy them into this repository or documentation.

No MCP server implementation was found in this auth checkout during the source
inspection. Its owning repository/server URL and the intended client connections
still need to be identified. Do not assume the auth REST API or an unrelated
content-management MCP provides this integration, and do not claim client access
has been verified.

Before accepting an upstream integration, verify each intended Claude/GPT MCP
client can initialize, discover the existing tools and perform an authorized
read-only auth-service operation against the correct project. Preserve existing
write-tool permissions without exercising production writes for this check.
Keep this gate separate from unit tests, deployment and ordinary sign-in checks.

A Git remote lets this repository track upstream fixes even without GitHub fork
metadata. GitHub fork conversion/creation is a separate hosting operation and
must not replace this repository or its deployment settings. Source updates do
not require importing Thrive's database, account, secrets or users.

After the prepared fix and integration plan are reviewed:

1. The upstream remote is now configured and its branches have been fetched.
   Preserve the current origin and local history. Record a backup ref before any
   integration. Refresh the parent source with:

   ```sh
   git fetch upstream --no-tags
   ```

2. Establish an explicitly reviewed initial reconciliation on an integration
   branch. The imported histories are unrelated; ordinary `git merge` will fail.
   Review an `--allow-unrelated-histories --no-commit --no-ff` merge in an isolated
   worktree after the current work is saved. Resolve file by file using this
   deployment's behavior and tests as acceptance requirements. Do not blanket
   accept either tree, force-reset origin, or use an ancestry-only merge to claim
   all upstream changes are integrated.
3. Retain local Google/Apple native sign-in, PKCE/state/redirect validation,
   verified-email linking, bootstrap hardening, admin operations, D1-compatible
   writes, email token separation, audit fixes, this provider fix and tests.
   Review Thrive's CORS and email/password reset differences separately.
4. Preserve `wrangler.toml` and `wrangler.dev.toml` deployment identities, routes,
   D1 IDs and environment variables; preserve remote secrets, especially the
   encryption/JWT/session keys. No DB replacement or user import. Audit migration
   lineage: this repo already uses `0001` for different migrations than Thrive's
   `0001_add_project_allowed_origins.sql`. Any adopted schema change needs a new
   uniquely numbered, additive migration and isolated-data testing. Never apply
   an upstream initial schema against production to synchronize code.
5. Run full tests, type checks, admin build, dry-run packaging and isolated
   existing-account/OAuth/email acceptance before presenting a merge for approval.
   Once that reconciliation is committed, future `upstream/main` merges have a
   shared ancestor. Periodically fetch, inspect incoming commits, open a reviewed
   sync branch/PR, and run the same gates. Automatic production merges/deployments
   are not part of this plan.

The OAuth incident patch and endpoint repair are independently reviewable now;
the larger upstream reconciliation remains a separate pending integration.
