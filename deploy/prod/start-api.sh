#!/usr/bin/env bash
#
# pm2 entry point for the production API (see ecosystem.config.cjs).
#
# Loads the secrets from AWS Secrets Manager into this process's environment,
# then replaces itself with the API. Values exported here take precedence over
# apps/api/.env, which only holds non-secret settings.
#
# Without API_SECRET_ID it starts the API with whatever apps/api/.env provides,
# so a box configured with a plain env file keeps working.

set -Eeuo pipefail

HERE="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
RELEASE_ROOT="$(cd "$HERE/../.." && pwd)"

# Release-local binaries first (mercurjs and friends), then bun itself.
export PATH="$RELEASE_ROOT/apps/api/node_modules/.bin:$RELEASE_ROOT/node_modules/.bin:$HOME/.bun/bin:$PATH"

if [[ -n "${API_SECRET_ID:-}" ]]; then
  # shellcheck source=load-secrets.sh
  source "$HERE/load-secrets.sh"
  load_api_secrets || { echo "start-api: could not load secrets; refusing to start" >&2; exit 1; }
fi

cd "$RELEASE_ROOT/apps/api"
exec bun run start
