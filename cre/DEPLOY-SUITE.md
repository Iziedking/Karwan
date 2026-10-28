# Deploying the suite CRE workflows on Arc Testnet

The order for putting `karwan-check`, `karwan-risk` and `karwan-record` on
Chainlink's hosted network against the endgame suite on Arc Testnet
(`contracts/deployments/endgame-5042002.json`). The owner runs every command
that broadcasts, deploys or signs. Written 28 October 2026.

## What is checked already

- Chainlink's forwarder directory, read 28 October 2026: Arc Testnet is
  `arc-testnet`, production KeystoneForwarder
  `0x76c9cf548b4179F8901cda1f8623568b58215E62`, simulation forwarder
  `0x6E9EE680ef59ef64Aa8C7371279c27E496b5eDc1`. Arc mainnet is not listed.
  `DeployCreAdapter` refuses any other forwarder.
- Chainlink's deployment guide, same day: the private registry holds at most 3
  workflows per organisation, and deleting a workflow cannot be undone.
- None of the three workflows uses the confidential runtime. The
  `DON members not set` error in [DEPLOYMENT.md](./DEPLOYMENT.md) came from the
  confidential `karwan-git-prod` workflow, so it should not apply here. That is
  only known for sure after the first hosted run.
- The hub, record issuer list and adapter bindings are owned by the timelock
  `0xB434527FA2C7eA05313850FA03A976de05997Eff` (24 hour delay), proposed by the
  owner Safe `0xF253E02048FB2F89FFD3E3c931aa3ea14A857556`.

## Deployed

| Contract | Address | Transaction | Block |
|---|---|---|---|
| KarwanCreAdapter | `0x4eA2959C8843922b79f39976351543e46FC679CD` | `0x3ba7db947392ba906283f2d11924ae7ff9ca449581b3eff994ee968da5dfb4ac` | 69,524,471 |
| KarwanCreFees | `0x9553ff79B13f27D767B2A94BB8428a8e6A7D9c7e` | `0x8acf9bbd5bb88cd74ad33e5f26d50945e9602c809f2da119e2366fc701e9c627` | 69,524,588 |

Deployed 28 October 2026 by the owner from `0x665eEBCA6507867930D0f59fD1CfD9c40ce02B33`,
the testnet deployer of the endgame suite, which holds no role in either
contract. Read back from Arc the same day: the adapter names forwarder
`0x76c9…5E62`, workflow owner `0x6aE4…C104`, hub `0xB874…38a6` and binder the
timelock `0xB434…7Eff`, with no workflow bound yet; the fee contract names the
adapter, payee `0x915E…8d9E`, Arc USDC and a price of 250,000 (0.25 USDC). Both
are exact matches, creation and runtime, on Sourcify for chain 5042002.

Workflows in the private registry, owner `0x6aE4fE38dFbBc609D720b2f0814d72E1a94Cc104`,
DON family `zone-a`, deployed 28 October 2026 from node-services:

| Workflow | Workflow ID | Signing key in its config |
|---|---|---|
| karwan-risk | `000dde745031a30f3f3e6350c691944d1d508f555d43ed32e02d9aff0d042b35` | none |
| karwan-check | `0080cdf71dc5db4d6324096d64f1e6b28eccf2f491cd234900ec6e3962650126` | `gatewayKey` `0x182fd66E898DcED0e8B8966b7311325150B7c077` |
| karwan-record | `006ebc310c4b7f6996f2951c74d32a2ae0d9462d506b95874c6ca819737fa2ae` | `backendKey` `0x182fd66E898DcED0e8B8966b7311325150B7c077` |

`0x182f…c077` is `CRE_GATEWAY_SIGNER_KEY`, made with `env-put.sh --new-key` in
`~/.karwan-cre-env` on node-services and never printed. `karwan-git-prod`
(`00ab26d9…34c6`) was deleted the same day; for a while afterwards
`cre workflow list` and `cre workflow get` still showed it as paused and did not
show the new workflows, while deploy and delete, which ask the server by name,
saw the true state.

