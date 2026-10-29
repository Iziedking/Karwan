#!/usr/bin/env bash
# A fork of Arc Testnet on node-services for CRE simulations, pinned to one
# block so a run does not depend on live state.
#   scripts/ops/arc-fork.sh up      start it (idempotent)
#   scripts/ops/arc-fork.sh url     the RPC URL as seen from node-services
#   scripts/ops/arc-fork.sh exec -- <cmd>   run Arc's cast/forge in the fork workspace
#   scripts/ops/arc-fork.sh e2e parity|full|guarantee|financing|contest|hourly   the escrow-family path end to end on the fork
#   scripts/ops/arc-fork.sh down    stop it and remove the workspace
set -euo pipefail
H=node-services
ARC_FOUNDRY=v0.8.0-2
ARC_TARBALL=arc-foundry-$ARC_FOUNDRY-x86_64-unknown-linux-gnu.tar.gz
# Same release and hash as forge-remote.sh, recorded on 2026-10-11.
ARC_TARBALL_SHA256=088bdb96a84418b757f9825d491e702792f1d1d1e29a9145af305a6600a79556
ARC_TESTNET_RPC=https://rpc.testnet.arc.io
ARC_FORK_BLOCK=${ARC_FORK_BLOCK:-66719638}
PORT=${ARC_FORK_PORT:-8548}
W=/tmp/karwan-arc-fork

case "${1:-}" in
  up)
    ssh -o BatchMode=yes $H "set -e; mkdir -p $W; cd $W
      if [ ! -x forge ]; then
        curl -sSfLO https://github.com/circlefin/arc-foundry/releases/download/$ARC_FOUNDRY/$ARC_TARBALL
        echo '$ARC_TARBALL_SHA256  $ARC_TARBALL' | sha256sum -c
        tar -xzf $ARC_TARBALL
      fi
      if ! ./cast block-number --rpc-url http://127.0.0.1:$PORT >/dev/null 2>&1; then
        nohup ./anvil --network arc --fork-url $ARC_TESTNET_RPC --fork-block-number $ARC_FORK_BLOCK \
          --chain-id 5042002 --port $PORT > anvil.log 2>&1 &
        echo \$! > anvil.pid
        for i in \$(seq 60); do ./cast block-number --rpc-url http://127.0.0.1:$PORT >/dev/null 2>&1 && break; sleep 1; done
      fi
      ./cast block-number --rpc-url http://127.0.0.1:$PORT" < /dev/null
    ;;
  url)
    echo "http://127.0.0.1:$PORT"
    ;;
  sync)
    # contracts/ into the fork workspace, so Arc's forge can run scripts against the fork
    ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
    ssh -o BatchMode=yes $H "rm -rf $W/c && mkdir -p $W/c" < /dev/null
    tar -C "$ROOT/contracts" -czf - --exclude=out --exclude=cache --exclude=broadcast . \
      | ssh -o BatchMode=yes $H "tar -C $W/c -xzf -"
    ;;
  exec)
    shift
    [ "${1:-}" = "--" ] && shift
    ssh -o BatchMode=yes $H "cd $W && $(printf '%q ' "$@")" < /dev/null
    ;;
  e2e)
    # The escrow-family path end to end against the fork (backend/src/scripts/suite-fork-e2e.ts).
    # A full run reads the role keys as NAME=value lines on stdin, never from a command line.
    PHASE=${2:-parity}
    case "$PHASE" in parity|full|guarantee|financing|contest|hourly) ;; *) echo "usage: $0 e2e parity|full|guarantee|financing|contest|hourly" >&2; exit 2 ;; esac
    ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
    ssh -o BatchMode=yes $H "rm -rf $W/repo && mkdir -p $W/repo /tmp/karwan-npm-cache" < /dev/null
    tar -C "$ROOT" -czf - --exclude=node_modules --exclude=dist --exclude=backend/data --exclude='*.log' \
      package.json package-lock.json backend contracts/deployments \
      | ssh -o BatchMode=yes $H "tar -C $W/repo -xzf -"
    ssh -o BatchMode=yes $H "docker run --rm -i --network host --user \$(id -u):\$(id -g) -e HOME=/tmp \
      -e npm_config_cache=/npm-cache -v /tmp/karwan-npm-cache:/npm-cache -v $W/repo:/repo -w /repo \
      -e FORK_RPC_URL=http://127.0.0.1:$PORT \
      -e KARWAN_JOBBOARD_ADDR=0x0000000000000000000000000000000000000001 \
      -e KARWAN_ESCROW_ADDR=0x0000000000000000000000000000000000000002 \
      -e KARWAN_REPUTATION_ADDR=0x0000000000000000000000000000000000000003 \
      -e KARWAN_VAULT_ADDR=0x0000000000000000000000000000000000000004 \
      -e IDENTITY_REGISTRY_ADDR=0x0000000000000000000000000000000000000005 \
      -e USDC_ADDR=0x3600000000000000000000000000000000000000 \
      node:20-bookworm sh -c 'set -a; . /dev/stdin; set +a; npm ci --no-audit --no-fund --workspace=backend --include-workspace-root >/dev/null && cd backend && npx tsx src/scripts/suite-fork-e2e.ts $PHASE'"
    ;;
  down)
    ssh -o BatchMode=yes $H "if [ -f $W/anvil.pid ]; then kill \$(cat $W/anvil.pid) 2>/dev/null || true; fi; rm -rf $W" < /dev/null
    ;;
  *)
    echo "usage: $0 up|url|sync|exec -- <cmd>|e2e parity|full|down" >&2
    exit 2
    ;;
esac
