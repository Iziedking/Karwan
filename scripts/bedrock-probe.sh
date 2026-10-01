#!/usr/bin/env bash
# Which Bedrock models answer on this account. Lists every text model and
# cross-region inference profile the account can see, sends each a five-token
# "Reply OK", and prints one line per model: OK, or the error code.
# Usage: scripts/bedrock-probe.sh [region ...]   (default: us-east-1 ca-central-1)
# Cost: a few input/output tokens per model, well under one cent in total.
set -u

regions=("$@")
[ ${#regions[@]} -eq 0 ] && regions=(us-east-1 ca-central-1)
body='[{"role":"user","content":[{"text":"Reply with OK"}]}]'

aws sts get-caller-identity --query Account --output text >/dev/null 2>&1 || {
  echo "Not signed in to AWS. Run: aws login" >&2
  exit 1
}

for region in "${regions[@]}"; do
  echo "== $region"
  {
    aws bedrock list-foundation-models --region "$region" \
      --by-output-modality TEXT --by-inference-type ON_DEMAND \
      --query 'modelSummaries[].modelId' --output text 2>/dev/null | tr '\t' '\n'
    aws bedrock list-inference-profiles --region "$region" \
      --query 'inferenceProfileSummaries[].inferenceProfileId' --output text 2>/dev/null | tr '\t' '\n'
  } | grep -v '^$' | sort -u | while read -r model; do
    out=$(aws bedrock-runtime converse --region "$region" --model-id "$model" \
      --messages "$body" --inference-config maxTokens=5 \
      --query 'output.message.content[0].text' --output text 2>&1)
    if [ $? -eq 0 ]; then
      printf 'OK     %s  -> %s\n' "$model" "$(echo "$out" | tr -d '\n' | cut -c1-20)"
    else
      code=$(echo "$out" | grep -oE '\(([A-Za-z]+Exception)\)' | head -1 | tr -d '()')
      printf 'FAIL   %s  %s\n' "$model" "${code:-$(echo "$out" | tr -d '\n' | cut -c1-90)}"
    fi
  done
done
