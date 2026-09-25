#!/usr/bin/env bash
# Off-site copy of Karwan's mainnet key material, the second backup beside the
# owner's password manager.
#
# What goes in: the mainnet deployer keystore (already password-encrypted by
# Foundry) and the mainnet deployment manifests. What never goes in: any
# password, the age private keys, or more than one Safe owner key.
#
# Three locks on every object:
#   1. the keystore password (in the password manager only);
#   2. age encryption to the two offline keys that also protect the database
#      backups (public halves in age-recipients.txt);
#   3. SSE-KMS on a private, versioned bucket with Object Lock, so a leaked AWS
#      login cannot read it and cannot delete it for a year.
# Nothing is written to disk in plaintext; the only temp file is ciphertext.
#
# Usage (Git Bash, AWS profile with admin rights on account 965085139692):
#   AWS_PROFILE=karwan bash scripts/mainnet-keys/vault.sh setup-bucket   # once
#   AWS_PROFILE=karwan bash scripts/mainnet-keys/vault.sh backup
#   AWS_PROFILE=karwan bash scripts/mainnet-keys/vault.sh list
#   AWS_PROFILE=karwan AGE_IDENTITY=/path/to/offline-key.txt bash scripts/mainnet-keys/vault.sh restore-test [stamp]
#
# Env: VAULT_BUCKET (default karwan-mainnet-vault-965085139692),
#      VAULT_REGION (default ca-central-1), KMS_KEY_ID (default the mainnet
#      backup key), KEYSTORES (space separated keystore names, default
#      karwan-mainnet-deployer).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
BUCKET="${VAULT_BUCKET:-karwan-mainnet-vault-965085139692}"
REGION="${VAULT_REGION:-ca-central-1}"
KMS_KEY="${KMS_KEY_ID:-d0724421-42fd-4051-9edb-4e201656c130}"
KEYSTORES="${KEYSTORES:-karwan-mainnet-deployer}"
RECIPIENTS="$HERE/age-recipients.txt"
KEYDIR="$HOME/.foundry/keystores"
DEPLOYMENTS="$REPO/contracts/deployments"

