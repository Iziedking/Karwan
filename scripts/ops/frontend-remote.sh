#!/usr/bin/env bash
# Frontend gates without a browser on node-services, never on the laptop:
# typecheck, the unit tests and the npm check scripts, on Node 20 with npm ci.
# Each run gets its own workspace, removed when the run ends.
#   scripts/ops/frontend-remote.sh typecheck
#   scripts/ops/frontend-remote.sh test                          every unit test (test:ci)
#   scripts/ops/frontend-remote.sh test features/confirm         one folder or file
#   scripts/ops/frontend-remote.sh run check:i18n [check:hooks ...]   npm scripts, in order
set -euo pipefail
H=node-services
NODE_IMAGE=node:20-bookworm
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
NPM_CACHE=/tmp/karwan-npm-cache

case "${1:-}" in
  typecheck) CMD="cd frontend && npm run typecheck" ;;
  test)
    shift
    for p in "$@"; do
      case "$p" in *[!A-Za-z0-9_./-]*|-*|*..*) echo "bad test path: $p" >&2; exit 2 ;; esac
    done
    if [ $# -eq 0 ]; then CMD="cd frontend && npm run test:ci"; else CMD="cd frontend && node ../scripts/run-tests.mjs $* --concurrency=4"; fi ;;
  run)
    shift
    [ $# -gt 0 ] || { echo "usage: $0 run <npm-script>..." >&2; exit 2; }
    CMD="cd frontend"
    for s in "$@"; do
      case "$s" in *[!A-Za-z0-9:_-]*) echo "bad script name: $s" >&2; exit 2 ;; esac
      CMD="$CMD && npm run $s"
    done ;;
  *) echo "usage: $0 typecheck | test [path...] | run <npm-script>..." >&2; exit 2 ;;
esac

RUN=$(ssh -o BatchMode=yes $H 'd=$(mktemp -d /tmp/karwan-frontend.XXXXXXXX); echo ${d##*.}' < /dev/null)
W=/tmp/karwan-frontend.$RUN
cleanup() {
  ssh -o BatchMode=yes $H "docker rm -f karwan-frontend-run-$RUN >/dev/null 2>&1; rm -rf $W" < /dev/null || true
}
trap cleanup EXIT

tar -C "$ROOT" -czf - --exclude=node_modules --exclude=dist --exclude=backend/data --exclude='*.log' \
  --exclude=.next --exclude=test-results --exclude=playwright-report \
  package.json package-lock.json README.md RELEASE_NOTES.md CIRCLE.md SETUP.md LICENSE docs backend frontend cre/shared scripts contracts/deployments contracts/README.md \
  | ssh -o BatchMode=yes $H "mkdir -p $W/repo $NPM_CACHE && tar -C $W/repo -xzf -"

ssh -o BatchMode=yes $H "docker run --rm --name karwan-frontend-run-$RUN --cpus=8 --memory=8g \
  --user \$(id -u):\$(id -g) -e HOME=/tmp -e npm_config_cache=/npm-cache -v $NPM_CACHE:/npm-cache -v $W/repo:/repo -w /repo \
  --entrypoint sh $NODE_IMAGE -c $(printf '%q' "npm ci --no-audit --no-fund >/dev/null && $CMD")" < /dev/null
