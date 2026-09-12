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

## Receipt reconciliation

The delivery request endpoint leases one exact delivery revision to CRE. After
the workflow writes its report, the backend's opt-in CRE receipt reconciler
reads `receiptOf(dealId)` from `KarwanEvidenceRegistry`, validates the terms,
revision, expiry, commitments, decision and lease-derived report ID, then marks
the queue item complete. A chain receipt is never enough by itself: a release
is still blocked until this queue binding succeeds. Enable it on the production
backend only when the registry address and the live CRE workflow are configured:

```text
CRE_EVIDENCE_RECONCILER_ENABLED=true
CRE_EVIDENCE_RECONCILER_INTERVAL_MS=30000
```

The reconciler does not claim pending work, move funds, or decide a verdict. It
only closes a lease that the CRE worker already claimed and whose exact report
is present on Arc. World AgentBook verification remains an independent
eligibility signal and is not required for the GitHub evidence path.

## Automatic submission and status

With automatic publication enabled, the seller submits an exact GitHub PR URL
through **Mark delivered**. The backend reads that PR, pins its head or merged
commit, and persists a request for the current agreement and delivery revision.
The seller does not run a terminal command. The production workflow is scheduled
once a minute; an empty queue is a normal idle run.

The deal room shows **Queued** only after a durable queue entry exists and
**Checking** while CRE holds its lease. **Passed**, **Mismatch**, or
**Unavailable** reflect the current receipt or an actual inability to check.
An intermediate receipt-confirmation state covers reconciliation. The open deal
polls while verification is pending. A pass satisfies the evidence requirement;
it does not itself send an escrow payment.

Backend configuration, after the matching hosted workflow is active:

```text
CRE_AUTO_PUBLISH_ENABLED=true
CRE_GITHUB_SHA_MODE=merge
CRE_REQUEST_LEASE_MS=600000
CRE_EVIDENCE_RECONCILER_ENABLED=true
CRE_EVIDENCE_RECONCILER_INTERVAL_MS=30000
```

`CRE_DELIVERY_REQUEST_TOKEN` must match the workflow's Vault secret and
`KARWAN_EVIDENCE_REGISTRY_ADDR` must identify the receiver bound to that exact
workflow. For private repositories or authenticated GitHub rate limits, configure
the backend's `CRE_GITHUB_READ_TOKEN` securely as well. Vault storage alone does
not provide the backend with this token. Never source the entire production
`.env` as a shell script or print its values.

`CRE_GITHUB_SHA_MODE` must match `shaMode` in the confidential criteria. In merge
mode the PR must already be merged. The workflow fetches the submitted
repository, then checks it against the configured private repository ID and
policy. The current integration has one configured confidential policy; it does
not yet provision arbitrary buyer-specific repository policies through the UI.

Publication retries at most three times, separated by at least a minute. A
restart reuses the persisted commit instead of repinning a changed PR. Requests
expire after an hour; leases last ten minutes. Expired work requires a corrected
delivery or operator attention. Invalid URLs, inaccessible PRs, and unmet merge
requirements do not produce a passing result. Corrections get a new revision.

Automatic publication defaults to disabled. Enabling it creates queue entries;
it does not deploy a hosted CRE workflow. A local simulation is not evidence
that the hosted schedule is running.

### Activation checkpoint, 13 September 2026

Authenticated CLI inspection returned no deployed workflows. Arc receiver
`0x07542B70Bd7F7E81d7398011ECdFb80dFddE1311` is permanently bound to the older
workflow ID
`0x0023b58ea1796e15d63cf56b2f0109a1575606b6fe9f0e9f6ca614d20660ec51`.
The updated code and schedule require a new receiver and the production receiver
sequence below. Do not activate the updated workflow against the old receiver.

Choose the deployment registry before deploying the receiver. A private-registry
workflow uses the CRE organization owner; an onchain-registry workflow uses its
linked wallet owner. Confirm the owner from the authenticated account rather
than assuming the Arc deployer and workflow owner are the same address. See
[Chainlink's deployment guide](https://docs.chain.link/cre/guides/operations/deploying-workflows).

The final config must contain the new receiver before hashing. Freeze the exact
compiled artifact and config for binding and deployment. After activation and
backend release, submit one fresh CRE-enabled deal, observe its queue lease,
verify the Arc receipt transaction and backend binding, and check the displayed
verdict before testing settlement. This live proof remains outstanding.

## Commit and check policy

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
