# Karwan Chainlink CRE workflows

The design is in `docs/architecture/12-cre.md`.

## The suite workflows

Three workflows act on the contract suite, and only through
`KarwanCreAdapter` (`contracts/src/suite/KarwanCreAdapter.sol`). The adapter
accepts a report only from the forwarder, only from the workflow bound to its
kind, and only within an hour of issue.

| Folder | Kind | Triggers | Writes |
|---|---|---|---|
| `karwan-check` | CHECK, DRY | `Delivered` log on the Agreement escrows; a schedule that collects finished replays; an HTTP trigger for x402 dry runs | Pass or fail for one delivery revision, with the evidence hash. For a dry run with a result, the release of its fee in `KarwanCreFees`. Nothing when there is no result |
| `karwan-record` | FACT | An HTTP trigger from Karwan's backend | A GitHub work fact (`karwan.fact.github_work.v1`), after a wallet-signed gist proves the account is the person's. The seal carries the numbers; a separate account key lets the adapter hold one account to one person |
| `karwan-risk` | KEEP | A schedule over open deals; `RecordPending` and `PayoutCredited` logs | Timeouts each family lets anyone trigger, each confirmed by a simulated call from the adapter first |

- **Shared code.** `shared/` holds the fingerprints, the policy and reference
  schemas, the replay verdict, the evidence document and the report encoders.
  The backend carries a byte-identical copy in `backend/src/cre/shared/`: run
  `node scripts/cre-shared-sync.mjs` after any change, and
  `backend/src/cre/sharedSync.test.ts` fails on drift.
- **Replay runner.** `replay-runner/` becomes the public `karwan-replay`
  repository, which re-runs the agreed items on the delivered commit.
- **Dry-run fees.** `KarwanCreFees` (`contracts/src/suite/KarwanCreFees.sol`)
  holds each dry-run payment, taken with USDC `receiveWithAuthorization`. A
  DRY report releases it to Karwan; with no answer within an hour, anyone
  calls `refund(runId)` and it returns to the payer. Deploy it with
  `DeployCreFees` after the adapter, bind kind 4 to the karwan-check
  workflow, and set `fees` in the karwan-check config and `CRE_FEES_ADDR` and
  `CRE_RELAYER_KEY` (gas only) in the backend.
- **Enforcement switch.** While `CRE_ENABLED` is off, deals name the `V-K`
  verifier and Karwan's checks decide. In this mode karwan-check runs with
  `attest: false`, and its verdicts are only compared with Karwan's.

Tests and checks:

```text
cd cre/<folder> && bun test && bun run typecheck
scripts/ops/forge-remote.sh test --match-path 'test/suite/cre/*'
scripts/ops/backend-remote.sh test src/cre
scripts/ops/cre-remote.sh simulate karwan-check --target staging-settings --non-interactive --trigger-index 1
```

Deploy order (owner): suite deploy, then `DeployCreAdapter`, then
`DeployCheckVerifiers`, then the three timelock calls it prints and the
48-hour wait, then `DeployCreFees`, then `cre workflow deploy` for each
folder, then `BindCreWorkflow` once per kind (kinds 1 and 4 both to
karwan-check).

## github-delivery

`github-delivery` evaluates one accepted delivery policy against an immutable
GitHub pull-request commit, then prepares a signed report for the existing
`KarwanEvidenceRegistry` non-custodial receiver. Once karwan-check replaces it
in the registry, it serves only the legacy registry's deals.

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

Update: the replacement receiver is now deployed and bound, and the private
workflow is Active. Hosted execution is blocked by a repeated confidential
runtime error. See [deployment evidence and the support message](./DEPLOYMENT.md).
The paragraphs below describe the earlier deployment preparation.

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

The production target now selects `deployment-registry: private`. The prepared
replacement uses organization owner
`0x6aE4fE38dFbBc609D720b2f0814d72E1a94Cc104`, verified by comparing CRE's
authenticated-owner hash with an explicit-owner hash of the same frozen binary
and config. The Arc deployer remains the one-time binder. Deployment preparation
and a successful Foundry rehearsal do not mean the receiver is deployed or the
hosted workflow is active.

The final config must contain the new receiver before hashing. Freeze the exact
compiled artifact and config for binding and deployment. After activation and
backend release, submit one fresh CRE-enabled deal, observe its queue lease,
verify the Arc receipt transaction and backend binding, and check the displayed
verdict before testing settlement. A successful live verification remains outstanding.

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

