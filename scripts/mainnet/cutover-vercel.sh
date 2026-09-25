#!/usr/bin/env bash
# Puts karwan.site on Arc mainnet and keeps testnet.karwan.site on testnet.
#
# Two Vercel projects, one repository:
#   karwan          -> testnet.karwan.site  (NEXT_PUBLIC_ARC_NETWORK unset = testnet)
#   karwan-mainnet  -> karwan.site, www     (NEXT_PUBLIC_ARC_NETWORK=mainnet)
#
# Run from the repository root, one step at a time, checking each result:
#   scripts/mainnet/cutover-vercel.sh create     # new project, Git linked, root frontend
#   scripts/mainnet/cutover-vercel.sh env        # mainnet build variables
#   scripts/mainnet/cutover-vercel.sh deploy     # first production build of karwan-mainnet
#   scripts/mainnet/cutover-vercel.sh domains    # move karwan.site + www to karwan-mainnet
#   scripts/mainnet/cutover-vercel.sh testnet    # testnet project variables, then redeploy it
#   scripts/mainnet/cutover-vercel.sh verify     # what each host now serves
#
# Nothing here prints a secret. The Circle client key is read from
# frontend/.env.local and piped straight into Vercel.
set -euo pipefail

SCOPE=izie-hub
MAINNET=karwan-mainnet
TESTNET=karwan
REPO=Iziedking/Karwan
LINK_DIR="${KARWAN_MAINNET_LINK_DIR:-$HOME/.karwan-mainnet-vercel}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# `vercel api` needs its endpoint left alone by Git Bash, and a body file path
# that Windows Node can open. Everything else keeps normal path conversion.
winpath() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s' "$1"; fi; }
vapi() { MSYS_NO_PATHCONV=1 vercel api "$@"; }

# Stop before touching domains unless karwan-mainnet has a Ready production build.
require_mainnet_ready() {
  vapi "/v9/projects/$MAINNET" --scope "$SCOPE" --raw >/dev/null 2>&1     || { echo "Project $MAINNET does not exist. Run: $0 create" >&2; exit 1; }
  local ready
  ready=$(vapi "/v6/deployments?app=$MAINNET&target=production&state=READY&limit=1" --scope "$SCOPE" --raw 2>/dev/null     | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log((JSON.parse(s).deployments||[]).length)}catch{console.log(0)}})")
  [ "$ready" -ge 1 ] || { echo "$MAINNET has no Ready production build yet. Run: $0 deploy, then wait." >&2; exit 1; }
}

say() { printf '\n== %s\n' "$*"; }

link_mainnet() {
  mkdir -p "$LINK_DIR"
  vercel link --yes --project "$MAINNET" --scope "$SCOPE" --cwd "$LINK_DIR" >/dev/null
}

# Replace a production variable on a project linked in $2 (removing first keeps
# a rerun from failing on "already exists").
put_env() {
  local name=$1 dir=$2 value=$3
  vercel env rm "$name" production --yes --cwd "$dir" >/dev/null 2>&1 || true
  # Every NEXT_PUBLIC_ value is read by the browser, so it is stored as config.
  # The Circle client key is publishable by design and locked to karwan.site in
  # the Circle Console; the CLI asks for the type explicitly because it looks
  # like a credential.
  printf '%s' "$value" | vercel env add "$name" production --type config --cwd "$dir" >/dev/null
  echo "  set $name"
}

