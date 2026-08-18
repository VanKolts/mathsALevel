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
#   6. pushes;
#   7. waits until the live site actually serves the new bytes, and fails loudly if it doesn't.
#
# Step 7 exists because a successful `git push` is not a successful publish. On 2026-08-17 a
# push landed cleanly and this script said "Deployed", while GitHub's Pages deployment job was
# failing with a 503 during a platform incident — so the live site kept serving the previous
# build for as long as nobody thought to check. The script now checks.
#
# It asks "is the live site serving my working tree?" — comparing the *bytes* of every
# web-served file against what the live URL returns. Two deliberate choices:
#
#   · not CACHE_VERSION, because a commit touching index.html without a bump would match on
#     version instantly and prove nothing;
#   · the whole tree rather than this commit's files, because a deploy that failed outright
#     leaves everything stale — including for a later commit that only touched docs, which
#     would otherwise have nothing to check and would report success.
#
# Usage:
#   npm run deploy                       # auto-generated commit message
#   npm run deploy -- "Fix trig topics"  # your own message
#   bash scripts/deploy.sh "Fix trig topics"
#
# Flags:
#   --dry-run    do everything except commit and push (validation + what it would do)
#   --no-bump    skip the CACHE_VERSION bump even if precached files changed
#   --no-verify  push without waiting to confirm the site published (see step 7)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BRANCH="main"
LIVE_URL="https://vankolts.github.io/mathsALevel"

DRY_RUN=0
NO_BUMP=0
NO_VERIFY=0
MESSAGE=""

# How long to wait for GitHub Pages to publish before calling it a failure. Pages is usually
# well under a minute; 5 minutes is generous enough that a slow-but-working deploy is not
# reported as broken, and short enough to notice a genuinely stuck one.
VERIFY_TIMEOUT=300
VERIFY_INTERVAL=10

for arg in "$@"; do
  case "$arg" in
    --dry-run)   DRY_RUN=1 ;;
    --no-bump)   NO_BUMP=1 ;;
    --no-verify) NO_VERIFY=1 ;;
    -*)          echo "unknown flag: $arg" >&2; exit 2 ;;
    *)           MESSAGE="$arg" ;;
  esac
