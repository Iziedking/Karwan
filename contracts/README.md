# Contracts

- `KarwanJobBoard.sol` — RFQ post, bid, counter-offer, accept
- `KarwanEscrow.sol` — milestone USDC custody
- `KarwanReputation.sol` — deal-outcome recording

## Setup

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
forge install foundry-rs/forge-std --no-commit
forge install OpenZeppelin/openzeppelin-contracts --no-commit
```

## Build and test

```bash
forge build
forge test -vv
```

## Deploy to Arc Testnet

```bash
forge script script/Deploy.s.sol \
  --rpc-url arc_testnet \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --broadcast
```
