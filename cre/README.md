# Karwan Chainlink CRE workflows

`github-delivery` evaluates one accepted delivery policy against an immutable
GitHub pull-request commit, then prepares a signed report for the existing
`KarwanEvidenceRegistry` non-custodial receiver.

The staging target is intentionally keyless and fixture-only. Only the
production target loads the Vault DON secret mapping.

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

## Production receiver sequence

The workflow ID includes the binary, final config, workflow name, and owner.
Because the final config includes the receiver address, use this order:

1. Run `cre workflow supported-chains --output json` after login and inspect the
   tenant's Arc Testnet production and mock forwarders. Do not use the mock
   forwarder for a deployed workflow.
2. Deploy `KarwanEvidenceRegistry` with the final production forwarder, workflow
   owner, encoded workflow name, Arc chain ID, and a one-time binder. It starts
   unbound and rejects every report.
3. Put the deployed receiver address into `config.production.json`, set
   `writeReport` to `true`, and finish every other production value. Any later
   config change produces a different workflow ID.
4. From `cre/github-delivery`, calculate the exact ID without deploying:

   ```bash
   ../../.scratch/cre-local.cmd workflow hash . \
     --project-root . \
     --target production-settings \
     --public_key "$CRE_WORKFLOW_OWNER"
   ```

5. Set `CRE_WORKFLOW_ID` to the printed workflow hash. Rehearse and then perform
   the registry's one-time binding with the owner-controlled Foundry keystore.
6. Run the read-only registry verifier. Only after it passes should the owner
   choose to register or activate the CRE workflow.

`cre workflow hash` is a local compile/hash result. `cre workflow simulate` is
simulated execution. `forge script` without `--broadcast` is a no-write
rehearsal. Contract broadcast, CRE deploy/activate, secret creation, and real
workflow execution are separate owner-controlled testnet actions. None of them
is evidence of a mainnet or live financial result.

## Chainlink Upgrade state-change evidence

The Upgrade category needs an accepted Chainlink result to change blockchain
state; a CRE simulation, a generated report, or a frontend display alone is
not enough. Copy `config.upgrade.example.json` to an owner-managed config,
replace every placeholder, set `writeReport` to `true`, and use that same final
config when hashing, binding, and activating the workflow. After an accepted
Arc Testnet run, capture the receiver transaction hash and the receipt fields
from `EvidenceReceiptRecorded`. Then run this read-only assertion:

```text
cd contracts
forge script script/VerifyEvidenceReceipt.s.sol:VerifyEvidenceReceipt \
  --rpc-url "$ARC_TESTNET_RPC_URL"
```

The required environment values are `KARWAN_EVIDENCE_REGISTRY_ADDR`,
`EVIDENCE_DEAL_ID`, `EVIDENCE_TERMS_VERSION`, `EVIDENCE_REVISION`,
`EVIDENCE_DECISION_CODE`, `EVIDENCE_COMMITMENT`,
`EVIDENCE_VERDICT_COMMITMENT`, and `EVIDENCE_REPORT_ID`. This command is
read-only and fails unless the deployed receiver contains the exact accepted
receipt and has consumed the report replay key. Karwan's backend release gates
already read the same `receiptOf(dealId)` state, so the state change has a
visible product consequence rather than being a disconnected demo.
