#!/usr/bin/env bash
# Run Foundry on node-services in a throwaway workspace, never on the laptop.
#   scripts/ops/forge-remote.sh test --match-path 'test/suite/*'
#   scripts/ops/forge-remote.sh --slither
#   scripts/ops/forge-remote.sh --arc test/suite/arc
#   scripts/ops/forge-remote.sh --echidna JobProps [seconds]
#   scripts/ops/forge-remote.sh --medusa JobProps[,TimeProps] [seconds]
#   scripts/ops/forge-remote.sh --halmos SettlementProofs [halmos options]
#   scripts/ops/forge-remote.sh --aderyn
#   scripts/ops/forge-remote.sh --mutate JobDisputeLib 'test/suite/jobs/*'
#   scripts/ops/forge-remote.sh --clean [--force]
set -euo pipefail
H=node-services
# Images are pinned by digest, so a moved tag cannot change what runs.
FOUNDRY_IMAGE=ghcr.io/foundry-rs/foundry:v1.7.1@sha256:8347b728d5d393dac1c018691b36f506d23b9dcd78341d40ea0fcb11c3a19cdd
TOOLBOX_IMAGE=trailofbits/eth-security-toolbox@sha256:365282b8d03ab03f387fefadbcf3858e82d967597e90a17cf4879b3efb475764
# Halmos needs Python 3.11 or later; it runs here with forge copied from the
# Foundry image, and installs only the hashed packages in halmos-requirements.txt.
PYTHON_IMAGE=python@sha256:34386ef0cb081344d7ec1c103ba398e6e9f64e9ab3a1509accc92a4e24a07258
# Aderyn, the second static analyser, from its release, checked against the published hash.
ADERYN_VERSION=0.6.8
ADERYN_TARBALL=aderyn-x86_64-unknown-linux-gnu.tar.xz
ADERYN_TARBALL_SHA256=ffd6ca658962e211a3ac821c646f69c8e14bf1b1001cbfe091bcd4535a691e46
ARC_FOUNDRY=v0.8.0-2
ARC_TARBALL=arc-foundry-$ARC_FOUNDRY-x86_64-unknown-linux-gnu.tar.gz
# Recorded on 2026-10-11 from the release; checked here, never re-fetched.
ARC_TARBALL_SHA256=088bdb96a84418b757f9825d491e702792f1d1d1e29a9145af305a6600a79556
# Arc testnet seeds the blocklisted test address; a blank local Arc node does not.
# The fork is pinned to one block so the pack does not depend on live state.
ARC_TESTNET_RPC=https://rpc.testnet.arc.network
ARC_FORK_BLOCK=66719638
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
# One remote workspace per checkout, so separate checkouts never share files.
STATE="$HOME/.karwan-forge-remote-$(printf '%s' "$ROOT" | cksum | cut -d' ' -f1)"
SSH="ssh -o BatchMode=yes $H"

usage() { sed -n '3,11p' "$0" >&2; exit 64; }
case "${1:-}" in
  --echidna|--medusa|--halmos|--arc) [ -n "${2:-}" ] || usage ;;
  --mutate) [ -n "${2:-}" ] && [ -n "${3:-}" ] || usage ;;
esac

if [ "${1:-}" = "--clean" ]; then
  if [ -f "$STATE" ]; then
    W=$(cat "$STATE")
    if [ "${2:-}" != "--force" ] && $SSH "test -d $W/.busy" < /dev/null; then
      echo "forge-remote: a run holds $W:" >&2
      $SSH "cat $W/.busy/who 2>/dev/null; docker ps --filter label=izie.ws=$W --format '{{.Status}}  {{.Image}}'" < /dev/null >&2 || true
      echo "forge-remote: if it is no longer running, use --clean --force" >&2
      exit 75
    fi
    # Stop what the workspace still runs, then empty it from inside a root
    # container, since the analysers and Halmos write as root.
    $SSH "docker ps -q --filter label=izie.ws=$W | xargs -r docker rm -f > /dev/null; pkill -f '[/]${W#/}/arc/anvil'
      docker run --rm -u 0:0 -v $W:/w --entrypoint sh $TOOLBOX_IMAGE -c 'rm -rf /w/* /w/.[!.]*' 2>/dev/null; rm -rf $W" < /dev/null
  fi
  rm -f "$STATE"
  exit 0
