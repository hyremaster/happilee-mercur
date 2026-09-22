#!/usr/bin/env bash
#
# Production deploy for happilee-mercur: the Medusa API plus the admin and
# vendor panels. Run it ON the production server, as the deploy user.
#
#   ./deploy.sh setup                  one-off: create the directory layout
#   ./deploy.sh deploy <tag> [flags]   build <tag> into a new release, go live
#   ./deploy.sh rollback               switch back to the previous release
#   ./deploy.sh status                 show what is live
#   ./deploy.sh list                   list releases on disk
#
# Deploy flags:
#   --skip-backup        do not pg_dump before running migrations
#   --allow-off-branch   deploy a tag that is not on $RELEASE_BRANCH
#
# How a deploy works (see README.md next to this file):
#   1. check out <tag> into releases/<timestamp>-<tag>/ while the current
#      release keeps serving traffic
#   2. link the shared env files in, install, build API packages and panels
#   3. back up the database, run migrations
#   4. atomically repoint `current` at the new release, restart the API
#   5. health-check; on failure, repoint `current` back and restart again
#
# Rollback is a symlink switch, not a rebuild. Migrations are NOT rolled back:
# keep them backward compatible with the previous release (add columns, don't
# drop or rename them in the same release that stops using them).
#
# Nothing secret belongs in this file — it is in a public repository. Secrets
# live in $APP_ROOT/shared/ on the server only.

# -E so the ERR trap also fires inside functions and subshells.
set -Eeuo pipefail

# ─── Configuration (override via environment) ────────────────────────────────

APP_ROOT="${APP_ROOT:-/home/ubuntu/happilee-prod}"
REPO_URL="${REPO_URL:-https://github.com/hyremaster/happilee-mercur.git}"
RELEASE_BRANCH="${RELEASE_BRANCH:-main}"
KEEP_RELEASES="${KEEP_RELEASES:-5}"
KEEP_BACKUPS="${KEEP_BACKUPS:-10}"
API_PORT="${API_PORT:-9000}"
PM2_API_NAME="${PM2_API_NAME:-happilee-api}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-180}"
BUILD_HEAP_MB="${BUILD_HEAP_MB:-3072}"
MIN_FREE_MB="${MIN_FREE_MB:-2048}"

REPO_CACHE="$APP_ROOT/repo"
RELEASES="$APP_ROOT/releases"
SHARED="$APP_ROOT/shared"
BACKUPS="$APP_ROOT/backups"
CURRENT="$APP_ROOT/current"
LOG_FILE="$APP_ROOT/deploy.log"
LOCK_FILE="$APP_ROOT/.deploy.lock"

# Shared file -> path inside each release. These are gitignored in the repo, so
# every release gets them from shared/ instead.
SHARED_LINKS=(
  "api.env:apps/api/.env"
  "admin.env.production:apps/admin/.env.production"
  "vendor.env.production:apps/vendor/.env.production"
)

export PATH="$HOME/.bun/bin:$PATH"

# Release being built but not yet live. If the script dies while this is set,
# the EXIT trap removes it: a half-built release must never become a rollback
# target. Cleared the moment the release goes live.
BUILDING_RELEASE=""
DEPLOY_TAG=""

# ─── Helpers ─────────────────────────────────────────────────────────────────

