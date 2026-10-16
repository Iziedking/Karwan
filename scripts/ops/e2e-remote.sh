#!/usr/bin/env bash
# Frontend browser tests on node-services, never on the laptop. Mirrors the CI
# Browser job: Node 20 with Playwright's own Chromium, npm ci, a production
# build, then the specs. Each run gets its own workspace, removed at the end.
#   scripts/ops/e2e-remote.sh                       every spec
#   scripts/ops/e2e-remote.sh e2e/market.spec.ts    one or more specs
#   PROJECT=phone scripts/ops/e2e-remote.sh ...     one screen size
#   TRACE=1 scripts/ops/e2e-remote.sh ...           keep traces of failures in frontend/test-results
#   OVERLAY="frontend/e2e/a.spec.ts ..." scripts/ops/e2e-remote.sh ...
#                                                   the last commit plus only these working files, so
#                                                   another session's unfinished edits stay out of the run
set -euo pipefail
H=node-services
IMAGE=mcr.microsoft.com/playwright:v1.63.0-noble
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
NPM_CACHE=/tmp/karwan-npm-cache

# Paths are pasted into a remote command, so only plain relative paths pass.
for p in "$@"; do
  case "$p" in *[!A-Za-z0-9_./:-]*|-*|*..*) echo "bad spec path: $p" >&2; exit 2 ;; esac
done
case "${PROJECT:-}" in ''|phone|tablet|desktop) ;; *) echo "bad PROJECT: $PROJECT" >&2; exit 2 ;; esac
ARGS="$*${PROJECT:+ --project=$PROJECT}${TRACE:+ --trace=retain-on-failure}"

RUN=$(ssh -o BatchMode=yes $H 'd=$(mktemp -d /tmp/karwan-e2e.XXXXXXXX); echo ${d##*.}' < /dev/null)
W=/tmp/karwan-e2e.$RUN
cleanup() {
  if [ -n "${TRACE:-}" ]; then
    rm -rf "$ROOT/frontend/test-results"
    ssh -o BatchMode=yes $H "tar -C $W/repo/frontend -czf - test-results 2>/dev/null" < /dev/null | tar -C "$ROOT/frontend" -xzf - 2>/dev/null || true
  fi
  ssh -o BatchMode=yes $H "docker rm -f karwan-e2e-run-$RUN >/dev/null 2>&1; rm -rf $W" < /dev/null || true
}
trap cleanup EXIT

if [ -n "${OVERLAY:-}" ]; then
  git -C "$ROOT" archive --format=tar HEAD package.json package-lock.json backend frontend cre/shared scripts \
    | ssh -o BatchMode=yes $H "mkdir -p $W/repo $NPM_CACHE && tar -C $W/repo -xf -"
  # shellcheck disable=SC2086
  tar -C "$ROOT" -czf - $OVERLAY | ssh -o BatchMode=yes $H "tar -C $W/repo -xzf -"
else
  tar -C "$ROOT" -czf - --exclude=node_modules --exclude=dist --exclude=backend/data --exclude='*.log' \
    --exclude=.next --exclude=test-results --exclude=playwright-report \
    package.json package-lock.json backend frontend cre/shared scripts \
    | ssh -o BatchMode=yes $H "mkdir -p $W/repo $NPM_CACHE && tar -C $W/repo -xzf -"
fi

ssh -o BatchMode=yes $H "docker run --rm --name karwan-e2e-run-$RUN --cpus=8 --memory=12g --ipc=host \
  --user \$(id -u):\$(id -g) -e HOME=/tmp -e CI=1 -e npm_config_cache=/npm-cache -v $NPM_CACHE:/npm-cache -v $W/repo:/repo -w /repo \
  --entrypoint bash $IMAGE -c $(printf '%q' "npm ci --no-audit --no-fund >/dev/null && cd frontend && npx playwright test --reporter=line --workers=4 $ARGS")" < /dev/null && echo "e2e: all passed"
