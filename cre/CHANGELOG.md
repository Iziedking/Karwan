# Chainlink CRE changelog

Karwan existed before BLI Legal Tech Hackathon 2. This file lists only the
Chainlink work, all of it built inside the hackathon window (submissions opened
15 May 2026; the first Chainlink commit is 5 September 2026). Everything else
in the repository, such as the market, the wallets and the agents, is
pre-existing product and not part of this submission.

Repository: https://github.com/Iziedking/Karwan

## What Karwan uses Chainlink CRE for

Every deal on Karwan settles in an escrow contract on Arc, so the trust rule is
"read the code", not "trust Karwan". CRE carries three jobs that Karwan should
not do on its own word:

1. **Checking delivered work.** It replays the tests both parties agreed at deal
   setup on the exact commit the seller delivered, and writes pass or fail to the
   escrow.
2. **Keeping deals moving.** It triggers the timeouts a deal's terms already
   allow, such as a claim after review or a refund after the deadline, and raises
   alerts.
3. **Facts from outside sources.** It turns a person's public GitHub work into a
   fact on Karwan's record, after the person proves the account is theirs.

AI agents acting for a deal's parties pay for checks with x402. The payment is
held by a contract until CRE answers, and anyone can refund it if CRE does not.

## Phase 2: three workflows and the contracts they write through (12 to 16 October 2026)

### Workflows (TypeScript, CRE SDK 1.23.0)

