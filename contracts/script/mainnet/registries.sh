#!/usr/bin/env bash
# Stage A on Arc mainnet: a 2-of-3 Safe, then KarwanReputation and
# KarwanBusinessRegistry owned by it. Run each step in order; every step checks
# its result on-chain before you move on. Nothing here reads or prints a key.
#
# Needs: foundry (cast, forge), an SSH tunnel to Karwan's own node in another
# terminal:  ssh -N -L 8545:172.31.45.166:8545 node-services
#
# Env:
#   RPC                 default http://127.0.0.1:8545
#   DEPLOYER_ACCOUNT    Foundry keystore name, default karwan-mainnet-deployer
#   OWNERS              the three Safe owners, comma separated (step create-safe)
#
# Steps:
#   check          chain is Arc mainnet, Safe contracts exist, deployer has gas
#   create-safe    deploy the 2-of-3 Safe; writes deployments/safe-5042.json
#   deploy         simulate, then broadcast DeployRegistries with the Safe as owner
#   accept-hash    print the Safe transaction every owner signs (Reputation.acceptOwnership)
#   sign ACCOUNT [HASH]  one owner signs; with HASH it works offline, no node needed
#   from-wallet ADDR SIG  turn a wallet's personal_sign of the hash into the Safe's form
#   accept A:SIG B:SIG   execute acceptOwnership from the Safe with two owner signatures
#   verify         check owners, pending owner, backfill lock and reviewer on-chain
set -euo pipefail
cd "$(dirname "$0")/../.."

RPC="${RPC:-http://127.0.0.1:8545}"
ACCOUNT="${DEPLOYER_ACCOUNT:-karwan-mainnet-deployer}"
# CHAIN=5042002 with RPC=https://rpc.testnet.arc.network rehearses the whole
# sequence on Arc testnet first. Anything else is refused.
CHAIN="${CHAIN:-5042}"
case "$CHAIN" in 5042|5042002) ;; *) echo "STOP: CHAIN must be 5042 or 5042002" >&2; exit 1 ;; esac
ZERO=0x0000000000000000000000000000000000000000
# Canonical Safe v1.4.1 (checked on chains 5042 and 5042002 on 2026-09-25).
FACTORY=0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67
SINGLETON=0x29fcB43b46531BcA003ddC8FCB67FFE91900C762
FALLBACK=0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99
SAFE_FILE=deployments/safe-$CHAIN.json
REG_FILE=deployments/registries-$CHAIN.json

die() { echo "STOP: $*" >&2; exit 1; }
json() { python -c "import json,sys;print(json.load(open('$1'))['$2'])"; }
# cast prints the password prompt and a newline; keep only the address, and ask
# for the password once per run. DEPLOYER_ADDRESS skips the prompt entirely.
DEPLOYER_CACHE="${DEPLOYER_ADDRESS:-}"
deployer() {
  if [ -z "$DEPLOYER_CACHE" ]; then
    DEPLOYER_CACHE=$(cast wallet address --account "$ACCOUNT" | grep -oE '0x[0-9a-fA-F]{40}' | head -1)
    [ -n "$DEPLOYER_CACHE" ] || die "could not read the deployer address from keystore $ACCOUNT"
  fi
  echo "$DEPLOYER_CACHE"
}
safe() { [ -f "$SAFE_FILE" ] || die "no $SAFE_FILE yet, run create-safe"; json "$SAFE_FILE" address; }
rep() { [ -f "$REG_FILE" ] || die "no $REG_FILE yet, run deploy"; json "$REG_FILE" reputation; }
lower() { tr '[:upper:]' '[:lower:]'; }

check_chain() {
  local id; id=$(cast chain-id --rpc-url "$RPC") || die "cannot reach $RPC (is the SSH tunnel open?)"
  [ "$id" = "$CHAIN" ] || die "RPC is chain $id, not Arc mainnet ($CHAIN)"
}

cmd_check() {
  check_chain
  for a in $FACTORY $SINGLETON $FALLBACK; do
    [ "$(cast code $a --rpc-url "$RPC")" != "0x" ] || die "Safe contract $a is missing on chain $CHAIN"
  done
  deployer >/dev/null
  local d bal; d=$DEPLOYER_CACHE
  bal=$(cast balance "$d" --ether --rpc-url "$RPC") || die "could not read the balance of $d"
  echo "Deployer:  $d"
  echo "Balance:   $bal USDC (Arc gas is USDC; about 5 is plenty)"
  python -c "import sys; sys.exit(0 if float('$bal') > 0 else 1)" || die "the deployer has no USDC for gas yet"
  echo "OK: chain $CHAIN, Safe v1.4.1 present, deployer funded."
}

