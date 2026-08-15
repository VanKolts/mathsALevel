#!/usr/bin/env bash
#
# One-command deploy for Maths Study Hub.
#
# Deploying this app *is* `git push` — main publishes straight to GitHub Pages, and because
# Pages is set to "Deploy from a branch", the CI validator reports a failure but cannot stop
# the publish. So the real gate has to be here, before the commit exists. This script:
#
#   1. refuses to run on a dirty-but-nothing-to-say state (no changes → no empty commit);
#   2. bumps CACHE_VERSION in sw.js when a precached file changed, so every device that
#      already has the app installed picks the new build up instead of serving the old cache;
#   3. runs scripts/validate.mjs and stops dead if anything fails — a broken commit never
#      reaches the live site you actually revise from;
#   4. commits (message from $1, or auto-generated from what changed);
#   5. rebases on origin/main so a push from another machine can't cause a rejection;
#   6. pushes, then prints the live URL.
#
# Usage:
#   npm run deploy                       # auto-generated commit message
#   npm run deploy -- "Fix trig topics"  # your own message
#   bash scripts/deploy.sh "Fix trig topics"
#
# Flags:
#   --dry-run    do everything except commit and push (validation + what it would do)
#   --no-bump    skip the CACHE_VERSION bump even if precached files changed

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BRANCH="main"
LIVE_URL="https://vankolts.github.io/mathsALevel"

DRY_RUN=0
NO_BUMP=0
MESSAGE=""

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --no-bump) NO_BUMP=1 ;;
    -*)        echo "unknown flag: $arg" >&2; exit 2 ;;
    *)         MESSAGE="$arg" ;;
  esac
done

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
fail() { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------- 0. sanity ----

[ "$(git rev-parse --abbrev-ref HEAD)" = "$BRANCH" ] \
  || fail "on branch '$(git rev-parse --abbrev-ref HEAD)', not '$BRANCH' — deploy only publishes $BRANCH"

if [ -z "$(git status --porcelain)" ]; then
  say "Nothing to deploy — working tree is clean."
  # Still push if local is ahead of the remote (e.g. a previous run committed but failed to push).
  git fetch --quiet origin "$BRANCH"
  if [ "$(git rev-list --count "origin/$BRANCH..$BRANCH")" -gt 0 ]; then
    say "Local $BRANCH is ahead of origin — pushing existing commits."
    [ "$DRY_RUN" = 1 ] || git push origin "$BRANCH"
    echo "→ $LIVE_URL"
  fi
  exit 0
fi

# ---------------------------------------------- 1. bump the service-worker cache ----

# Everything sw.js precaches. If any of these changed, installed devices must be told to
# refetch — that is exactly what a CACHE_VERSION bump does (old caches are dropped on activate).
CACHED_PATHS=(index.html styles.css exam-dates.json data)

bumped=""
if [ "$NO_BUMP" = 0 ] && ! git diff --quiet HEAD -- "${CACHED_PATHS[@]}"; then
  current="$(sed -n "s/^const CACHE_VERSION *= *'\(v[0-9]*\)'.*/\1/p" sw.js)"
  at_head="$(git show "HEAD:sw.js" | sed -n "s/^const CACHE_VERSION *= *'\(v[0-9]*\)'.*/\1/p")"

  [ -n "$current" ] || fail "could not read CACHE_VERSION from sw.js"

  if [ "$current" = "$at_head" ]; then
    next="v$(( ${current#v} + 1 ))"
    # In-place, portable across BSD/GNU sed.
    sed "s/^const CACHE_VERSION *= *'$current'/const CACHE_VERSION = '$next'/" sw.js > sw.js.tmp
    mv sw.js.tmp sw.js
    bumped="$current → $next"
    say "Bumped service-worker cache: $bumped"
  else
    say "CACHE_VERSION already bumped this round ($at_head → $current) — leaving it."
  fi
fi

# ---------------------------------------------------------------- 2. validate ----

say "Validating…"
node scripts/validate.mjs || fail "validation failed — nothing committed, nothing pushed"
node scripts/fsrs-replay-test.mjs || fail "FSRS replay invariants failed — nothing committed, nothing pushed"

# ------------------------------------------------------- 3. commit message ----

git add -A

if [ -z "$MESSAGE" ]; then
  # Auto message: "Update index.html, styles.css" (+ "and 2 more" past three files).
  files=$(git diff --cached --name-only | head -3 | awk '{ printf "%s%s", sep, $0; sep = ", " }')
  count=$(git diff --cached --name-only | wc -l | tr -d ' ')
  MESSAGE="Update $files"
  [ "$count" -gt 3 ] && MESSAGE="$MESSAGE and $((count - 3)) more"
  [ -n "$bumped" ] && MESSAGE="$MESSAGE (cache $bumped)"
fi

say "Commit message: $MESSAGE"

if [ "$DRY_RUN" = 1 ]; then
  say "Dry run — staged but not committed. Files:"
  git diff --cached --name-status
  echo
  echo "Undo the staging with:  git reset"
  exit 0
fi

git commit -m "$MESSAGE"

# ------------------------------------------------------------ 4. push ----

say "Syncing with origin…"
git fetch --quiet origin "$BRANCH"
if [ "$(git rev-list --count "$BRANCH..origin/$BRANCH")" -gt 0 ]; then
  git rebase "origin/$BRANCH" \
    || fail "rebase hit a conflict — resolve it, then run: git rebase --continue && git push"
fi

say "Pushing…"
git push origin "$BRANCH"

say "Deployed."
echo "→ $LIVE_URL  (GitHub Pages usually reflects the push within a minute)"
[ -n "$bumped" ] && echo "→ cache $bumped: installed devices will pull the new build on next open"
exit 0
