#!/usr/bin/env bash
# A fork of Arc Testnet on node-services for CRE simulations, pinned to one
# block so a run does not depend on live state.
#   scripts/ops/arc-fork.sh up      start it (idempotent)
#   scripts/ops/arc-fork.sh url     the RPC URL as seen from node-services
#   scripts/ops/arc-fork.sh exec -- <cmd>   run Arc's cast/forge in the fork workspace
#   scripts/ops/arc-fork.sh down    stop it and remove the workspace
set -euo pipefail
H=node-services
ARC_FOUNDRY=v0.8.0-2
ARC_TARBALL=arc-foundry-$ARC_FOUNDRY-x86_64-unknown-linux-gnu.tar.gz
# Same release and hash as forge-remote.sh, recorded on 2026-10-11.
ARC_TARBALL_SHA256=088bdb96a84418b757f9825d491e702792f1d1d1e29a9145af305a6600a79556
ARC_TESTNET_RPC=https://rpc.testnet.arc.network
ARC_FORK_BLOCK=${ARC_FORK_BLOCK:-66719638}
PORT=8548
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
  down)
    ssh -o BatchMode=yes $H "if [ -f $W/anvil.pid ]; then kill \$(cat $W/anvil.pid) 2>/dev/null || true; fi; rm -rf $W" < /dev/null
    ;;
  *)
    echo "usage: $0 up|url|sync|exec -- <cmd>|down" >&2
    exit 2
    ;;
esac
