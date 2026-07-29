#!/usr/bin/env bash
set -euo pipefail

sha="${GITHUB_SHA:-$(git rev-parse HEAD)}"
run_url="${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY:-AssafMashiah/auth}/actions/runs/${GITHUB_RUN_ID:-local}"

exec npx wrangler deploy \
  --tag "sha-${sha:0:12}" \
  --message "git_sha=${sha} ci_run=${run_url}" \
  "$@"
