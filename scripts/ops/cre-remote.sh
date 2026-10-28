#!/usr/bin/env bash
# Run the CRE CLI on node-services in a throwaway workspace, never on the laptop.
#   scripts/ops/cre-remote.sh simulate karwan-check --target staging-settings --trigger-index 0 [...]
#   scripts/ops/cre-remote.sh exec -- <cmd>     run a command in the workspace's cre/ folder
#   scripts/ops/cre-remote.sh tty -- <cmd>      the same with a terminal, for a command that asks to confirm
#   scripts/ops/cre-remote.sh --clean
# The CLI reads CRE_API_KEY from ~/.karwan-cre-env on node-services (owner
# creates it once, mode 600); nothing secret leaves that host.
set -euo pipefail
H=node-services
CRE_VERSION=v1.38.0
CRE_TARBALL=cre_${CRE_VERSION}_linux_amd64.tar.gz
# Recorded on 2026-10-15 from the release's checksums.txt; checked here, never re-fetched.
CRE_TARBALL_SHA256=299e059aa086ff7e0413c4855269d1caf65e98e99ea72ae48766fb108a2c53da
BUN_IMAGE=oven/bun:1.3.14@sha256:e10577f0db68676a7024391c6e5cb4b879ebd17188ab750cf10024a6d700e5c4
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STATE="$HOME/.karwan-cre-remote"

if [ "${1:-}" = "--clean" ]; then
  if [ -f "$STATE" ]; then
    W=$(cat "$STATE")
    ssh -o BatchMode=yes $H "docker run --rm -v $W:/w --entrypoint sh $BUN_IMAGE -c 'rm -rf /w/repo' 2>/dev/null; rm -rf $W" < /dev/null
  fi
  rm -f "$STATE"
  exit 0
fi

if [ -f "$STATE" ] && ssh -o BatchMode=yes $H "test -f $(cat "$STATE")/.izie-test-owner" < /dev/null; then
  W=$(cat "$STATE")
else
  W=$(ssh -o BatchMode=yes $H 'd=$(mktemp -d /tmp/karwan-cre.XXXXXXXX); touch $d/.izie-test-owner; echo $d' < /dev/null)
  echo "$W" > "$STATE"
fi

ssh -o BatchMode=yes $H "set -e; mkdir -p $W/bin; cd $W/bin
  if [ ! -x cre ]; then
    curl -sSfL -o $CRE_TARBALL https://github.com/smartcontractkit/cre-cli/releases/download/$CRE_VERSION/cre_linux_amd64.tar.gz
    echo '$CRE_TARBALL_SHA256  $CRE_TARBALL' | sha256sum -c
    tar -xzf $CRE_TARBALL
    mv \$(find . -type f -name 'cre*' ! -name '*.tar.gz' | head -1) cre 2>/dev/null || true
    chmod +x cre
  fi" < /dev/null

# The workflows import backend/src/evidence and cre/shared, so both travel.
ssh -o BatchMode=yes $H "docker run --rm -v $W:/w --entrypoint sh $BUN_IMAGE -c 'rm -rf /w/repo/cre /w/repo/backend'" < /dev/null
tar -C "$ROOT" -czf - --exclude=node_modules --exclude='.cre_build_tmp.*' cre backend/src/evidence \
  | ssh -o BatchMode=yes $H "mkdir -p $W/repo && tar -C $W/repo -xzf -"

# The Bun image carries no root certificates, so the CLI gets the host's,
# read-only, plus the simulation API's certificate while cre-sim.sh is up.
run() {
  ssh -o BatchMode=yes $H "ENV=; [ -f ~/.karwan-cre-env ] && ENV='--env-file /home/ubuntu/.karwan-cre-env'
    CA=/etc/ssl/certs/ca-certificates.crt; [ -f /tmp/karwan-cre-sim/tls/ca-bundle.crt ] && CA=/tmp/karwan-cre-sim/tls/ca-bundle.crt
    [ -f /tmp/karwan-cre-sim/sim.env ] && ENV=\"\$ENV --env-file /tmp/karwan-cre-sim/sim.env\"
    docker run --rm --network host \$ENV -v \$CA:/etc/ssl/certs/ca-certificates.crt:ro -v $W:/w -w /w/repo/cre --entrypoint sh $BUN_IMAGE -c $(printf '%q' "$1")" < /dev/null
}

# A terminal end to end, for `cre workflow delete`, which asks for the name.
run_tty() {
  ssh -t $H "ENV=; [ -f ~/.karwan-cre-env ] && ENV='--env-file /home/ubuntu/.karwan-cre-env'
    docker run --rm -it --network host \$ENV -v /etc/ssl/certs/ca-certificates.crt:/etc/ssl/certs/ca-certificates.crt:ro -v $W:/w -w /w/repo/cre --entrypoint sh $BUN_IMAGE -c $(printf '%q' "$1")"
}

case "${1:-}" in
  simulate)
    DIR=$2
    shift 2
    ARGS=$(printf '%q ' "$@")
    run "for d in shared $DIR; do [ -f \$d/package.json ] && (cd \$d && bun install --frozen-lockfile >/dev/null); done
      /w/bin/cre workflow simulate $DIR $ARGS"
    ;;
  exec)
    shift
    [ "${1:-}" = "--" ] && shift
    run "$(printf '%q ' "$@")"
    ;;
  tty)
    shift
    [ "${1:-}" = "--" ] && shift
    run_tty "$(printf '%q ' "$@")"
    ;;
  *)
    echo "usage: $0 simulate <workflow-dir> <cre args...> | exec -- <cmd> | tty -- <cmd> | --clean" >&2
    exit 2
    ;;
esac