cmd_create_safe() {
  check_chain
  [ -n "${OWNERS:-}" ] || die "set OWNERS=0xA,0xB,0xC"
  IFS=',' read -r -a o <<< "$OWNERS"
  [ "${#o[@]}" = 3 ] || die "OWNERS needs exactly three addresses"
  [ -f "$SAFE_FILE" ] && die "$SAFE_FILE exists; a Safe was already created"
  local init salt addr d
  init=$(cast calldata "setup(address[],uint256,address,bytes,address,address,uint256,address)" \
    "[${o[0]},${o[1]},${o[2]}]" 2 $ZERO 0x $FALLBACK $ZERO 0 $ZERO)
  salt=$(date +%s)
  deployer >/dev/null; d=$DEPLOYER_CACHE
  addr=$(cast call $FACTORY "createProxyWithNonce(address,bytes,uint256)(address)" $SINGLETON "$init" "$salt" \
    --from "$d" --rpc-url "$RPC")
  echo "Safe will be: $addr (2 of ${o[0]}, ${o[1]}, ${o[2]})"
  read -r -p "Create it? type yes: " ok; [ "$ok" = yes ] || die "cancelled"
  cast send $FACTORY "createProxyWithNonce(address,bytes,uint256)" $SINGLETON "$init" "$salt" \
    --account "$ACCOUNT" --rpc-url "$RPC" >/dev/null
  [ "$(cast call "$addr" "getThreshold()(uint256)" --rpc-url "$RPC")" = 2 ] || die "Safe not found at $addr after the transaction"
  mkdir -p deployments
  printf '{"address":"%s","owners":["%s","%s","%s"],"threshold":2,"salt":"%s","chainId":%s}\n' \
    "$addr" "${o[0]}" "${o[1]}" "${o[2]}" "$salt" $CHAIN > "$SAFE_FILE"
  echo "OK: Safe $addr, owners $(cast call "$addr" "getOwners()(address[])" --rpc-url "$RPC"), threshold 2."
}

cmd_deploy() {
  check_chain
  local s d; s=$(safe); deployer >/dev/null; d=$DEPLOYER_CACHE
  export EXPECTED_CHAIN_ID=$CHAIN REGISTRY_OWNER=$s BUSINESS_REVIEWER_ADDR=$s SECURITY_COUNCIL=$s
  echo "Simulating (no transactions)..."
  forge script script/DeployRegistries.s.sol:DeployRegistries --rpc-url "$RPC" --account "$ACCOUNT" --sender "$d"
  read -r -p "Simulation passed. Broadcast to Arc mainnet? type yes: " ok; [ "$ok" = yes ] || die "cancelled"
  forge script script/DeployRegistries.s.sol:DeployRegistries --rpc-url "$RPC" --account "$ACCOUNT" --sender "$d" --broadcast
  echo "OK: manifest $REG_FILE. Next: accept-hash, then two owners sign, then accept."
}

safe_tx_hash() {
  local s r data nonce
  s=$(safe); r=$(rep); data=$(cast calldata "acceptOwnership()")
  nonce=$(cast call "$s" "nonce()(uint256)" --rpc-url "$RPC")
  cast call "$s" \
    "getTransactionHash(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,uint256)(bytes32)" \
    "$r" 0 "$data" 0 0 0 0 $ZERO $ZERO "$nonce" --rpc-url "$RPC"
}

cmd_accept_hash() {
  check_chain
  echo "Safe transaction: KarwanReputation($(rep)).acceptOwnership(), Safe nonce $(cast call "$(safe)" "nonce()(uint256)" --rpc-url "$RPC")"
  echo "Hash: $(safe_tx_hash)"
}

cmd_sign() {
  local acct="${1:-}"; [ -n "$acct" ] || die "usage: sign <owner keystore name> [hash]"
  # With a hash from accept-hash, an owner signs offline on their own machine:
  # no RPC, no tunnel, no copy of this repo's state needed.
  local h addr sig
  if [ -n "${2:-}" ]; then
    [[ "$2" =~ ^0x[0-9a-fA-F]{64}$ ]] || die "the hash must be 0x followed by 64 hex characters"
    h=$2
  else
    check_chain; h=$(safe_tx_hash)
  fi
  addr=$(cast wallet address --account "$acct" | grep -oE '0x[0-9a-fA-F]{40}' | head -1)
  sig=$(cast wallet sign --no-hash --account "$acct" "$h" | grep -oE '0x[0-9a-fA-F]{130}' | head -1)
  [ -n "$addr" ] && [ -n "$sig" ] || die "could not sign with keystore $acct" 
  echo "Give this line to whoever runs accept:"
  echo "$addr:$sig"
}