## Simulation forwarder, checked 15 October 2026

The Chainlink docs say the simulation forwarder does not call a receiver's
`onReport`; its published source says it does. The deployed contract decides.
On a fork of Arc Testnet at block 66719638 (`scripts/ops/arc-fork.sh`), the
forwarder at `0x6E9EE680ef59ef64Aa8C7371279c27E496b5eDc1` reports
`MockKeystoneForwarder 1.0.0-dev`. A `report(receiver, rawReport, 0x, [])`
call with a 109-byte header and a 4-byte body reached a probe receiver once,
with 64 bytes of metadata and the 4-byte body. So a `cre workflow simulate
--broadcast` run exercises the receiver for real, without signature checks.
Reports signed in simulation still fail off-chain signature verification,
by design.

## Adapter rehearsal on a fork of Arc Testnet, 15 October 2026

`contracts/script/CreForkScenario.s.sol` ran on `scripts/ops/arc-fork.sh`
(Arc Foundry `anvil --network arc`, block 66719638) with `CRE_REHEARSAL=1` and
public anvil test keys. It deployed the suite core, an Agreement escrow, the
CRE adapter on the simulation forwarder and the `V-CRE|K` verifier, and funded,
accepted and delivered one checked deal whose `checkPolicy` and `proofHash` are
the fingerprints of `cre/karwan-check/fixtures/scenario.json`.

A CHECK report encoded with `cre/shared/adapterReport.ts` was then sent through
the deployed `MockKeystoneForwarder` with a 109-byte header naming the bound
workflow. One transaction logged, in order:

- `CheckApproved` from the adapter
- `Reported` from the verifier
- `CheckReported` and `ReviewStarted` from the escrow
- `CheckSubmitted` from the adapter
- `ReportProcessed(result=true)` from the forwarder

A fresh read of `getDeal` showed `checkPassed = true`, with the review window
started (`reviewEnd = reviewStartAt + 2 days`). This is a fork. It is not an
Arc Testnet transaction and not a hosted CRE run.

Keeper path, same fork and deal. The fork clock was moved past the review
window, and a KEEP report (`claim(bytes32)` for the deal) was sent through the
same forwarder:

- The first attempt carried a 9-byte workflow name in the header. The adapter
  refused it, and the forwarder logged `ReportProcessed(result=false)`.
- Resent with the bound 10-byte name, one transaction logged the escrow's
  `Paid`, `FeePaid`, `TranchePaid`, `AccountClosed` and `DealSettled`, then the
  adapter's `KeepResult` and `ReportProcessed(result=true)`.
- The seller's USDC rose by 99.5 (100 less the 0.5 fee), and `getDeal` showed
  state 4 (Settled).
- `OutcomeUnrecorded` was logged twice because the scenario's parties have no
  registered identity.

Fact path, same fork:

- The seller registered an identity, and the record workflow was bound to
  kind 2.
- A FACT report (`karwan.fact.github_work.v1`, level 1) sent through the
  forwarder logged `FactRecorded` from KarwanRecord, `FactWritten` from the
  adapter and `ReportProcessed(result=true)`.
- `getFact(0)` returned subject 1, level 1, issuer the adapter, and a one-year
  expiry.
- An earlier attempt against an unbound kind was refused.

## Replay runner rehearsal on GitHub, 15 October 2026

The runner is published at `Iziedking/karwan-replay`, and `replay.yml` is
pinned at blob `b81fbff8069df6028ed12dcce0c8261c4c59d43b`. The test target is
`Iziedking/karwan-replay-fixture`, pull request #1, head
`df41b5c1b3a8cb3aa1c7bb5e1e5f00da6614c6b9`.
`cre/karwan-check/fixtures/scenario.json` holds the agreed policy, with
fingerprint `0xd4a6ce8ccb59ae3c7f83b1dd44695d4904570f25a08a88abad5b273540707a03`.

Run 38810858713 was dispatched with the inputs karwan-check sends:

- `guard` passed. The inputs hash in the run name,
  `840dd5d7f47303385596543e7df2af8d26dcf20c45a043db28fefef7beac66a2`,
  matches the inputs the run was given;
- `item:a` passed;
- `item:b` failed, on purpose.

