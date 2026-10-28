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