Two things learned on the way:

- The first `karwan-check` deploy came out as `0070dfe2…e9fb`, and a redeploy of
  the same source and config as `0080cdf7…0126`: the TypeScript build is not
  byte-for-byte repeatable. After the bindings run, **do not redeploy** a bound
  workflow. A new id needs a new binding through the timelock, another 24 hours.
- Every hosted run fails until the Vault DON holds the secrets and production
  serves `/api/cre`.

The timelock batch for these ids is
`contracts/deployments/cre-5042002-2026-10-28.schedule.json` and `.execute.json`
(salt `0xa78b06db…c233`). Simulated on Arc Testnet on 28 October: the schedule
call as the owner Safe, each `bindWorkflow` and `setIssuer(adapter, true)` as
the timelock, all succeed; `setIssuer` sent by the Safe directly reverts.

## What runs when

| Step | Who | Waits for |
|---|---|---|
| 1. Deploy the adapter and the fee contract | Owner | Nothing |
| 2. Fill the production configs | Claude, from the addresses | Step 1 |
| 3. Put the workflow secrets in the Vault DON | Owner | Nothing |
| 4. Delete `karwan-git-prod` to free a registry slot | Owner | Nothing |
| 5. Deploy the three workflows | Owner | Steps 2 to 4 |
| 6. Queue the bindings in the timelock | Owner Safe | Step 5 (the ids) |
| 7. Production backend settings and push | Owner | Step 5 |
| 8. Run the queued bindings | Owner Safe | 24 hours after step 6 |

`karwan-risk` executes on Chainlink's network from step 5. Until step 8 its
reports have no bound workflow, so it writes nothing to Arc; with no deal due it
writes nothing anyway. A check result, a dry-run release and a fact all need
step 8.

No check verifier is deployed in this round. `karwan-check` runs with
`attest: false`: it compares its verdicts with Karwan's and never writes a check
result, as view 12 says while `CRE_ENABLED` is off. Its dry runs still release
fees through the adapter.

## 1. Contracts

Create `contracts/.env.cre-deploy` (ignored by git) with the deployer key the
endgame suite was deployed from:

```
ARC_RPC=https://rpc.testnet.arc.io
DEPLOYER_KEY=0x...
CRE_FORWARDER_ADDR=0x76c9cf548b4179F8901cda1f8623568b58215E62
CRE_WORKFLOW_OWNER=0x6aE4fE38dFbBc609D720b2f0814d72E1a94Cc104
KARWAN_HUB_ADDR=0xB874C290B82c0689De75Eaf9434774f83da138a6
CRE_ADAPTER_BINDER_ADDR=0xB434527FA2C7eA05313850FA03A976de05997Eff
CRE_FEES_PAYEE_ADDR=0x915Eb0772037cee5a92Fc775eE6c29406d128d9E
```

`CRE_WORKFLOW_OWNER` is the owner CRE recorded for `karwan-git-prod`
([DEPLOYMENT.md](./DEPLOYMENT.md)); a workflow deployed from the same CRE
organisation carries it. `CRE_FEES_PAYEE_ADDR` is the suite's fee recipient.

Rehearse, then broadcast, the adapter (Git Bash, from the repository root):

```bash
cd contracts && set -a && source .env.cre-deploy && set +a && forge script script/DeployCreAdapter.s.sol:DeployCreAdapter --rpc-url "$ARC_RPC"
```

```bash
cd contracts && set -a && source .env.cre-deploy && set +a && forge script script/DeployCreAdapter.s.sol:DeployCreAdapter --rpc-url "$ARC_RPC" --private-key "$DEPLOYER_KEY" --broadcast
```

Add the printed address to the env file as `CRE_ADAPTER_ADDR=0x...`, then the
fee contract the same way:

