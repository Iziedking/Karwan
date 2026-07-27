#!/usr/bin/env bash
# Resolve a disputed deal through the arbiter Safe.
#
# The escrow's arbiter is a 2-of-3 Safe, so resolve() cannot be sent from one
# key. Two owners sign the same Safe transaction hash off-chain, then anyone
# broadcasts it. Arc Testnet is not covered by the Safe web app, which is why
# this exists.
#
#   ./arbiter-resolve.sh hash <jobId> <sellerBps> <rulingHash>
#       Prints the digest each owner signs, plus the sign command.
#
#   ./arbiter-resolve.sh exec <jobId> <sellerBps> <rulingHash> <sig1> <sig2>
#       Broadcasts once you have two signatures.
#
# sellerBps is the seller's share of the unreleased funds, 0-10000. The
# reputation contract bands it: >=8000 Success, <=2000 Failed, else
# DisputeResolved. rulingHash is a bytes32 reference to the written ruling.
set -euo pipefail

RPC="${ARC_RPC:-https://rpc.testnet.arc.network}"
ESCROW="${KARWAN_ESCROW_ADDR:-0x0262A4dFec0E057cAf80F124BfD2847581E82B63}"
SAFE="${KARWAN_ARBITER_SAFE:-0x31eb50b81758c1fB75410C9eCd03B866BdDC342f}"

MODE="${1:?usage: hash|exec}"
JOB_ID="${2:?jobId (bytes32)}"
SELLER_BPS="${3:?sellerBps 0-10000}"
RULING="${4:?rulingHash (bytes32)}"

DATA=$(cast calldata "resolve(bytes32,uint16,bytes32)" "$JOB_ID" "$SELLER_BPS" "$RULING")
NONCE=$(cast call "$SAFE" "nonce()(uint256)" --rpc-url "$RPC" | awk '{print $1}')
ZERO=0x0000000000000000000000000000000000000000

# operation 0 = CALL. safeTxGas/baseGas/gasPrice 0 and no gas token: the
# broadcaster pays gas directly, no Safe-level refund accounting.
TXHASH=$(cast call "$SAFE" \
  "getTransactionHash(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,uint256)(bytes32)" \
  "$ESCROW" 0 "$DATA" 0 0 0 0 "$ZERO" "$ZERO" "$NONCE" --rpc-url "$RPC" | awk '{print $1}')

if [ "$MODE" = "hash" ]; then
  cat <<EOF
escrow      $ESCROW
safe        $SAFE
safe nonce  $NONCE
jobId       $JOB_ID
sellerBps   $SELLER_BPS  (seller keeps this share of the unreleased funds)

SIGN THIS   $TXHASH

Each of two owners runs, with their own key:

  cast wallet sign --no-hash $TXHASH --private-key \$KEY

--no-hash matters: getTransactionHash already returns the EIP-712 digest, so
signing it raw yields v=27/28, which the Safe accepts. Hashing it again
produces a signature the Safe rejects.

Then, with both signatures:

  ./arbiter-resolve.sh exec $JOB_ID $SELLER_BPS $RULING <sig1> <sig2>
EOF
  exit 0
fi

[ "$MODE" = "exec" ] || { echo "unknown mode: $MODE" >&2; exit 1; }
SIG1="${5:?signature from owner 1}"
SIG2="${6:?signature from owner 2}"

# The Safe requires signatures concatenated in ASCENDING signer address order.
# Pass them in that order; this only strips the 0x and joins them.
SIGS="0x${SIG1#0x}${SIG2#0x}"

echo "broadcasting resolve($JOB_ID, $SELLER_BPS) via safe $SAFE"
cast send "$SAFE" \
  "execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes)" \
  "$ESCROW" 0 "$DATA" 0 0 0 0 "$ZERO" "$ZERO" "$SIGS" \
  --rpc-url "$RPC" --private-key "${DEPLOYER_PRIVATE_KEY:?set DEPLOYER_PRIVATE_KEY to broadcast}"

echo
echo "escrow state after (3 = Settled):"
cast call "$ESCROW" "escrows(bytes32)" "$JOB_ID" --rpc-url "$RPC" | head -1