step() { printf '\n==> %s\n' "$*"; }
info() { printf '    %s\n' "$*"; }
die()  { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

log_event() {
  # tag, commit, result — one line per deploy/rollback, for "who shipped what".
  printf '%s\t%s\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${SUDO_USER:-$USER}" "$*" \
    >> "$LOG_FILE"
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "'$1' is not installed or not on PATH."
}

acquire_lock() {
  exec 9>"$LOCK_FILE"
  flock -n 9 || die "Another deploy is running (lock: $LOCK_FILE)."
}

current_release() {
  [[ -L "$CURRENT" ]] && readlink -f "$CURRENT" || true
}

releases_newest_first() {
  # Release dirs are named <UTC timestamp>-<tag>, so name order is time order.
  # (Directory mtimes are useless here: installs and builds keep touching them.)
  find "$RELEASES" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort -r
}

previous_release() {
  # The release that was live before the current one: the newest release older
  # than the live one. Failed releases are removed, so this is always a release
  # that passed its health check.
  local live dir
  live="$(current_release)"
  while read -r dir; do
    [[ "$(readlink -f "$dir")" == "$live" ]] && continue
    [[ -z "$live" || "$(basename "$dir")" < "$(basename "$live")" ]] && { echo "$dir"; return; }
  done < <(releases_newest_first)
}

remove_release() {
  git -C "$REPO_CACHE" worktree remove --force "$1" 2>/dev/null || rm -rf "$1"
  git -C "$REPO_CACHE" worktree prune
}

switch_to() {
  # Atomic: build the new link beside `current`, then rename over it.
  local target="$1"
  ln -sfn "$target" "$CURRENT.tmp"
  mv -Tf "$CURRENT.tmp" "$CURRENT"
}

restart_api() {
  # The pm2 process cds into $CURRENT/apps/api at start, so a restart picks up
  # whatever `current` now points at. Panels are static files served by nginx
  # straight from $CURRENT, so they switch with the symlink and need no restart.
  if pm2 describe "$PM2_API_NAME" >/dev/null 2>&1; then
    pm2 restart "$PM2_API_NAME" --update-env >/dev/null
  else
    pm2 start "$SHARED/ecosystem.config.cjs" --only "$PM2_API_NAME" >/dev/null
  fi
  pm2 save >/dev/null
}

health_check() {
  local url="http://127.0.0.1:${API_PORT}/health" waited=0
  info "waiting for $url (up to ${HEALTH_TIMEOUT}s)"
  until [[ "$(curl -s -o /dev/null -w '%{http_code}' "$url" || true)" == "200" ]]; do
    sleep 3
    waited=$((waited + 3))
    (( waited >= HEALTH_TIMEOUT )) && return 1
  done

  # Optional deeper check: a real store call through the publishable key.
  if [[ -n "${SMOKE_PUBLISHABLE_KEY:-}" ]]; then
    local code
    code="$(curl -s -o /dev/null -w '%{http_code}' \
      -H "x-publishable-api-key: $SMOKE_PUBLISHABLE_KEY" \
      "http://127.0.0.1:${API_PORT}/store/regions" || true)"
    [[ "$code" == "200" ]] || { info "store smoke test returned $code"; return 1; }
  fi
  info "healthy after ${waited}s"
}

load_deploy_env() {
  # Optional: SMOKE_PUBLISHABLE_KEY for the deeper health check.
  if [[ -f "$SHARED/deploy.env" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "$SHARED/deploy.env"
    set +a
  fi

  # @happilee-app/* comes from GitHub Packages. Per the repo's .npmrc, the token
  # lives in the deploy user's untracked ~/.npmrc, never in the repo.
  grep -q '^//npm.pkg.github.com/:_authToken=' "$HOME/.npmrc" 2>/dev/null \
    || die "No GitHub Packages token in ~/.npmrc (see README.md). bun install would fail on @happilee-app/*."
}

check_shared_files() {
  local entry file
  for entry in "${SHARED_LINKS[@]}"; do
    file="${entry%%:*}"
    [[ -s "$SHARED/$file" ]] || die "Missing or empty $SHARED/$file (see README.md)."
  done
  [[ -f "$SHARED/ecosystem.config.cjs" ]] || die "Missing $SHARED/ecosystem.config.cjs."
}

prune_releases() {
  local live dir
  live="$(current_release)"
  while read -r dir; do
    [[ "$(readlink -f "$dir")" == "$live" ]] && continue
    info "removing old release $(basename "$dir")"
    remove_release "$dir"
  done < <(releases_newest_first | tail -n +"$((KEEP_RELEASES + 1))")

  # Pre-migration dumps: keep the newest $KEEP_BACKUPS.
  find "$BACKUPS" -maxdepth 1 -name 'pre-*.dump' 2>/dev/null | sort -r \
    | tail -n +"$((KEEP_BACKUPS + 1))" | while read -r dump; do
        info "removing old backup $(basename "$dump")"
        rm -f "$dump"
      done
}

on_error() {
  # set -e would otherwise exit silently; say what failed and where. Report
  # only from the top-level shell so a failure inside ( ... ) prints once.
  (( BASH_SUBSHELL == 0 )) || return 0
  printf '\nERROR: command failed (line %s): %s\n' "$1" "$2" >&2
}

on_exit() {
  local rc=$?
  if (( rc != 0 )) && [[ -n "$BUILDING_RELEASE" && -d "$BUILDING_RELEASE" ]]; then
    printf '    removing incomplete release %s\n' "$(basename "$BUILDING_RELEASE")" >&2
    remove_release "$BUILDING_RELEASE"
    log_event "deploy	${DEPLOY_TAG:-?}	-	FAILED-build"
  fi
}

trap 'on_error "$LINENO" "$BASH_COMMAND"' ERR
trap on_exit EXIT

# ─── Commands ────────────────────────────────────────────────────────────────

cmd_setup() {
  require_cmd git
  mkdir -p "$RELEASES" "$SHARED" "$BACKUPS"
  chmod 700 "$SHARED" "$BACKUPS"
  if [[ ! -d "$REPO_CACHE/.git" ]]; then
    step "Cloning $REPO_URL"
    git clone --no-checkout "$REPO_URL" "$REPO_CACHE"
  fi
  touch "$LOG_FILE"
  step "Layout ready under $APP_ROOT"
  info "Now create these in $SHARED (chmod 600), then run: $0 deploy <tag>"
  local entry
  for entry in "${SHARED_LINKS[@]}"; do info "  ${entry%%:*}"; done
  info "  deploy.env              optional: SMOKE_PUBLISHABLE_KEY=pk_..."
  info "  ecosystem.config.cjs    copy from deploy/prod/ in the repo"
  info "And in ~/.npmrc: //npm.pkg.github.com/:_authToken=<PAT, read:packages only>"
}

cmd_deploy() {
  local tag="" skip_backup=0 allow_off_branch=0
  while (( $# )); do
    case "$1" in
      --skip-backup) skip_backup=1 ;;
      --allow-off-branch) allow_off_branch=1 ;;
      -*) die "Unknown flag: $1" ;;
      *) [[ -z "$tag" ]] && tag="$1" || die "Unexpected argument: $1" ;;
    esac
    shift
  done
  [[ -n "$tag" ]] || die "Usage: $0 deploy <tag> [--skip-backup] [--allow-off-branch]"

  require_cmd git; require_cmd bun; require_cmd pm2; require_cmd curl; require_cmd flock
  [[ -d "$REPO_CACHE/.git" ]] || die "Run '$0 setup' first."
  acquire_lock
  load_deploy_env
  check_shared_files

  # ── Resolve and verify the tag ──
  step "Fetching $REPO_URL"
  git -C "$REPO_CACHE" fetch --quiet --prune --tags origin \
    "+refs/heads/$RELEASE_BRANCH:refs/remotes/origin/$RELEASE_BRANCH"

  git -C "$REPO_CACHE" rev-parse -q --verify "refs/tags/$tag" >/dev/null \
    || die "Tag '$tag' does not exist. Deploy tags only — never a branch head."
  local commit
  commit="$(git -C "$REPO_CACHE" rev-parse "refs/tags/$tag^{commit}")"

  if (( ! allow_off_branch )) && \
     ! git -C "$REPO_CACHE" merge-base --is-ancestor "$commit" "origin/$RELEASE_BRANCH"; then
    die "Tag '$tag' ($commit) is not on $RELEASE_BRANCH. Merge it there first, or pass --allow-off-branch."
  fi
  info "tag $tag -> ${commit:0:12}"

  local free_mb
  free_mb="$(free -m | awk '/^Mem:/{print $7}')"
  if (( free_mb < MIN_FREE_MB )); then
    die "Only ${free_mb}MB RAM available (need ${MIN_FREE_MB}MB to build beside live traffic). Resize the instance or add swap — do not stop the live API to make room."
  fi

  # ── Build the new release beside the live one ──
  local release="$RELEASES/$(date -u +%Y%m%d%H%M%S)-${tag}"
  [[ -e "$release" ]] && die "Release directory $release already exists."
  step "Creating release $(basename "$release")"
  DEPLOY_TAG="$tag"
  BUILDING_RELEASE="$release"
  git -C "$REPO_CACHE" worktree add --quiet --detach "$release" "$commit"

  local entry target
  for entry in "${SHARED_LINKS[@]}"; do
    target="$release/${entry#*:}"
    [[ -d "$(dirname "$target")" ]] || die "Release has no $(dirname "${entry#*:}")/ — is $tag really this repo?"
    ln -sfn "$SHARED/${entry%%:*}" "$target"
  done

  step "Installing dependencies (frozen lockfile)"
  ( cd "$release" && bun install --frozen-lockfile )

  step "Building packages"
  ( cd "$release" && NODE_OPTIONS="--max-old-space-size=$BUILD_HEAP_MB" bun run build )

  step "Building admin and vendor panels (production mode)"
  ( cd "$release/apps/admin"  && NODE_OPTIONS="--max-old-space-size=$BUILD_HEAP_MB" bunx vite build --mode production )
  ( cd "$release/apps/vendor" && NODE_OPTIONS="--max-old-space-size=$BUILD_HEAP_MB" bunx vite build --mode production )

  # ── Database: back up, then migrate while the old release still serves ──
  if (( skip_backup )); then
    info "skipping database backup (--skip-backup)"
  else
    require_cmd pg_dump
    local db_url dump="$BACKUPS/pre-$(date -u +%Y%m%d%H%M%S)-${tag}.dump"
    db_url="$(grep -E '^DATABASE_URL=' "$SHARED/api.env" | head -n1 | cut -d= -f2-)"
    [[ -n "$db_url" ]] || die "DATABASE_URL not found in $SHARED/api.env."
    step "Backing up database to $(basename "$dump")"
    pg_dump --format=custom --no-owner --file="$dump" "$db_url"
    chmod 600 "$dump"
  fi

  step "Running migrations"
  ( cd "$release/apps/api" && bunx medusa db:migrate )

  # ── Go live ──
  local previous
  previous="$(current_release)"
  step "Switching current -> $(basename "$release")"
  switch_to "$release"
  BUILDING_RELEASE=""   # live now; failure from here on is handled by rollback
  restart_api

  step "Health check"
  if health_check; then
    log_event "deploy	$tag	${commit:0:12}	ok"
    prune_releases
    step "Live: $tag (${commit:0:12})"
    return 0
  fi

  # ── Automatic rollback ──
  log_event "deploy	$tag	${commit:0:12}	FAILED-health"
  if [[ -n "$previous" ]]; then
    step "Health check failed — rolling back to $(basename "$previous")"
    switch_to "$previous"
    restart_api
    if health_check; then
      log_event "auto-rollback	$(basename "$previous")	-	ok"
      # Drop the failed release so a later `rollback` can never land on it.
      remove_release "$release"
      die "Deploy of $tag failed its health check; previous release restored. Migrations from $tag were NOT reverted. Check: pm2 logs $PM2_API_NAME"
    fi
    log_event "auto-rollback	$(basename "$previous")	-	FAILED"
    die "Rollback ALSO failed its health check. Site is likely down. Check: pm2 logs $PM2_API_NAME"
  fi
  die "Deploy of $tag failed its health check and there is no previous release to roll back to."
}

cmd_rollback() {
  require_cmd pm2; require_cmd curl; require_cmd flock
  acquire_lock
  local target
  target="$(previous_release)"
  [[ -n "$target" ]] || die "No previous release on disk to roll back to."
  step "Rolling back: $(basename "$(current_release)") -> $(basename "$target")"
  info "database migrations are not reverted"
  switch_to "$target"
  restart_api
  step "Health check"
  health_check || { log_event "rollback	$(basename "$target")	-	FAILED"; die "Rolled-back release is unhealthy. Check: pm2 logs $PM2_API_NAME"; }
  log_event "rollback	$(basename "$target")	-	ok"
  step "Live: $(basename "$target")"
}

cmd_status() {
  local live
  live="$(current_release)"
  if [[ -z "$live" ]]; then echo "Nothing deployed yet."; return; fi
  echo "Live release : $(basename "$live")"
  echo "Commit       : $(git -C "$live" rev-parse --short=12 HEAD 2>/dev/null || echo '?')"
  echo "API process  : $(pm2 describe "$PM2_API_NAME" 2>/dev/null | awk -F'│' '/status/{gsub(/ /,"",$3); print $3; exit}')"
  echo "Last events  :"
  tail -n 5 "$LOG_FILE" 2>/dev/null | sed 's/^/  /'
}

cmd_list() {
  local live dir
  live="$(current_release)"
  while read -r dir; do
    [[ "$(readlink -f "$dir")" == "$live" ]] && echo "* $(basename "$dir")  (live)" || echo "  $(basename "$dir")"
  done < <(releases_newest_first)
}

# ─── Entry point ─────────────────────────────────────────────────────────────

main() {
  local cmd="${1:-}"
  shift || true
  case "$cmd" in
    setup)    cmd_setup "$@" ;;
    deploy)   cmd_deploy "$@" ;;
    rollback) cmd_rollback "$@" ;;
    status)   cmd_status "$@" ;;
    list)     cmd_list "$@" ;;
    *)
      sed -n '3,14p' "$0" | sed 's/^# \{0,1\}//'
      exit 1
      ;;
  esac
}

main "$@"