```bash
cd contracts && set -a && source .env.cre-deploy && set +a && forge script script/DeployCreFees.s.sol:DeployCreFees --rpc-url "$ARC_RPC" --private-key "$DEPLOYER_KEY" --broadcast
```

Send Claude both addresses and the two broadcast files under
`contracts/broadcast/`.

## 2. Production configs

Claude fills `cre/*/config.production.json` from step 1:

- `adapter` and, for `karwan-check`, `fees`;
- `families`: the Agreement escrow `0x55460D2b8b0D8067Ea33406b310224B5bd44F43C`;
- `verifiers`: the suite verifier `0xCD395b291bcEcbFd58a3b8253C70510dd7bdAAa8`,
  the deals `karwan-check` compares on;
- `gatewayKey` and `backendKey`: the address of `CRE_GATEWAY_SIGNER_KEY`, the
  key Karwan's backend signs HTTP triggers with.

A workflow's id depends on its config, so the configs are final before step 5.

## 3. Secrets

The values sit in `~/.karwan-cre-env` on node-services already
(`scripts/ops/env-put.sh`). Upload them to the Vault DON:

```bash
scripts/ops/cre-remote.sh exec -- /w/bin/cre secrets create secrets.suite.yaml --target production-settings
```

If the CLI asks for browser authorisation, run it again through `tty` with
`--secrets-auth=browser` and open the link it prints.

## 4. Free a registry slot

`karwan-git-prod` is the only workflow in the private registry, it has never
completed a hosted run, and the three suite workflows replace it. Deleting it is
permanent; the CLI asks for the name:

```bash
scripts/ops/cre-remote.sh tty -- /w/bin/cre workflow delete github-delivery --target production-settings
```

## 5. Deploy

Once per workflow, `karwan-risk` first:

```bash
scripts/ops/cre-remote.sh exec -- sh -c 'for d in shared karwan-risk; do (cd $d && bun install --frozen-lockfile >/dev/null); done && /w/bin/cre workflow deploy karwan-risk --target production-settings --yes'
```

```bash
scripts/ops/cre-remote.sh exec -- sh -c 'for d in shared karwan-check; do (cd $d && bun install --frozen-lockfile >/dev/null); done && /w/bin/cre workflow deploy karwan-check --target production-settings --yes'
```

```bash
scripts/ops/cre-remote.sh exec -- sh -c 'for d in shared karwan-record; do (cd $d && bun install --frozen-lockfile >/dev/null); done && /w/bin/cre workflow deploy karwan-record --target production-settings --yes'
```

Each prints `Workflow ID` and `Status: Active`. Send Claude the three ids and
the output of:

```bash
scripts/ops/cre-remote.sh exec -- /w/bin/cre workflow list --registry private
```

## 6. Queue the bindings

Claude runs `scripts/ops/cre-timelock-batch.mjs` with the adapter and the three
ids. It writes `contracts/deployments/cre-5042002-<date>.schedule.json` and
`.execute.json`: kinds 1 and 4 bound to `karwan-check`, 2 to `karwan-record`,
3 to `karwan-risk`, and `setIssuer(adapter, true)` on the hub, in one timelock
batch. Claude simulates the schedule call as the Safe before handing it over.

In the Safe app, open Transaction Builder on the owner Safe, load the schedule
file, and have three owners sign and run it.

## 7. Production backend

Add to the production `.env`, then deploy the backend with migration 48:

```
CRE_SUITE_ENABLED=1
CRE_CHECK_WORKFLOW_ID=<karwan-check id>
CRE_RECORD_WORKFLOW_ID=<karwan-record id>
CRE_RISK_WORKFLOW_ID=<karwan-risk id>
CRE_WORKFLOW_OWNER=0x6aE4fE38dFbBc609D720b2f0814d72E1a94Cc104
CRE_WORKFLOW_TOKEN=<the same token as the Vault DON secret>
CRE_GATEWAY_SIGNER_KEY=<key whose address is gatewayKey>
CRE_REGISTRY_RPC_URL=<an Ethereum mainnet RPC, to read the DON's keys>
CRE_ADAPTER_ADDR=<step 1>
CRE_FEES_ADDR=<step 1>
CRE_IDENTITY_ADDR=0x5409e859E1604b6Efa01827CCd3d2D7aaB1e3D5D
CRE_RELAYER_KEY=<a key holding a little USDC for gas, nothing else>
CRE_ARC_RPC_URL=https://rpc.testnet.arc.io
```

