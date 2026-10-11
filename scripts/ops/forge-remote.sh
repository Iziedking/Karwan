#!/usr/bin/env bash
# Run Foundry on node-services in a throwaway workspace, never on the laptop.
#   scripts/ops/forge-remote.sh test --match-path 'test/suite/*'
#   scripts/ops/forge-remote.sh --slither
#   scripts/ops/forge-remote.sh --arc test/suite/arc
#   scripts/ops/forge-remote.sh --clean
set -euo pipefail
H=node-services
FOUNDRY_IMAGE=ghcr.io/foundry-rs/foundry:v1.7.1
TOOLBOX_IMAGE=trailofbits/eth-security-toolbox:latest
ARC_FOUNDRY=v0.8.0-2
ARC_TARBALL=arc-foundry-$ARC_FOUNDRY-x86_64-unknown-linux-gnu.tar.gz
# Arc testnet seeds the blocklisted test address; a blank local Arc node does not.
ARC_TESTNET_RPC=https://rpc.testnet.arc.network
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STATE="$HOME/.karwan-forge-remote"

if [ "${1:-}" = "--clean" ]; then
  if [ -f "$STATE" ]; then
    W=$(cat "$STATE")
    # Slither's container writes as root; remove its files from inside a container first.
    ssh -o BatchMode=yes $H "docker run --rm -v $W:/w --entrypoint sh $FOUNDRY_IMAGE -c 'rm -rf /w/c /w/arc' 2>/dev/null; rm -rf $W" < /dev/null
  fi
  rm -f "$STATE"
  exit 0
fi

if [ -f "$STATE" ] && ssh -o BatchMode=yes $H "test -f $(cat "$STATE")/.izie-test-owner" < /dev/null; then
  W=$(cat "$STATE")
else
  W=$(ssh -o BatchMode=yes $H 'd=$(mktemp -d /tmp/izie-build-test.XXXXXXXX); touch $d/.izie-test-owner; echo $d' < /dev/null)
  echo "$W" > "$STATE"
fi

ssh -o BatchMode=yes $H "rm -rf $W/c/src $W/c/test $W/c/script" < /dev/null
tar -C "$ROOT/contracts" -czf - --exclude=out --exclude=cache --exclude=broadcast . \
  | ssh -o BatchMode=yes $H "mkdir -p $W/c && tar -C $W/c -xzf -"

case "${1:-}" in
  --slither)
    ssh -o BatchMode=yes $H "docker run --rm --cpus=12 --memory=12g -v $W/c:/c -w /c $TOOLBOX_IMAGE \
      sh -c 'slither . --filter-paths \"lib/|test/|script/|src/Karwan|src/Guardable|src/interfaces\" 2>&1; R=\$?; rm -rf out cache; exit \$R'" < /dev/null
    ;;
  --arc)
    DIR=$(printf '%q' "$2")
    ssh -o BatchMode=yes $H "set -e; cd $W; mkdir -p arc; cd arc
      if [ ! -x forge ]; then
        curl -sSfLO https://github.com/circlefin/arc-foundry/releases/download/$ARC_FOUNDRY/$ARC_TARBALL
        curl -sSfLO https://github.com/circlefin/arc-foundry/releases/download/$ARC_FOUNDRY/$ARC_TARBALL.sha256
        sha256sum -c $ARC_TARBALL.sha256
        tar -xzf $ARC_TARBALL
      fi
      ./anvil --network arc --fork-url $ARC_TESTNET_RPC --port 8547 > anvil.log 2>&1 & A=\$!
      sleep 3
      cd ../c
      set +e
      ARC_FORK=1 ../arc/forge test --fork-url http://127.0.0.1:8547 --match-path $DIR'/*' -vv
      R=\$?
      kill \$A
      exit \$R" < /dev/null
    ;;
  *)
    ARGS=$(printf '%q ' "$@")
    ssh -o BatchMode=yes $H "docker run --rm --cpus=12 --memory=12g -v $W/c:/c -w /c --entrypoint forge $FOUNDRY_IMAGE $ARGS" < /dev/null
    ;;
esac
