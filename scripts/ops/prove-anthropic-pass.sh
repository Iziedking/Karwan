#!/usr/bin/env bash
# Proves the server can reach Claude at Anthropic with no stored key (view 89).
# Runs on the server, leaves nothing behind, prints no note and no pass.
#
# Step 1, before the Console wizard: what AWS says about this server.
#   ssh karwan-vm 'bash -s' < scripts/ops/prove-anthropic-pass.sh
# Step 2, after the wizard: trade the note for a pass and ask two questions.
#   ssh karwan-vm 'RULE=fdrl_... ORG=<organization id> WS=wrkspc_... bash -s' < scripts/ops/prove-anthropic-pass.sh
set -euo pipefail

REGION="${REGION:-ca-central-1}"
export RULE="${RULE:-}" ORG="${ORG:-}" WS="${WS:-}" MODEL="${MODEL:-claude-haiku-4-5-20251001}"

JWT=$(aws sts get-web-identity-token --region "$REGION" \
  --audience https://api.anthropic.com --signing-algorithm RS256 --duration-seconds 900 \
  --query WebIdentityToken --output text)
export JWT

PY=$(cat <<'EOF'
import base64, json, os, sys, urllib.request, urllib.error

jwt = os.environ["JWT"]
part = jwt.split(".")[1]
claims = json.loads(base64.urlsafe_b64decode(part + "=" * (-len(part) % 4)))
print("issuer  :", claims.get("iss"))
print("subject :", claims.get("sub"))
print("audience:", claims.get("aud"))
print("has jti :", "jti" in claims, "| lasts", claims.get("exp", 0) - claims.get("iat", 0), "s")

rule, org, ws, model = (os.environ[k] for k in ("RULE", "ORG", "WS", "MODEL"))
if not rule or not org:
    print("\nNo RULE and ORG given, so this stops here. Use the three values above in the Console wizard.")
    sys.exit(0)

def post(url, body, headers):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST",
                                 headers={"content-type": "application/json", **headers})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")

body = {"grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer", "assertion": jwt,
        "federation_rule_id": rule, "organization_id": org}
if ws:
    body["workspace_id"] = ws
status, out = post("https://api.anthropic.com/v1/oauth/token", body, {})
if status != 200:
    print("\nexchange:", status, json.dumps(out.get("error", out))[:300])
    print("The reason is on the Console page Workload identity, Authentication events.")
    sys.exit(1)
token = out.pop("access_token")
print("\nexchange: 200 | ends in", out.get("expires_in"), "s | scope", out.get("scope"), "| pass", len(token), "chars")

auth = {"authorization": "Bearer " + token, "anthropic-version": "2023-06-01"}
def ask(label, extra):
    s, o = post("https://api.anthropic.com/v1/messages",
                {"model": model, "max_tokens": 20, "messages": [{"role": "user", "content": "Reply with exactly: ok"}], **extra}, auth)
    if s != 200:
        print(label, s, json.dumps(o.get("error", o))[:300])
        return False
    text = "".join(b.get("text", "") for b in o.get("content", []) if b.get("type") == "text")
    u = o.get("usage", {})
    print(label, 200, repr(text[:40]), "| cache written", u.get("cache_creation_input_tokens"), "read", u.get("cache_read_input_tokens"))
    return True

plain = ask("plain call :", {})
cached = ask("1h cache   :", {"system": [{"type": "text", "text": "You are a test. " * 400,
                                          "cache_control": {"type": "ephemeral", "ttl": "1h"}}]})
sys.exit(0 if plain and cached else 1)
EOF
)
python3 -c "$PY"