`CRE_ENABLED` stays off. `/api/cre` is served once `CRE_SUITE_ENABLED` is on;
`/api/x402/cre` also needs the check id, gateway key, adapter, identity, fee
contract and relayer, and is listed in `GET /api/x402` only then.

## 8. Run the bindings

After 24 hours, load the execute file in Transaction Builder and run it. Then
check on Arc that `bindingOf(1..4)` on the adapter returns each id and that the
hub lists the adapter as an issuer. From then on `karwan-risk` writes due
timeouts, a paid dry run releases its fee on a CRE answer, and `karwan-record`
can write a GitHub work fact.

## Evidence to keep

The broadcast files, the deploy output with each workflow id, the Safe
transactions, and one successful execution per workflow from the CRE UI. A
hosted execution is the first live CRE evidence; until then, say simulated.

## Live x402 dry run on a real Arc Testnet deal

Prepared 28 October 2026; run once the bindings execute (from 29 October
20:40 UTC). An agent for a deal's buyer pays 0.25 USDC over x402, Chainlink's
network replays the deal's agreed tests on GitHub, and its signed answer
releases the fee on Arc.

- `contracts/script/CreLiveDryRunDeal.s.sol` opens one 5 USDC deal on the
  suite's Agreement escrow with the replay fixture's policy
  (`0xd4a6ce8c…0a03`) as `checkPolicy` and the suite verifier, and the seller
  accepts it. A second run sends nothing.
- `backend/src/scripts/cre-seed-policy.ts` stores that policy in production so
  the workflow can fetch it by fingerprint; it writes nothing unless the
  fingerprint matches.
- `backend/src/scripts/cre-dry-run-agent.ts` is the agent: 402 offer, signed
  `ReceiveWithAuthorization`, 202, then Arc's fee run until it is released.
- Production settings (testnet `.env` only): `CRE_SUITE_ENABLED=1`, the three
  workflow ids, `CRE_WORKFLOW_OWNER`, `CRE_REGISTRY_RPC_URL`
  (`https://ethereum-rpc.publicnode.com`), `CRE_ADAPTER_ADDR`, `CRE_FEES_ADDR`,
  `CRE_IDENTITY_ADDR` (`0x5409…3D5D`), `CRE_VERIFIER_K_ADDR` (the suite
  verifier `0xCD39…AAa8`, so its deals count as having an agreed check),
  `CRE_ARC_RPC_URL`, and from node-services `CRE_WORKFLOW_TOKEN`,
  `CRE_GATEWAY_SIGNER_KEY` and `CRE_RELAYER_KEY` (relayer
  `0x0273707E2d2fcDf26092BE0b8307cEFd02FB5527`, about 1 USDC for gas).

Rehearsed 28 October on a fork of Arc Testnet at block 69,560,824 with
throwaway wallets: the deal script opened and accepted deal `0x5feab943…d6ec`
on the real suite state; Karwan's x402 route (built from these settings,
pointed at the fork) answered 402 with the fee contract as payee, took the
signed authorization, relayed `open` and held 0.25 USDC; with the gateway on a
closed port the run reported "not started" and refundable, as it should. The
same day a deliberately malformed request through Chainlink's real gateway,
signed with `CRE_GATEWAY_SIGNER_KEY`, ran `karwan-check` (execution
`e4ada571…e1f5`, SUCCESS, trigger only), so the gateway accepts Karwan's key.
Not rehearsed: the DON's signed write through the production forwarder, which
needs the bindings.