die() { echo "STOP: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null || die "$1 is not installed"; }

cmd_setup_bucket() {
  need aws
  aws kms describe-key --key-id "$KMS_KEY" --region "$REGION" >/dev/null || die "KMS key $KMS_KEY not found in $REGION"
  if aws s3api head-bucket --bucket "$BUCKET" --region "$REGION" 2>/dev/null; then
    echo "Bucket $BUCKET already exists; checking its settings."
  else
    aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" \
      --create-bucket-configuration LocationConstraint="$REGION" --object-lock-enabled-for-bucket >/dev/null
    echo "Created $BUCKET with Object Lock."
  fi
  aws s3api put-public-access-block --bucket "$BUCKET" --region "$REGION" --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
  aws s3api put-bucket-versioning --bucket "$BUCKET" --region "$REGION" --versioning-configuration Status=Enabled
  aws s3api put-bucket-encryption --bucket "$BUCKET" --region "$REGION" --server-side-encryption-configuration \
    "{\"Rules\":[{\"ApplyServerSideEncryptionByDefault\":{\"SSEAlgorithm\":\"aws:kms\",\"KMSMasterKeyID\":\"$KMS_KEY\"},\"BucketKeyEnabled\":true}]}"
  # Governance mode: nobody deletes or overwrites a version for 365 days
  # without the explicit bypass permission, which no role in this account uses.
  aws s3api put-object-lock-configuration --bucket "$BUCKET" --region "$REGION" --object-lock-configuration \
    '{"ObjectLockEnabled":"Enabled","Rule":{"DefaultRetention":{"Mode":"GOVERNANCE","Days":365}}}'
  aws s3api put-bucket-policy --bucket "$BUCKET" --region "$REGION" --policy "{
    \"Version\":\"2012-10-17\",
    \"Statement\":[{\"Sid\":\"TlsOnly\",\"Effect\":\"Deny\",\"Principal\":\"*\",\"Action\":\"s3:*\",
      \"Resource\":[\"arn:aws:s3:::$BUCKET\",\"arn:aws:s3:::$BUCKET/*\"],
      \"Condition\":{\"Bool\":{\"aws:SecureTransport\":\"false\"}}}]}"
  echo "OK: private, versioned, KMS-encrypted, TLS-only, Object Lock 365 days (governance)."
}

cmd_backup() {
  need aws; need age; need tar
  grep -q '^age1' "$RECIPIENTS" || die "no age public keys in $RECIPIENTS"
  local files=() names=() stamp sum
  for k in $KEYSTORES; do
    [ -f "$KEYDIR/$k" ] || die "keystore $KEYDIR/$k not found"
    files+=("-C" "$KEYDIR" "$k"); names+=("keystores/$k")
  done
  if compgen -G "$DEPLOYMENTS/*-5042.json" >/dev/null; then
    for f in "$DEPLOYMENTS"/*-5042.json; do files+=("-C" "$DEPLOYMENTS" "$(basename "$f")"); names+=("deployments/$(basename "$f")"); done
  fi
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  VAULT_TMP=$(mktemp)
  trap 'rm -f "${VAULT_TMP:-}"' EXIT
  local tmp=$VAULT_TMP
  tar -cf - "${files[@]}" | age -R "$RECIPIENTS" > "$tmp"
  sum=$(sha256sum "$tmp" | cut -d' ' -f1)
  aws s3 cp "$tmp" "s3://$BUCKET/keys/$stamp/bundle.tar.age" --region "$REGION" \
    --sse aws:kms --sse-kms-key-id "$KMS_KEY" --only-show-errors
  printf 'stamp=%s\nciphertext_sha256=%s\ncontents=%s\nrecipients=%s\n' \
    "$stamp" "$sum" "${names[*]}" "$(grep -c '^age1' "$RECIPIENTS")" \
    | aws s3 cp - "s3://$BUCKET/keys/$stamp/MANIFEST" --region "$REGION" \
      --sse aws:kms --sse-kms-key-id "$KMS_KEY" --only-show-errors
  local remote; remote=$(aws s3 cp "s3://$BUCKET/keys/$stamp/bundle.tar.age" - --region "$REGION" | sha256sum | cut -d' ' -f1)
  [ "$remote" = "$sum" ] || die "the uploaded copy does not match what was sent"
  echo "OK: keys/$stamp uploaded and read back (${names[*]})."
  echo "Now run restore-test once with one of your offline age keys, to prove the backup opens."
}

cmd_list() {
  need aws
  aws s3 ls "s3://$BUCKET/keys/" --region "$REGION"
}

cmd_restore_test() {
  need aws; need age
  [ -n "${AGE_IDENTITY:-}" ] || die "set AGE_IDENTITY to one offline age private key file"
  [ -f "$AGE_IDENTITY" ] || die "no file at AGE_IDENTITY=$AGE_IDENTITY (use the real path to your offline age key)"
  local stamp="${1:-}"
  if [ -z "$stamp" ]; then
    stamp=$(aws s3 ls "s3://$BUCKET/keys/" --region "$REGION" | awk '{print $2}' | sort | tail -1 | tr -d '/')
  fi
  [ -n "$stamp" ] || die "no backups found"
  echo "Opening keys/$stamp in memory (nothing is written to disk):"
  aws s3 cp "s3://$BUCKET/keys/$stamp/bundle.tar.age" - --region "$REGION" \
    | age -d -i "$AGE_IDENTITY" | tar -tvf -
  echo "OK: the backup decrypts with that key. The keystores inside still need their passwords."
}

case "${1:-}" in
  setup-bucket) cmd_setup_bucket ;;
  backup) cmd_backup ;;
  list) cmd_list ;;
  restore-test) shift; cmd_restore_test "$@" ;;
  *) sed -n '2,32p' "$0"; exit 1 ;;
esac