fi

if [ -f "$STATE" ] && $SSH "test -f $(cat "$STATE")/.izie-test-owner" < /dev/null; then
  W=$(cat "$STATE")
else
  W=$($SSH 'd=$(mktemp -d /tmp/izie-build-test.XXXXXXXX); touch $d/.izie-test-owner; echo $d' < /dev/null)
  echo "$W" > "$STATE"
fi
# Every container a run starts carries the workspace's label, so a run that is
# stopped, or whose connection drops, leaves nothing running that a later run
# could collide with.
DR="docker run --rm --label izie.ws=$W"

# One run at a time per workspace: a second run, even from another session in
# the same checkout, stops here instead of replacing the first one's files. A
# container still running from an earlier run keeps the workspace busy.
if ! $SSH "[ -z \"\$(docker ps -q --filter label=izie.ws=$W)\" ] && mkdir $W/.busy 2>/dev/null &&
    echo \"$(hostname) pid $$ since \$(date -u +%FT%TZ)\" > $W/.busy/who" < /dev/null; then
  echo "forge-remote: $W is busy with another run; if none is running, use --clean --force" >&2
  exit 75
fi
release() {
  $SSH "docker ps -q --filter label=izie.ws=$W | xargs -r docker rm -f > /dev/null; pkill -f '[/]${W#/}/arc/anvil'; rm -rf $W/.busy" < /dev/null || true
}
trap release EXIT
trap 'exit 130' INT TERM HUP

$SSH "rm -rf $W/c/src $W/c/test $W/c/script" < /dev/null
tar -C "$ROOT/contracts" -czf - --exclude=out --exclude=cache --exclude=broadcast . \
  | $SSH "mkdir -p $W/c && tar -C $W/c -xzf -"

# The analysers and Halmos run as root; if one stopped early, its build files
# would lock Foundry out of the workspace, so they go first.
$SSH "if find $W/c -maxdepth 1 \\( -name out -o -name cache \\) ! -user \$(id -u) | grep -q .; then
    $DR -u 0:0 -v $W/c:/c --entrypoint rm $TOOLBOX_IMAGE -rf /c/out /c/cache; fi" < /dev/null

# forge from the pinned Foundry image, for the tools whose own images carry another.
pinned_forge() {
  $SSH "mkdir -p $W/tools; [ -x $W/tools/forge ] ||
    $DR -v $W/tools:/t --entrypoint sh $FOUNDRY_IMAGE -c 'cp /usr/local/bin/forge /t/forge'" < /dev/null
}

case "${1:-}" in
  --slither)
    $SSH "$DR --cpus=12 --memory=12g -v $W/c:/c -w /c $TOOLBOX_IMAGE \
      sh -c 'slither . --filter-paths \"lib/|test/|script/|src/Karwan|src/Guardable|src/interfaces\" 2>&1; R=\$?; rm -rf out cache; exit \$R'" < /dev/null
    ;;
  --echidna|--medusa)
    # Both fuzzers build with the fuzz profile, which links the libraries at the
    # fixed addresses their configs deploy them to. Foundry's build files from
    # other runs in the workspace use a newer format, so they go first. Each
    # target's corpus, with Medusa's coverage report and any reproducer, is kept
    # in $W/corpus for coverage work and for replaying a failure.
    T=$(printf '%q' "$2"); SECS=${3:-1800}; TOOL=${1#--}
    if [ "$1" = --echidna ]; then
      RUN="echidna . --contract $T --config echidna.yaml --timeout $SECS"
    else
      RUN="medusa fuzz --config medusa.json --target-contracts $T --timeout $SECS"
    fi
    $SSH "mkdir -p $W/corpus && $DR --cpus=12 --memory=24g -e FOUNDRY_PROFILE=fuzz -v $W/c:/c -v $W/corpus:/keep -w /c $TOOLBOX_IMAGE \
      sh -c 'rm -rf out cache crytic-export corpus; $RUN 2>&1; R=\$?
        rm -rf /keep/$TOOL-$T; if [ -d corpus ]; then mv corpus /keep/$TOOL-$T; fi
        rm -rf out cache crytic-export; exit \$R'" < /dev/null
    ;;
  --mutate)
    # Lists every mutant of the named contract and whether the given tests
    # caught it. Read the survivors from the output: the exit status alone is
    # not the gate.
    C=$(printf '%q' "$2"); P=$3
    pinned_forge
    $SSH "cat > $W/mutate.sh" <<EOF
