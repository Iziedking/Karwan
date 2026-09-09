# Contracts

- `KarwanJobBoard.sol` — RFQ post, bid, counter-offer, accept
- `KarwanEscrow.sol` — milestone USDC custody
- `KarwanReputation.sol` — deal-outcome recording
- `KarwanEvidenceRegistry.sol` — non-custodial CRE delivery receipts

## Setup

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
forge install foundry-rs/forge-std
forge install OpenZeppelin/openzeppelin-contracts
```

## Build and test

```bash
forge build
forge test -vv
```

## Deployer wallet setup (one-time)

Karwan's contract deploys use a Foundry encrypted keystore for the deployer key,
not a plain-text CLI flag. The `circle:use-arc` skill flags `--private-key $KEY`
as unsafe for any non-local environment because the env var expands into the
process command line, leaving the key in shell history and `ps` output.

Set this up once on your machine:

```bash
# Imports the deployer private key into ~/.foundry/keystores/karwan-deployer
# encrypted with a password of your choice. Prompts for both.
cast wallet import karwan-deployer --interactive

# Confirm the resulting address. You pass this as --sender on every deploy.
cast wallet address --account karwan-deployer
```

Once the keystore is set up and you've test-deployed at least one contract with
the new flow, remove `DEPLOYER_PRIVATE_KEY` from `.env`. The raw key still
belongs in your password manager as a backup; nothing in this repo needs it as
an environment variable any more.

## Deploy to Arc Testnet

```bash
forge script script/Deploy.s.sol \
  --rpc-url https://rpc.testnet.arc.network \
  --account karwan-deployer \
  --sender <YOUR_DEPLOYER_ADDRESS> \
  --broadcast
```

Foundry prompts for the keystore password on each broadcast. The same pattern
applies to every script under `script/`: `DeployVault.s.sol`,
`DeployEscrow.s.sol`, `DeployTreasury.s.sol`. Each one
calls bare `vm.startBroadcast()` with no arguments, so the `--account` flag is
the only thing controlling who signs.

Inline env vars that the scripts read with `vm.envOr` / `vm.envAddress` (e.g.
`USYC_TELLER_ADDR` for the treasury deploy) keep working as before, since they
are values the script consumes, not signing material.

## Evidence registry on Arc Testnet

`KarwanEvidenceRegistry` is bound to one CRE workflow and has no custody,
upgrade, rescue, or ongoing admin role. Deployment uses a one-time workflow
binder because the final CRE workflow ID commits to the production config, and
that config contains the receiver address. Reports fail closed until the ID is
bound. After binding, the binder cannot replace it.

The scripts require these environment variables:

```text
CRE_FORWARDER_ADDR=
CRE_WORKFLOW_OWNER=
CRE_WORKFLOW_ID=
CRE_WORKFLOW_NAME=karwan-git-prod
EVIDENCE_REGISTRY_BINDER_ADDR=
KARWAN_EVIDENCE_REGISTRY_ADDR=
```

Before deploying, the owner must run the authenticated tenant-scoped CRE chain
directory and confirm that Arc Testnet's production `forwarderAddress` is the
address pinned in `EvidenceRegistryDeploymentConfig.sol`. The script rejects
the known Arc simulation forwarder and any unreviewed production address.

Run the deploy script once without `--broadcast`. This is a Foundry simulation,
not an Arc transaction:

```bash
forge script script/DeployEvidenceRegistry.s.sol:DeployEvidenceRegistry \
  --rpc-url arc_testnet \
  --account karwan-deployer \
  --sender "$EVIDENCE_REGISTRY_BINDER_ADDR"
```

Only after reviewing that output, the owner may repeat the exact command with
`--broadcast`. Put the resulting address into the final CRE production config,
including `writeReport: true`, then calculate the final workflow hash. Set that
hash as `CRE_WORKFLOW_ID` before running the binding script.

Rehearse the binding without `--broadcast`, then let the one-time binder repeat
the exact command with `--broadcast`:

```bash
forge script script/BindEvidenceRegistryWorkflow.s.sol:BindEvidenceRegistryWorkflow \
  --rpc-url arc_testnet \
  --account karwan-deployer \
  --sender "$EVIDENCE_REGISTRY_BINDER_ADDR"
```

Finally, run the read-only verifier. It checks bytecode, all workflow identity
fields, Arc chain ID, and ERC-165/IReceiver support, then reports any native
balance without treating forced native transfers as authority. It never starts
a broadcast:

```bash
forge script script/VerifyEvidenceRegistry.s.sol:VerifyEvidenceRegistry \
  --rpc-url arc_testnet
```

If the production workflow config, owner, name, or forwarder changes after the
ID is bound, deploy a new registry. The existing registry deliberately has no
mutation path for replacing its trust identity.