done

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
fail() { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
warn() { printf '\n\033[33m! %s\033[0m\n' "$*" >&2; }

SUM_BIN=""
if command -v shasum >/dev/null 2>&1; then
  SUM_BIN="shasum -a 256"
elif command -v sha256sum >/dev/null 2>&1; then
  SUM_BIN="sha256sum"
fi

# Every file GitHub Pages serves verbatim at a predictable URL — so every file whose bytes we
# can compare — smallest first, because a stale deploy mismatches on the first one checked and
# there is no reason to pull 600 KB of index.html to learn that.
#
# The question this asks is "is the live site serving my working tree?", not "did the files in
# this commit land?". Those differ in exactly the case worth catching: a deploy that failed
# outright leaves the *whole* tree stale, including for a later commit that only touched docs.
#
# Excludes README.md and docs/: with no _config.yml, Pages runs Jekyll, which turns Markdown
# into HTML rather than serving it raw, so their bytes would never match.
web_served() {
  local f
  for f in sw.js exam-dates.json styles.css data/*.js index.html; do
    [ -f "$f" ] && printf '%s\n' "$f"
  done
}

# Poll the live site until every file in $1 (newline-separated) matches its local bytes.
verify_publish() {
  local files="$1" deadline now stale local_sum live_sum f

  if [ "$NO_VERIFY" = 1 ]; then
    warn "Skipping the publish check (--no-verify). The push succeeded; whether it went live is unconfirmed."
    return 0
  fi
  if [ -z "$SUM_BIN" ] || ! command -v curl >/dev/null 2>&1; then
    warn "Need curl and shasum/sha256sum to confirm the publish; skipping the check."
    return 0
  fi

  say "Waiting for the live site to serve this build…"
  deadline=$(( $(date +%s) + VERIFY_TIMEOUT ))

  while :; do
    stale=""
    while IFS= read -r f; do
      [ -n "$f" ] || continue
      [ -z "$stale" ] || continue          # first mismatch is enough for this round
      local_sum="$($SUM_BIN < "$f" | cut -d' ' -f1)"
      # Cache-bust: without a unique query the CDN can hand back the previous build for minutes.
      live_sum="$(curl -fsSL -H 'Cache-Control: no-cache' \
                    "$LIVE_URL/$f?deploycheck=$(date +%s)-$RANDOM" 2>/dev/null \
                    | $SUM_BIN | cut -d' ' -f1)" || live_sum=""
      [ "$live_sum" = "$local_sum" ] || stale=" $f"
    done <<EOF
$files
EOF

    if [ -z "$stale" ]; then
      say "Published — the live site is serving this build."
      return 0
    fi

    now="$(date +%s)"
    if [ "$now" -ge "$deadline" ]; then
      printf '\n\033[31m✗ Pushed, but the live site is still serving the old build after %ss.\033[0m\n' "$VERIFY_TIMEOUT" >&2
      printf '\n  Still stale:%s\n' "$stale" >&2
      cat >&2 <<MSG

  Your commit is safe on origin/$BRANCH. This is a publish failure, not a code failure —
  nothing needs re-committing and nothing was lost.

  Almost always one of two things:
    · the Pages deployment job errored (a 503 during a GitHub incident will do it), or
    · Pages is degraded and simply has not got to it yet.

  Check   https://github.com/VanKolts/mathsALevel/actions   → re-run the failed
          "pages-build-deployment" job. No new commit is needed.
  Status  https://www.githubstatus.com

MSG
      exit 1
    fi
    printf '  still stale:%s — retrying in %ss\n' "$stale" "$VERIFY_INTERVAL"
    sleep "$VERIFY_INTERVAL"
  done
}

# ---------------------------------------------------------------- 0. sanity ----

# Everything sw.js precaches. If any of these changed, installed devices must be told to
# refetch — that is exactly what a CACHE_VERSION bump does (old caches are dropped on activate).
CACHED_PATHS=(index.html styles.css exam-dates.json data)

sw_version_in() { sed -n "s/^const CACHE_VERSION *= *'\(v[0-9]*\)'.*/\1/p" "$1"; }

[ "$(git rev-parse --abbrev-ref HEAD)" = "$BRANCH" ] \
  || fail "on branch '$(git rev-parse --abbrev-ref HEAD)', not '$BRANCH' — deploy only publishes $BRANCH"

if [ -z "$(git status --porcelain)" ]; then
  say "Nothing to deploy — working tree is clean."
  # Still push if local is ahead of the remote (e.g. a previous run committed but failed to push).
  git fetch --quiet origin "$BRANCH"
  if [ "$(git rev-list --count "origin/$BRANCH..$BRANCH")" -gt 0 ]; then
    say "Local $BRANCH is ahead of origin — pushing existing commits."
    # Committing by hand and then running deploy skips the bump in step 1: by then the tree is
    # clean and there is nothing left to compare against HEAD. That shipped v26 twice on
    # 2026-08-18. So check the *unpushed range* instead — if it touched anything sw.js
    # precaches and CACHE_VERSION did not move, bump it here, as its own commit.
    if [ "$NO_BUMP" = 0 ] && ! git diff --quiet "origin/$BRANCH" "$BRANCH" -- "${CACHED_PATHS[@]}"; then
      current="$(sw_version_in sw.js)"
      at_remote="$(git show "origin/$BRANCH:sw.js" | sed -n "s/^const CACHE_VERSION *= *'\(v[0-9]*\)'.*/\1/p")"
      [ -n "$current" ] || fail "could not read CACHE_VERSION from sw.js"
      if [ "$current" = "$at_remote" ]; then
        next="v$(( ${current#v} + 1 ))"
        say "Unpushed commits changed precached files without a bump — bumping $current → $next."
        # Guarded, so --dry-run leaves the working tree exactly as it found it.
        if [ "$DRY_RUN" = 0 ]; then
          sed "s/^const CACHE_VERSION *= *'$current'/const CACHE_VERSION = '$next'/" sw.js > sw.js.tmp
          mv sw.js.tmp sw.js
          git add sw.js
          git commit -q -m "Bump service-worker cache to $next"
        fi
      else
        say "CACHE_VERSION already moved in the unpushed range ($at_remote → $current) — leaving it."
      fi
    fi
    if [ "$DRY_RUN" = 0 ]; then
      git push origin "$BRANCH"
      verify_publish "$(web_served)"
    fi
    echo "→ $LIVE_URL"
  fi
  exit 0
fi

# ---------------------------------------------- 1. bump the service-worker cache ----

bumped=""
if [ "$NO_BUMP" = 0 ] && ! git diff --quiet HEAD -- "${CACHED_PATHS[@]}"; then
  current="$(sw_version_in sw.js)"
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
node scripts/fsrs-mistake-test.mjs || fail "FSRS mistake-evidence invariants failed — nothing committed, nothing pushed"
node scripts/fsrs-paper-test.mjs || fail "FSRS past-paper invariants failed — nothing committed, nothing pushed"

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

# ------------------------------------------- 5. confirm it actually published ----

verify_publish "$(web_served)"

say "Deployed."
echo "→ $LIVE_URL"
[ -n "$bumped" ] && echo "→ cache $bumped: installed devices will pull the new build on next open"
exit 0