export PATH=/tools:\$PATH
forge --version
cd /c
rm -rf out cache crytic-export mutation_campaign
slither-mutate . --contract-names $C --test-cmd "forge test --match-path '$P'" --ignore-dirs lib,test,script,out,cache 2>&1
R=\$?
rm -rf out cache crytic-export
exit \$R
EOF
    $SSH "$DR --cpus=12 --memory=24g -v $W/c:/c -v $W/tools:/tools -v $W/mutate.sh:/mutate.sh $TOOLBOX_IMAGE sh /mutate.sh" < /dev/null
    ;;
  --aderyn)
    $SSH "set -e; mkdir -p $W/aderyn; cd $W/aderyn
      if [ ! -x aderyn-x86_64-unknown-linux-gnu/aderyn ]; then
        curl -sSfLO https://github.com/Cyfrin/aderyn/releases/download/aderyn-v$ADERYN_VERSION/$ADERYN_TARBALL
        echo '$ADERYN_TARBALL_SHA256  $ADERYN_TARBALL' | sha256sum -c
        tar -xJf $ADERYN_TARBALL
      fi" < /dev/null
    $SSH "cd $W/c && rm -f ../aderyn/report.md
      ../aderyn/aderyn-x86_64-unknown-linux-gnu/aderyn . --src src/suite -o ../aderyn/report.md > ../aderyn/run.log 2>&1
      R=\$?; [ -f ../aderyn/report.md ] && cat ../aderyn/report.md || tail -40 ../aderyn/run.log; exit \$R" < /dev/null
    ;;
  --halmos)
    T=$(printf '%q' "$2"); shift 2; EXTRA=$(printf '%q ' "$@")
    REQ="$ROOT/scripts/ops/halmos-requirements.txt"
    V=venv-$(cksum < "$REQ" | cut -d' ' -f1)
    pinned_forge
    $SSH "cat > $W/tools/halmos-requirements.txt" < "$REQ"
    $SSH "$DR --cpus=12 --memory=24g -v $W/c:/c -v $W/tools:/tools -w /c -e PATH=/tools/$V/bin:/tools:/usr/local/bin:/usr/bin:/bin $PYTHON_IMAGE \
      sh -c '[ -x /tools/$V/bin/halmos ] || (python -m venv /tools/$V &&
          /tools/$V/bin/pip install -q --disable-pip-version-check --require-hashes --no-deps -r /tools/halmos-requirements.txt)
        rm -rf out cache; halmos --contract $T $EXTRA 2>&1; R=\$?; rm -rf out cache; exit \$R'" < /dev/null
    ;;
  --arc)
    DIR=$(printf '%q' "$2")
    $SSH "set -e; mkdir -p $W/arc; cd $W/arc
      if [ ! -x forge ]; then
        curl -sSfLO https://github.com/circlefin/arc-foundry/releases/download/$ARC_FOUNDRY/$ARC_TARBALL
        echo '$ARC_TARBALL_SHA256  $ARC_TARBALL' | sha256sum -c
        tar -xzf $ARC_TARBALL
      fi" < /dev/null
    # Arc's binaries need glibc 2.39, newer than any image on node-services, so
    # they run on the host inside the throwaway workspace, checked by the pinned hash.
    $SSH "cd $W/c
      $W/arc/anvil --network arc --fork-url $ARC_TESTNET_RPC --fork-block-number $ARC_FORK_BLOCK --port 8547 > ../arc/anvil.log 2>&1 & A=\$!
      for i in \$(seq 60); do ../arc/cast block-number --rpc-url http://127.0.0.1:8547 >/dev/null 2>&1 && break; sleep 1; done
      ARC_FORK=1 ../arc/forge test --fork-url http://127.0.0.1:8547 --match-path $DIR'/*' -vv
      R=\$?
      kill \$A
      exit \$R" < /dev/null
    ;;
  *)
    ARGS=$(printf '%q ' "$@")
    $SSH "$DR --cpus=12 --memory=12g -v $W/c:/c -w /c --entrypoint forge $FOUNDRY_IMAGE $ARGS" < /dev/null
    ;;
esac
