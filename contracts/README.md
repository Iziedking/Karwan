# Contracts

- `KarwanJobBoard.sol` — RFQ post, bid, counter-offer, accept
- `KarwanEscrow.sol` — milestone USDC custody
- `KarwanReputation.sol` — deal-outcome recording

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