case "${1:-}" in
  create)
    say "Create $MAINNET linked to $REPO, root directory frontend"
    body="$TMP/karwan-mainnet-project.json"
    cat >"$body" <<JSON
{"name":"$MAINNET","framework":"nextjs","rootDirectory":"frontend","gitRepository":{"type":"github","repo":"$REPO"}}
JSON
    vapi /v11/projects --scope "$SCOPE" -X POST --input "$(winpath "$body")" --raw >/dev/null
    printf '{"nodeVersion":"24.x"}' >"$body"
    vapi "/v9/projects/$MAINNET" --scope "$SCOPE" -X PATCH --input "$(winpath "$body")" --raw >/dev/null
    link_mainnet
    vercel project inspect "$MAINNET" --scope "$SCOPE"
    ;;

  env)
    say "Mainnet build variables on $MAINNET"
    link_mainnet
    key=$(grep '^NEXT_PUBLIC_CIRCLE_CLIENT_KEY=' frontend/.env.local | cut -d= -f2- | tr -d '\r\n')
    case "$key" in LIVE_*) ;; *) echo "frontend/.env.local has no LIVE_ Circle client key; stopping." >&2; exit 1 ;; esac
    pulled="$TMP/karwan-testnet-prod.env"
    vercel env pull "$pulled" --environment=production --yes --cwd . >/dev/null
    wc=$(grep '^NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=' "$pulled" | cut -d= -f2- | tr -d '"\r\n')
    [ -n "$wc" ] || { echo "No WalletConnect project id on $TESTNET; stopping." >&2; exit 1; }
    put_env NEXT_PUBLIC_ARC_NETWORK "$LINK_DIR" mainnet
    put_env NEXT_PUBLIC_BACKEND_URL "$LINK_DIR" https://mainnet-api.karwan.site
    put_env NEXT_PUBLIC_SITE_URL "$LINK_DIR" https://karwan.site
    put_env NEXT_PUBLIC_CIRCLE_CLIENT_URL "$LINK_DIR" https://modular-sdk.circle.com
    put_env NEXT_PUBLIC_CIRCLE_CLIENT_KEY "$LINK_DIR" "$key"
    put_env NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID "$LINK_DIR" "$wc"
    put_env NEXT_PUBLIC_OTHER_NETWORK_STATS_URL "$LINK_DIR" https://testnet.karwan.site/activity/all-time
    vercel env ls production --cwd "$LINK_DIR"
    ;;

  deploy)
    say "Production build of $MAINNET from main (Git-connected, so this redeploys the latest main)"
    link_mainnet
    body="$TMP/karwan-mainnet-deploy.json"
    cat >"$body" <<JSON
{"name":"$MAINNET","project":"$MAINNET","target":"production","gitSource":{"type":"github","org":"Iziedking","repo":"Karwan","ref":"main"}}
JSON
    vapi /v13/deployments --scope "$SCOPE" -X POST --input "$(winpath "$body")" --raw | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log('deployment',j.id||'',j.url?('https://'+j.url):'',j.readyState||j.error?.message||'')})"
    echo "Watch it: vercel ls $MAINNET --scope $SCOPE"
    ;;

  domains)
    say "Move karwan.site and www.karwan.site from $TESTNET to $MAINNET"
    require_mainnet_ready
    for d in karwan.site www.karwan.site; do
      # Detach from the testnet project only if it is still there.
      vapi "/v9/projects/$TESTNET/domains/$d" --scope "$SCOPE" --raw >/dev/null 2>&1         && vapi "/v9/projects/$TESTNET/domains/$d" --scope "$SCOPE" -X DELETE --dangerously-skip-permissions --raw >/dev/null
      # www redirects to the apex: the mainnet API allows the apex origin only.
      if [ "$d" = www.karwan.site ]; then
        printf '{"name":"%s","redirect":"karwan.site","redirectStatusCode":308}' "$d" >"$TMP/karwan-domain.json"
      else
        printf '{"name":"%s"}' "$d" >"$TMP/karwan-domain.json"
      fi
      vapi "/v10/projects/$MAINNET/domains" --scope "$SCOPE" -X POST --input "$(winpath "$TMP/karwan-domain.json")" --raw >/dev/null
      echo "  $d -> $MAINNET"
    done
    vercel domains inspect karwan.site --scope "$SCOPE"
    ;;

  testnet)
    say "Testnet project variables, then a production redeploy of $TESTNET"
    put_env NEXT_PUBLIC_SITE_URL . https://testnet.karwan.site
    put_env NEXT_PUBLIC_OTHER_NETWORK_STATS_URL . https://karwan.site/activity/all-time
    vercel redeploy "$(vercel ls "$TESTNET" --scope "$SCOPE" --prod 2>/dev/null | grep -o 'https://[^ ]*vercel.app' | head -1)" --target production --scope "$SCOPE"
    ;;

  verify)
    say "What each host serves"
    for h in karwan.site testnet.karwan.site; do
      code=$(curl -s -o /dev/null -w '%{http_code}' "https://$h/")
      # Which API the site's code calls is the real test; no match must not stop the script.
      net=$(curl -sL "https://$h/" | grep -o '/_next/static/chunks/[^"]*\.js' | sort -u | while read -r c; do curl -s "https://$h$c"; done | grep -o 'https://mainnet-api\.karwan\.site\|https://api\.karwan\.site' | sort -u | tr '
' ' ' || true)
      echo "  $h  http $code  calls: ${net:-no API URL found}"
    done
    printf '  mainnet api: '; curl -s https://mainnet-api.karwan.site/health; echo
    printf '  testnet api: '; curl -s https://api.karwan.site/health; echo
    ;;

  *)
    sed -n '2,17p' "$0"
    exit 1
    ;;
esac
