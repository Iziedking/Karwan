#!/usr/bin/env bash
# Set the Karwan agent's settings on karwan-vm, one prompt per key.
#
#   bash scripts/ops/chat-env.sh testnet     # karwan-api, /home/ubuntu/karwan/.env
#   bash scripts/ops/chat-env.sh mainnet     # karwan-api-mainnet, /home/ubuntu/karwan/.env.mainnet
#
# Press Enter at a prompt to keep what is there. Secrets are typed without
# echo and travel to the server on stdin; nothing prints a value. The env file
# is backed up first, and the container is recreated only when you say so.
set -euo pipefail

HOST="${KARWAN_HOST:-karwan-vm}"
DIR=/home/ubuntu/karwan
HERE="$(cd "$(dirname "$0")" && pwd)"

case "${1:-}" in
  testnet) FILE=.env;         SERVICE=karwan-api ;;
  mainnet) FILE=.env.mainnet; SERVICE=karwan-api-mainnet ;;
  *) echo "usage: bash scripts/ops/chat-env.sh testnet|mainnet" >&2; exit 1 ;;
esac
NET="$1"

remote() { ssh -o BatchMode=yes "$HOST" "cd $DIR && python3 .envfile.py $*"; }
status() { remote status "$FILE" "$1" < /dev/null; }
set_value() { printf '%s' "$2" | remote set "$FILE" "$1"; }

ssh -o BatchMode=yes "$HOST" "cat > $DIR/.envfile.py" < "$HERE/envfile.py"
trap 'ssh -o BatchMode=yes "$HOST" "rm -f $DIR/.envfile.py" < /dev/null || true' EXIT

stamp=$(date +%Y%m%d%H%M%S)
ssh -o BatchMode=yes "$HOST" "cd $DIR && cp -p $FILE $FILE.bak-$stamp" < /dev/null
echo "Backed up $FILE to $FILE.bak-$stamp on $HOST."
echo

changed=0

# A fixed value: shown, applied on yes.
fixed() {
  local key=$1 value=$2 now
  now=$(status "$key")
  read -r -p "$key=$value (now $now). Set it? [Y/n] " answer
  if [[ "${answer:-y}" =~ ^[Yy]$ ]]; then set_value "$key" "$value"; changed=1; fi
}

# A value you type. Secrets are read without echo; addresses are checked.
ask() {
  local key=$1 kind=$2 now value
  now=$(status "$key")
  if [ "$kind" = secret ]; then
    read -r -s -p "$key (now $now, Enter keeps it): " value; echo
  else
    read -r -p "$key (now $now, Enter keeps it): " value
  fi
  [ -z "$value" ] && return 0
  if [ "$kind" = address ] && ! [[ "$value" =~ ^0x[0-9a-fA-F]{40}$ ]]; then
    echo "  Not an address (0x and 40 hex characters). Skipped."; return 0
  fi
  set_value "$key" "$value"; changed=1
}

# The pepper hashes chat ids. Replacing it orphans every chat account, so an
# existing one is never touched; a missing one is generated on the server.
pepper() {
  local result
  result=$(remote set-random "$FILE" CHAT_NUMBER_PEPPER < /dev/null)
  if [ "$result" = generated ]; then
    changed=1
    echo "CHAT_NUMBER_PEPPER generated on the server. Back up $DIR/$FILE with the database: losing it orphans every chat account."
  else
    echo "CHAT_NUMBER_PEPPER already set. Kept, never replaced."
  fi
}

# Must stay unset on mainnet: offered for removal when present.
must_be_unset() {
  local key=$1
  if [ "$(status "$key")" = set ]; then
    read -r -p "$key is set but must be unset on mainnet. Remove it? [Y/n] " answer
    if [[ "${answer:-y}" =~ ^[Yy]$ ]]; then remote remove "$FILE" "$key" < /dev/null; changed=1; fi
  fi
}

if [ "$NET" = testnet ]; then
  echo "Testnet: the Karwan agent on the existing bot (TELEGRAM_BOT_TOKEN and TELEGRAM_BOT_USERNAME are already set)."
  fixed TELEGRAM_AGENT_ENABLED true
  pepper
  echo "Optional, only after DeployFacts on testnet:"
  ask KARWAN_FACTS_ADDR address
  ask FACTS_ISSUER_WALLET_ID text
