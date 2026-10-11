#!/usr/bin/env bash
# Run Foundry on node-services in a throwaway workspace, never on the laptop.
#   scripts/ops/forge-remote.sh test --match-path 'test/suite/*'
#   scripts/ops/forge-remote.sh --slither
#   scripts/ops/forge-remote.sh --arc test/suite/arc
#   scripts/ops/forge-remote.sh --clean
set -euo pipefail
H=node-services
# Images are pinned by digest, so a moved tag cannot change what runs.
FOUNDRY_IMAGE=ghcr.io/foundry-rs/foundry:v1.7.1@sha256:8347b728d5d393dac1c018691b36f506d23b9dcd78341d40ea0fcb11c3a19cdd
TOOLBOX_IMAGE=trailofbits/eth-security-toolbox@sha256:365282b8d03ab03f387fefadbcf3858e82d967597e90a17cf4879b3efb475764
ARC_FOUNDRY=v0.8.0-2
ARC_TARBALL=arc-foundry-$ARC_FOUNDRY-x86_64-unknown-linux-gnu.tar.gz
# Recorded on 2026-10-11 from the release; checked here, never re-fetched.
ARC_TARBALL_SHA256=088bdb96a84418b757f9825d491e702792f1d1d1e29a9145af305a6600a79556
# Arc testnet seeds the blocklisted test address; a blank local Arc node does not.
# The fork is pinned to one block so the pack does not depend on live state.
ARC_TESTNET_RPC=https://rpc.testnet.arc.network
ARC_FORK_BLOCK=66719638
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
    ssh -o BatchMode=yes $H "set -e; mkdir -p $W/arc; cd $W/arc
      if [ ! -x forge ]; then
        curl -sSfLO https://github.com/circlefin/arc-foundry/releases/download/$ARC_FOUNDRY/$ARC_TARBALL
        echo '$ARC_TARBALL_SHA256  $ARC_TARBALL' | sha256sum -c
        tar -xzf $ARC_TARBALL
      fi" < /dev/null
    # Arc's binaries need glibc 2.39, newer than any image on node-services, so
    # they run on the host inside the throwaway workspace, checked by the pinned hash.
    ssh -o BatchMode=yes $H "cd $W/c
      ../arc/anvil --network arc --fork-url $ARC_TESTNET_RPC --fork-block-number $ARC_FORK_BLOCK --port 8547 > ../arc/anvil.log 2>&1 & A=\$!
      for i in \$(seq 60); do ../arc/cast block-number --rpc-url http://127.0.0.1:8547 >/dev/null 2>&1 && break; sleep 1; done
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