# A browser or key-manager wallet signs the hash with personal_sign, which
# prefixes it; the Safe accepts that form when v is raised by 4. The key never
# leaves the wallet.
cmd_from_wallet() {
  [ $# = 2 ] || die "usage: from-wallet <owner address> <personal_sign signature>"
  local addr=$1 sig=$2 v
  [[ "$addr" =~ ^0x[0-9a-fA-F]{40}$ ]] || die "not an address: $addr"
  [[ "$sig" =~ ^0x[0-9a-fA-F]{130}$ ]] || die "a signature is 0x followed by 130 hex characters"
  v=$((16#${sig: -2}))
  [ $v -lt 27 ] && v=$((v + 27))
  [ $v = 27 ] || [ $v = 28 ] || die "unexpected signature v=$v"
  printf '%s:%s%02x
' "$addr" "${sig:0:130}" $((v + 4))
}

cmd_accept() {
  check_chain
  [ $# = 2 ] || die "usage: accept <address:signature> <address:signature>"
  local s r data a b sa sb sigs
  s=$(safe); r=$(rep); data=$(cast calldata "acceptOwnership()")
  a=${1%%:*}; sa=${1#*:}; b=${2%%:*}; sb=${2#*:}
  for x in "$a" "$b"; do
    [ "$(cast call "$s" "isOwner(address)(bool)" "$x" --rpc-url "$RPC")" = true ] || die "$x is not a Safe owner"
  done
  [ "$(echo "$a" | lower)" != "$(echo "$b" | lower)" ] || die "both signatures are from the same owner"
  # The Safe wants signatures in ascending signer order; it rejects any
  # signature that does not match its stated owner.
  if [[ "$(echo "$a" | lower)" < "$(echo "$b" | lower)" ]]; then sigs="$sa${sb#0x}"; else sigs="$sb${sa#0x}"; fi
  echo "Executing acceptOwnership from the Safe, signed by $a and $b"
  cast send "$s"     "execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes)"     "$r" 0 "$data" 0 0 0 0 $ZERO $ZERO "$sigs" --account "$ACCOUNT" --rpc-url "$RPC" >/dev/null
  cmd_verify
}

cmd_verify() {
  check_chain
  local s r b fail=0
  s=$(safe); r=$(rep); b=$(json "$REG_FILE" businessRegistry)
  want() { if [ "$(echo "$2" | lower)" = "$(echo "$3" | lower)" ]; then echo "ok   $1"; else echo "FAIL $1: $2 (want $3)"; fail=1; fi; }
  want "Reputation owner is the Safe" "$(cast call "$r" "owner()(address)" --rpc-url "$RPC")" "$s"
  want "Reputation has no pending owner" "$(cast call "$r" "pendingOwner()(address)" --rpc-url "$RPC")" "$ZERO"
  want "Reputation backfill locked" "$(cast call "$r" "backfillLocked()(bool)" --rpc-url "$RPC")" "true"
  want "Business registry owner is the Safe" "$(cast call "$b" "owner()(address)" --rpc-url "$RPC")" "$s"
  want "Business reviewer is the Safe" "$(cast call "$b" "reviewer()(address)" --rpc-url "$RPC")" "$s"
  want "Safe threshold" "$(cast call "$s" "getThreshold()(uint256)" --rpc-url "$RPC")" "2"
  want "Reputation code matches the manifest" "$(cast keccak "$(cast code "$r" --rpc-url "$RPC")")" "$(json "$REG_FILE" reputationCodehash)"
  want "Business registry code matches the manifest" "$(cast keccak "$(cast code "$b" --rpc-url "$RPC")")" "$(json "$REG_FILE" businessRegistryCodehash)"
  [ $fail = 0 ] && echo "OK: Stage A is live on Arc mainnet. Reputation $r, BusinessRegistry $b, Safe $s." || die "a check failed; do not announce"
}

case "${1:-}" in
  check) cmd_check ;;
  create-safe) cmd_create_safe ;;
  deploy) cmd_deploy ;;
  accept-hash) cmd_accept_hash ;;
  sign) shift; cmd_sign "$@" ;;
  from-wallet) shift; cmd_from_wallet "$@" ;;
  accept) shift; cmd_accept "$@" ;;
  verify) cmd_verify ;;
  *) sed -n '2,25p' "$0"; exit 1 ;;
esac