| Workflow | Triggers | CRE capabilities | Code |
|---|---|---|---|
| karwan-check | EVM log trigger on `Delivered`; cron; HTTP trigger with an authorised key | HTTP client with identical-consensus aggregation and response caching; EVM `callContract` and `filterLogs`; signed reports; `writeReport` through the forwarder; vault secrets | [cre/karwan-check](https://github.com/Iziedking/Karwan/tree/main/cre/karwan-check) |
| karwan-risk | cron; EVM log trigger on `RecordPending` and `PayoutCredited` | EVM `callContract` (each keeper call simulated from the adapter first); signed reports; `writeReport` | [cre/karwan-risk](https://github.com/Iziedking/Karwan/tree/main/cre/karwan-risk) |
| karwan-record | HTTP trigger with an authorised key | HTTP client with consensus; EVM `callContract`; signed reports; `writeReport`; vault secret for the keyed seal | [cre/karwan-record](https://github.com/Iziedking/Karwan/tree/main/cre/karwan-record) |

Shared by all three, and copied byte for byte into the backend under a drift test:

- [cre/shared](https://github.com/Iziedking/Karwan/tree/main/cre/shared): canonical
  fingerprints, the acceptance policy schema, the replay verdict, the evidence
  document, the report encoders, the suite ABI and the GitHub work rule.
- [cre/replay-runner](https://github.com/Iziedking/Karwan/tree/main/cre/replay-runner):
  the GitHub Actions runner the check dispatches, published as
  [Iziedking/karwan-replay](https://github.com/Iziedking/karwan-replay). A
  `guard` job re-derives the inputs hash, so a run started with other inputs
  never counts.
- [cre/replay-fixture](https://github.com/Iziedking/Karwan/tree/main/cre/replay-fixture):
  the test target, published as
  [Iziedking/karwan-replay-fixture](https://github.com/Iziedking/karwan-replay-fixture).
- [cre/project.yaml](https://github.com/Iziedking/Karwan/blob/main/cre/project.yaml)
  and [cre/secrets.suite.yaml](https://github.com/Iziedking/Karwan/blob/main/cre/secrets.suite.yaml).

### Contracts (Solidity, Arc)

- [KarwanCreAdapter.sol](https://github.com/Iziedking/Karwan/blob/main/contracts/src/suite/KarwanCreAdapter.sol):
  the CRE receiver (`IReceiver`). It accepts a report only from the Keystone
  forwarder, only from the workflow bound to that kind of report (workflow id,
  name and owner), and only within an hour of issue. It holds no money and has no
  owner. Kinds: CHECK, FACT, KEEP and DRY.
- [IKarwanCreAdapter.sol](https://github.com/Iziedking/Karwan/blob/main/contracts/src/suite/interfaces/IKarwanCreAdapter.sol):
  the report layouts the workflows encode against.
- [KarwanCreFees.sol](https://github.com/Iziedking/Karwan/blob/main/contracts/src/suite/KarwanCreFees.sol):
  holds an agent's dry-run payment, taken with USDC `receiveWithAuthorization`.
  Only a CRE answer within the hour releases it; after that, anyone refunds the
  payer.
- [KarwanCheckVerifier.sol](https://github.com/Iziedking/Karwan/blob/main/contracts/src/suite/KarwanCheckVerifier.sol):
  the k-of-n verifier the adapter signs for through ERC-1271. It keeps the first
  result for each delivery.
- Scripts: [DeployCreAdapter](https://github.com/Iziedking/Karwan/blob/main/contracts/script/DeployCreAdapter.s.sol),
  [DeployCheckVerifiers](https://github.com/Iziedking/Karwan/blob/main/contracts/script/DeployCheckVerifiers.s.sol),
  [DeployCreFees](https://github.com/Iziedking/Karwan/blob/main/contracts/script/DeployCreFees.s.sol),
  [BindCreWorkflow](https://github.com/Iziedking/Karwan/blob/main/contracts/script/BindCreWorkflow.s.sol),
  [CreForkScenario](https://github.com/Iziedking/Karwan/blob/main/contracts/script/CreForkScenario.s.sol).
- Tests: [contracts/test/suite/cre](https://github.com/Iziedking/Karwan/tree/main/contracts/test/suite/cre)
  (80 tests including invariants, cross-language vectors and a Slither triage) and
  [ArcCreFees.t.sol](https://github.com/Iziedking/Karwan/blob/main/contracts/test/suite/arc/ArcCreFees.t.sol)
  on a fork of Arc Testnet with Arc's own USDC.

### Backend (Node, TypeScript)

- [backend/src/cre](https://github.com/Iziedking/Karwan/tree/main/backend/src/cre):
  - `reportVerify.ts` verifies a CRE report off chain against the node keys in
    Chainlink's Capability Registry on Ethereum, counting each signer once;
  - `gateway.ts` starts a workflow through the CRE gateway with a signed request;
  - `store.ts` keeps the documents behind each fingerprint and the replay index;
  - `decisions.ts` turns check evidence into an automatic dispute proposal.
- [routes/cre.ts](https://github.com/Iziedking/Karwan/blob/main/backend/src/routes/cre.ts):
  the endpoints the workflows call. Results are accepted only when signed by the
  expected workflow over that exact payload.
- [routes/x402Cre.ts](https://github.com/Iziedking/Karwan/blob/main/backend/src/routes/x402Cre.ts):
  x402 endpoints for agents. A dry run is paid into `KarwanCreFees`; evidence is
  sold to a deal's parties.

### Operations and simulation

- [scripts/ops/cre-remote.sh](https://github.com/Iziedking/Karwan/blob/main/scripts/ops/cre-remote.sh):
  runs the CRE CLI (v1.38.0, checksum pinned) on a build server.
- [scripts/ops/cre-sim.sh](https://github.com/Iziedking/Karwan/blob/main/scripts/ops/cre-sim.sh)
  and [cre-sim/server.ts](https://github.com/Iziedking/Karwan/blob/main/scripts/ops/cre-sim/server.ts):
  serve Karwan's real CRE routes over https for `cre workflow simulate`.
- [scripts/ops/arc-fork.sh](https://github.com/Iziedking/Karwan/blob/main/scripts/ops/arc-fork.sh):
  a fork of Arc Testnet with Chainlink's simulation forwarder.
- [scripts/ops/env-put.sh](https://github.com/Iziedking/Karwan/blob/main/scripts/ops/env-put.sh):
  puts CRE secrets on a host without printing them.

### Results

On 16 October 2026 all three workflows ran under `cre workflow simulate` against
the Arc fork. The delivery check started from a real `Delivered` log, dispatched
the replay on GitHub, and wrote a FAIL result that the escrow recorded through
the simulation forwarder. The details are in the
[CRE README](https://github.com/Iziedking/Karwan/blob/main/cre/README.md) under
"CRE CLI simulations, 16 October 2026".

The simulations found two defects, both fixed in commit `2b7bc94c`:
- CRE's log filter works by block range and ignores a block hash, so the
  `Delivered` log is now found by block number and checked against its hash.
- The simulator reports a report the receiver refused as executed, so a result
  now counts only when Arc shows it.

### Commits

| Date | Commit | Change |
|---|---|---|
| 12 Oct | `600e780b` | Agreement escrow with a check verifier per deal: checks count only when k of n fixed checkers sign |
| 15 Oct | `e190faf7` | CRE adapter: check results, facts and timeouts only from the bound workflow |
| 15 Oct | `44623ba4` | The three workflows, shared code and the replay runner |
| 15 Oct | `d3ea5dc4` | Backend CRE bridge, DON report verification, x402 endpoints |
| 15 Oct | `052cce0e` | Architecture view 12 and the ops scripts |
| 15 Oct | `9b767afd` | One result per delivery in the check verifier |
| 15 Oct | `cd69818a` | Fee contract for x402 dry runs; account key for GitHub facts |
| 15 Oct | `43df0a95` | Workflows release dry-run fees and carry the account key |
| 15 Oct | `1b258bb9` | Backend: dry runs paid into the fee contract |
| 15 Oct | `46edc74f` | View 12 and ops scripts updated |
| 16 Oct | `2b7bc94c` | Fixes found by the CRE simulator |
| 16 Oct | `d89a8998` | Simulation harness; all three workflows simulated |

## Phase 1: a confidential delivery check (5 to 14 September 2026)

The first integration: a confidential CRE workflow reads a GitHub delivery
inside CRE's TEE and writes a commitment-only report to a receiver on Arc, so a
release can wait for evidence that does not depend on Karwan.

- [cre/github-delivery](https://github.com/Iziedking/Karwan/tree/main/cre/github-delivery):
  a cron trigger with `handlerInTee` (confidential compute). It reads GitHub with
  the CRE HTTP client and vault secrets and writes the report with `writeReport`.
  Repository names, SHAs and credentials stay inside the TEE.
- [KarwanEvidenceRegistry.sol](https://github.com/Iziedking/Karwan/blob/main/contracts/src/KarwanEvidenceRegistry.sol):
  the non-custodial receiver, bound once to the workflow.
- Backend under [backend/src/evidence](https://github.com/Iziedking/Karwan/tree/main/backend/src/evidence)
  (`creDeliveryRequest*`, `creAutoPublication`, `creEvidenceReconciler`,
  `creVerificationProgress`, `creReportIdentity`): a durable request queue with
  leases, automatic publication, receipt reconciliation, and the release gate.
- Deployment record: [cre/DEPLOYMENT.md](https://github.com/Iziedking/Karwan/blob/main/cre/DEPLOYMENT.md).
  The receiver is deployed on Arc Testnet at
  `0xb63d5Ef3dC0b2a8297fCE1261C9481C6D6647F93`, and the workflow
  `karwan-git-prod` is registered and Active on the private registry. Hosted runs
  fail on Chainlink's side with "cannot validate enclave config: DON members not
  set", which was raised with Chainlink.

The 32 commits that touch this code run from `de194e54` (5 September, the
receiver) to `6ec410bc` (14 September). This lists them:

```bash
git log --since=2026-09-05 --until=2026-09-15 -- cre contracts/src/KarwanEvidenceRegistry.sol contracts/src/interfaces/IReceiver.sol 'contracts/script/*Evidence*' 'contracts/test/*Evidence*' 'backend/src/evidence/cre*'
```

## Status, stated plainly

- Simulated with the CRE CLI: all three Phase 2 workflows, on a fork of Arc
  Testnet.
- Deployed: the Phase 1 receiver on Arc Testnet, and the Phase 1 workflow,
  registered but blocked by the DON error above.
- Not deployed yet: the Phase 2 adapter, verifiers and fee contract, and the
  hosted Phase 2 workflows.
- While CRE cannot run hosted, Karwan's own checks decide deals, and CRE results
  are compared alongside them (`CRE_ENABLED` is off). A CRE error never blocks a
  deal.
