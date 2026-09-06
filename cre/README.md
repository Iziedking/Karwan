# Karwan Chainlink CRE workflows

`github-delivery` evaluates one accepted delivery policy against an immutable
GitHub pull-request commit, then prepares a signed report for the existing
`KarwanEvidenceRegistry` non-custodial receiver.

## Confidentiality boundary

The GitHub token and accepted criteria JSON are Vault DON secrets. The
repository coordinates, API request and response bodies, submitter, commit
details, and check-run records are handled only inside `handlerInTee`. The
workflow crosses back to the Workflow DON with an ABI-encoded report containing
only:

- deal and accepted-terms identifiers;
- evidence revision and expiry;
- SHA-256 evidence and criteria commitments;
- a verdict commitment, decision code, policy version binding, and report ID.

The workflow source and its decision logic are not confidential. Local CRE
simulation is not a real TEE and must use synthetic data.

## Delivery semantics

The private criteria select one SHA mode:

- `head`: the submitted SHA must equal the pull request's immutable `head.sha`;
- `merge`: the pull request must expose the selected `merge_commit_sha`, and
  the submitted SHA must equal it.

The required named check must run on that exact SHA, succeed, and come from the
allowlisted GitHub App ID. A changed submission uses a new evidence revision;
it does not require changing the accepted terms version.

Source denial, absence, rate limiting, malformed responses, oversized bodies,
or incomplete check-run pagination produce `UNAVAILABLE`, never a delivery
failure or trust penalty.

## Local verification

From the repository root:

```text
npm run cre:github:typecheck
npm run cre:github:test
```

The tracked staging configuration is fixture-only, has report writes disabled,
and is bound to the existing local demo deal
`0x716efda684f30ea0b296fca6e3b67f52a92b59bb574d5136d0b178c82030a7d7`.
The accepted, mismatched, corrected, and unavailable configs are synthetic and
must not be presented as GitHub, testnet, TEE, or live-chain evidence.

## Owner-controlled real execution

Before a real GitHub or Arc run, the owner must review and replace the invalid
production placeholders, create least-privilege CRE secrets, verify the
deployed receiver's workflow identity and Arc forwarder, and explicitly choose
whether to add `--broadcast`. A simulation without `--broadcast` is not an Arc
transaction. This repository does not contain credentials, private keys,
deployment state, or an automatic financial action.
