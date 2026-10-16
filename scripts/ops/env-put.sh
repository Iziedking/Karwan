#!/usr/bin/env bash
# Set one NAME=value line in an env file on the host it runs on, without the
# value reaching a terminal, a command line or shell history. Copy it to the
# host and run it over `ssh -t`.
#   env-put.sh FILE NAME --prompt     type the value, hidden, twice
#   env-put.sh FILE NAME --generate   a fresh secret, 0x + 64 hex
#   env-put.sh FILE NAME --new-key    a fresh Ethereum key; prints only its address
#   env-put.sh FILE NAME --stdin      the value from a pipe (another host's --get)
#   env-put.sh FILE NAME --set VALUE  a value that is not secret (an address, a flag)
#   env-put.sh FILE NAME --get        the value to stdout, only for a pipe
#   env-put.sh FILE NAME --check      whether NAME is set, never the value
# The file keeps its inode and mode, so bind mounts and readers of it still work.
set -euo pipefail
umask 077
FOUNDRY_IMAGE=ghcr.io/foundry-rs/foundry:v1.7.1@sha256:8347b728d5d393dac1c018691b36f506d23b9dcd78341d40ea0fcb11c3a19cdd

usage() { sed -n '2,12p' "$0" >&2; exit 2; }
[ $# -ge 3 ] || usage
FILE=$1 NAME=$2 MODE=$3
[[ $NAME =~ ^[A-Z][A-Z0-9_]*$ ]] || { echo "bad name: $NAME" >&2; exit 2; }
# A new file is created mode 600; an existing file keeps its mode and owner.
[ -e "$FILE" ] || { : > "$FILE"; chmod 600 "$FILE"; }

current() { awk -v n="$NAME" 'index($0, n "=") == 1 { v = substr($0, length(n) + 2) } END { printf "%s", v }' "$FILE"; }

put() {
  local v=$1 tmp
  [ -n "$v" ] || { echo "empty value, nothing written" >&2; exit 1; }
  [[ $v != *$'\n'* && $v != *$'\r'* ]] || { echo "the value has a line break" >&2; exit 1; }
  tmp=$(mktemp)
  V="$v" awk -v n="$NAME" 'index($0, n "=") != 1 { print } END { print n "=" ENVIRON["V"] }' "$FILE" > "$tmp"
  cat "$tmp" > "$FILE"
  rm -f "$tmp"
  echo "$NAME set in $FILE" >&2
}

case "$MODE" in
  --prompt)
    read -rs -p "$NAME (hidden): " a < /dev/tty; echo > /dev/tty
    read -rs -p "$NAME again: " b < /dev/tty; echo > /dev/tty
    [ "$a" = "$b" ] || { echo "the two entries differ, nothing written" >&2; exit 1; }
    put "$a"
    ;;
  --generate)
    put "0x$(openssl rand -hex 32)"
    ;;
  --new-key)
    json=$(docker run --rm --entrypoint cast "$FOUNDRY_IMAGE" wallet new --json | tr -d ' \n\r\t')
    key=$(printf '%s' "$json" | sed -n 's/.*"private_key":"\(0x[0-9a-fA-F]\{64\}\)".*/\1/p')
    addr=$(printf '%s' "$json" | sed -n 's/.*"address":"\(0x[0-9a-fA-F]\{40\}\)".*/\1/p')
    unset json
    [ -n "$key" ] && [ -n "$addr" ] || { echo "could not read the new key" >&2; exit 1; }
    put "$key"
    unset key
    echo "$NAME address: $addr"
    ;;
  --stdin)
    put "$(tr -d '\r\n')"
    ;;
  --set)
    [ $# -eq 4 ] || usage
    put "$4"
    ;;
  --get)
    [ ! -t 1 ] || { echo "refusing to print a secret to a terminal; pipe it to another host" >&2; exit 1; }
    v=$(current)
    [ -n "$v" ] || { echo "$NAME is not set in $FILE" >&2; exit 1; }
    printf '%s\n' "$v"
    ;;
  --check)
    v=$(current)
    if [ -n "$v" ]; then echo "$NAME is set (${#v} characters)"; else echo "$NAME is not set"; exit 1; fi
    ;;
  *) usage ;;
esac
