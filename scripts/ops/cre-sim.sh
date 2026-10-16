#!/usr/bin/env bash
# Karwan's CRE routes over https on node-services, for `cre workflow simulate`.
#   scripts/ops/cre-sim.sh up [KEY=VALUE ...]   start or restart it (SIM_* settings)
#   scripts/ops/cre-sim.sh log                   the requests it has received
#   scripts/ops/cre-sim.sh down                  stop it and remove its workspace
# The workflow token is read on node-services from ~/.karwan-cre-env and handed
# to the container by name; it is never printed. The certificate is made for
# this run, lives a day, and is trusted only by the simulator's container
# (cre-remote.sh mounts tls/ca-bundle.crt when it exists).
set -euo pipefail
H=node-services
W=/tmp/karwan-cre-sim
BUN_IMAGE=oven/bun:1.3.14@sha256:e10577f0db68676a7024391c6e5cb4b879ebd17188ab750cf10024a6d700e5c4
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

case "${1:-}" in
  up)
    shift
    for kv in "$@"; do
      [[ $kv =~ ^SIM_[A-Z_]+=[A-Za-z0-9,._:/x-]*$ ]] || { echo "bad setting: $kv" >&2; exit 2; }
    done
    EXTRA=""
    for kv in "$@"; do EXTRA+=" -e $kv"; done
    ssh -o BatchMode=yes $H "docker rm -f karwan-cre-sim >/dev/null 2>&1 || true; mkdir -p $W/tls $W/repo/scripts/ops" < /dev/null
    tar -C "$ROOT" -czf - backend/src/routes/cre.ts backend/src/cre backend/src/evidence/creDeliveryRequest.ts \
        backend/src/evidence/creReportIdentity.ts scripts/ops/cre-sim/server.ts cre/karwan-check/fixtures/scenario.json \
      | ssh -o BatchMode=yes $H "tar -C $W/repo -xzf -"
    ssh -o BatchMode=yes $H "set -e; cd $W
      cat > repo/package.json <<'JSON'
{ \"private\": true, \"type\": \"module\", \"dependencies\": { \"hono\": \"4.12.25\", \"zod\": \"3.25.76\", \"viem\": \"2.52.2\" } }
JSON
      if [ ! -f tls/cert.pem ] || ! openssl x509 -checkend 3600 -noout -in tls/cert.pem >/dev/null; then
        openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -days 1 \
          -keyout tls/key.pem -out tls/cert.pem -subj /CN=localhost \
          -addext subjectAltName=DNS:localhost,IP:127.0.0.1 >/dev/null 2>&1
        cat /etc/ssl/certs/ca-certificates.crt tls/cert.pem > tls/ca-bundle.crt
      fi
      cp -r tls repo/tls
      # Anvil's first public test key: it sends the simulation forwarder's
      # transactions on the Arc fork, and holds nothing anywhere else.
      echo CRE_ETH_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 > sim.env
      CRE_WORKFLOW_TOKEN=\$(bash /home/ubuntu/env-put.sh /home/ubuntu/.karwan-cre-env CRE_WORKFLOW_TOKEN --get) \
        docker run -d --name karwan-cre-sim --network host -e CRE_WORKFLOW_TOKEN \
          -e SIM_SCENARIO=cre/karwan-check/fixtures/scenario.json $EXTRA \
          -v $W/repo:/w -w /w --entrypoint sh $BUN_IMAGE -c 'bun install --silent && bun scripts/ops/cre-sim/server.ts' >/dev/null
      for i in \$(seq 60); do curl -s --cacert tls/cert.pem https://localhost:\${SIM_PORT:-8743}/api/cre/doc/x -o /dev/null -w '%{http_code}' 2>/dev/null | grep -q 401 && break; sleep 1; done
      docker logs karwan-cre-sim 2>&1 | tail -3" < /dev/null
    ;;
  log)
    ssh -o BatchMode=yes $H "cat $W/repo/requests.jsonl 2>/dev/null" < /dev/null
    ;;
  down)
    ssh -o BatchMode=yes $H "docker rm -f karwan-cre-sim >/dev/null 2>&1 || true
      docker run --rm -v $W:/x --entrypoint sh $BUN_IMAGE -c 'rm -rf /x/repo' 2>/dev/null; rm -rf $W" < /dev/null
    ;;
  *)
    echo "usage: $0 up [SIM_KEY=VALUE ...] | log | down" >&2
    exit 2
    ;;
esac