else
  echo "Mainnet. Set these only once the mainnet bot exists, DeploySuite and DeployFacts are done,"
  echo "the Safe has accepted ownership, and the frontend with mainnet deal pages is deployed."
  echo
  echo "Telegram (a new bot from BotFather; the testnet bot cannot be shared):"
  read -r -s -p "TELEGRAM_BOT_TOKEN (now $(status TELEGRAM_BOT_TOKEN), Enter keeps it): " token; echo
  if [ -n "$token" ]; then
    reused=$(printf '%s' "$token" | ssh -o BatchMode=yes "$HOST" "cd $DIR && python3 .envfile.py same .env TELEGRAM_BOT_TOKEN")
    if [ "$reused" = same ]; then
      echo "  That is the testnet bot's token. Both backends would poll it. Not set."
    else
      set_value TELEGRAM_BOT_TOKEN "$token"; changed=1
    fi
  fi
  unset token
  ask TELEGRAM_BOT_USERNAME text
  fixed TELEGRAM_AGENT_ENABLED true
  pepper
  echo
  echo "Chat accounts and the escrow beta:"
  fixed CHAT_CUSTODY_ENABLED true
  fixed VERIFIED_NETWORK_ONLY true
  fixed DEAL_REVIEW_WINDOW_MS 259200000
  ask KARWAN_DEAL_ESCROW_ADDR address
  ask KARWAN_STAKE_VAULT_ADDR address
  if [ "$(status KARWAN_DEAL_ESCROW_ADDR)" = set ] && [ "$(status KARWAN_STAKE_VAULT_ADDR)" = set ]; then
    fixed DEAL_ESCROW_V3_ENABLED true
  else
    echo "DEAL_ESCROW_V3_ENABLED left alone: it needs both escrow and vault addresses."
  fi
  ask KARWAN_FACTS_ADDR address
  ask FACTS_ISSUER_WALLET_ID text
  echo
  echo "World ID (the person check):"
  fixed WORLD_ID_ENABLED true
  fixed WORLD_ID_ENVIRONMENT production
  ask WORLD_ID_APP_ID text
  ask WORLD_ID_RP_ID text
  ask WORLD_ID_ACTION text
  ask WORLD_ID_SIGNING_KEY secret
  echo
  must_be_unset AGENT_SEED_PRIVATE_KEY
  must_be_unset X402_AGENT_QUERIES
  must_be_unset X402_PAID_SIGNALS_ENABLED
fi

echo
if [ "$changed" = 0 ]; then
  echo "Nothing changed."
  exit 0
fi
read -r -p "Recreate $SERVICE now so it loads the new values? [y/N] " go
if [[ "${go:-n}" =~ ^[Yy]$ ]]; then
  ssh -o BatchMode=yes "$HOST" "cd $DIR && docker compose up -d --no-deps $SERVICE" < /dev/null
  sleep 5
  echo
  echo "What $SERVICE now has (set or not, never the value):"
  ssh -o BatchMode=yes "$HOST" "docker exec $SERVICE printenv" < /dev/null \
    | grep -E '^(ARC_NETWORK|TELEGRAM_BOT_TOKEN|TELEGRAM_BOT_USERNAME|TELEGRAM_AGENT_ENABLED|CHAT_NUMBER_PEPPER|CHAT_CUSTODY_ENABLED|VERIFIED_NETWORK_ONLY|DEAL_REVIEW_WINDOW_MS|DEAL_ESCROW_V3_ENABLED|KARWAN_DEAL_ESCROW_ADDR|KARWAN_STAKE_VAULT_ADDR|KARWAN_FACTS_ADDR|FACTS_ISSUER_WALLET_ID|WORLD_ID_ENABLED|WORLD_ID_ENVIRONMENT|AGENT_SEED_PRIVATE_KEY|X402_AGENT_QUERIES|X402_PAID_SIGNALS_ENABLED)=' \
    | sed 's/=.*/=<set>/' | sort
  ssh -o BatchMode=yes "$HOST" "docker logs --since 1m $SERVICE 2>&1 | grep -i -E 'telegram agent|stays off|Invalid environment|Unsafe production' | tail -5" < /dev/null || true
else
  echo "Saved. Recreate later with: ssh $HOST 'cd $DIR && docker compose up -d --no-deps $SERVICE'"
fi