Read back from GitHub's API and decided by `cre/shared/verdict.ts`, the run is
accepted as the agreed run on the pinned runner, and the decision is FAIL: one
of two required items passed. The evidence fingerprint is
`0xbb5e82be0e99aaca765b2876b2c20d63bc6008f85dd8ebe96cfef504c48ff0f7`. This is a
GitHub run checked by the workflow's own rules. It is not yet a CRE simulation.

## CRE CLI simulations, 16 October 2026

`cre workflow simulate` (CLI v1.38.0) ran all three workflows against a fork of
Arc Testnet on node-services (`scripts/ops/arc-fork.sh`). Karwan's own CRE
routes were served from the backend code over https by `scripts/ops/cre-sim.sh`.
Each workflow has a `simulation-settings` target and a `config.simulation.json`
naming the fork's contracts. The simulator signs every report with a placeholder
workflow (id `0x11…11`, owner `0xaa…aa`), so the fork's adapter was deployed with
that owner and each kind was bound to it.

- **karwan-check, delivery trigger.** Started from the `Delivered` log of a
  checked deal on the fork (deal `0x153f3b7f…7b00`). It read the terms from Arc,
  fetched the policy and the delivery reference from Karwan and matched both to
  their fingerprints on Arc, checked the runner and the pull request on GitHub,
  and dispatched the replay: `{"outcome":"dispatched"}`.
- **karwan-check, schedule.** It read the finished run, decided FAIL (item `b`
  fails on purpose), and wrote the result through the simulation forwarder with
  `--broadcast`: `{"outcome":"attested","decision":"FAIL"}`. On the fork, the
  forwarder logged `ReportProcessed(true)`, the escrow recorded the failed check,
  and `verdictOf` returns set, fail, evidence `0x8c58357e…e2d4`.
- **karwan-risk, schedule.** It read the watch list from Karwan and the deal from
  Arc. Nothing was due: `{"calls":0,"alerts":0,"written":false}`.
- **karwan-record, HTTP trigger.** A public gist from `Iziedking` signed by a
  throwaway fork wallet passed the owner and signature checks. The published
  rule (`github-work-v1`) gave level 0 for that account, so no fact was written:
  `{"outcome":"no-fact","level":0}`. The fact write itself is the one rehearsed
  above through the deployed forwarder.

Two defects found by these runs are fixed: CRE's log filter works by block range
and ignores a block hash, so the `Delivered` log is now found by block number
and checked against its hash; and the simulator reports a report the receiver
refused as executed, so karwan-check now counts a write only when Arc shows its
effect.

## x402 dry run in the CRE simulator, 28 October 2026

The paid dry run an agent buys over x402 ran end to end under
`cre workflow simulate` (CLI v1.38.0) on a fresh fork of Arc Testnet at block
69,520,901 on node-services. `contracts/script/CreForkScenario.s.sol` deployed
the suite, the adapter on the simulation forwarder, V-CRE|K, `KarwanCreFees`
(0.25 USDC) and a delivered deal (`0xc5ce2a76…7015`); `BindCreWorkflow` bound
kinds 1 and 4 to the simulator's workflow. Arc's fork refuses Anvil's public
test accounts, so the run used throwaway keys funded on the fork only.

- **The payment.** A payer signed a USDC `ReceiveWithAuthorization` to the fee
  contract and a relayer called `open`: run `0xf8631596…ebad`, state open,
  0.25 USDC held.
- **karwan-check, HTTP trigger.** With the run id, deal and branch commit as the
  payload, it read the terms from Arc, matched the policy from Karwan to its
  fingerprint on Arc, confirmed the replay runner is pinned and the fee is held,
  and dispatched the replay: `{"outcome":"dispatched"}`. GitHub run
  40717194731 replayed the agreed items on commit `df41b5c1`.
- **karwan-check, schedule.** It read the finished run, decided FAIL (item `b`
  fails on purpose) and wrote a DRY report with `--broadcast`:
  `{"outcome":"dry-run","decision":"FAIL"}`. The forwarder logged
  `ReportProcessed(true)` in `0x70f986d5…244f`, the fee contract moved the run to
  released and paid out its 0.25 USDC, and Karwan's `/api/cre/dry-run/result`
  accepted the signed result (200), so the agent's poll returns it.

The first attempt that day released its fee the same way, but Karwan refused
the result with 401: the simulation API had been started without the
simulator's workflow id and owner (`SIM_WORKFLOW_IDS`, `SIM_WORKFLOW_OWNER`).
That was the harness, not the route. This is a simulation against a fork, not a
hosted CRE run or an Arc Testnet transaction.
