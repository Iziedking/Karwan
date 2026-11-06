# Arc and Circle checks

Internal. Before any code that touches Arc or a Circle product (contracts, chain reads and writes, wallets, Gateway, CCTP and bridging, x402, CRE, Circle SDKs and APIs), add an entry here **before writing the code** (karwan skill, `references/build.md`, rule 14). The build gate refuses to end a turn that changed Arc or Circle code without a new entry in this file.

If the docs, the installed SDK and the read-only test disagree, stop and report it to the owner. Do not write code around the disagreement.

## Entry template

```
### YYYY-MM-DD · <what is being built> · <track and roadmap item>

- Docs: <URL or MCP source (arc-docs, circle)>, read <date>. What they say: <one line>.
- Installed SDK: <package>@<version from node_modules/<package>/package.json>. What it exposes: <one line>.
- Read-only test: <exact command or script, network> → <result, with a tx hash, block or response id where there is one>.
- Agree: yes / no. If no: what differs, and the owner's decision.
```

## Entries

### 2026-10-18 · Ignyte rehearsal deploy of the contract suite and one financed trade (contracts/script/IgnyteTradeScenario.s.sol) · T4 trade finance, Milestone 1, moved earlier by the Ignyte Track 2 demo

- Docs: arc-docs MCP, read 2026-10-18. `arc/references/rpc-endpoints` and `arc/references/connect-to-arc`: Arc Testnet chain id 5042002, RPC `https://rpc.testnet.arc.io`, explorer `https://explorer.testnet.arc.io`, gas paid in USDC. `arc/references/contract-addresses`: USDC ERC-20 interface `0x3600000000000000000000000000000000000000`, 6 decimals (the native gas balance uses 18). `arc/tutorials/deploy-on-arc`: deploy with `arc-forge`, verify with `arc-forge verify-contract <addr> <path:Name> --chain-id 5042002 --verifier blockscout --verifier-url https://explorer.testnet.arc.io/api/`, constructor arguments with `--constructor-args`.
- Installed SDK: Arc Foundry v0.8.0-2 (tarball sha256 088bdb96…a79556, pinned in scripts/ops/forge-remote.sh and arc-fork.sh), the latest release on github.com/circlefin/arc-foundry (published 2026-09-18). Upstream Foundry v1.7.1 in the forge-remote.sh image. Contracts compile with solc 0.8.28, via_ir, optimizer runs 1 (contracts/foundry.toml).
- Read-only test: `eth_chainId` on `https://rpc.testnet.arc.io` → `0x4cef52` (5042002); `eth_call decimals()` on `0x3600…0000` → 6; `eth_blockNumber` → `0x40af4f5`; explorer `https://explorer.testnet.arc.io/api/v2/stats` → HTTP 200. The same calls on `https://rpc.testnet.arc.network` (used by scripts/ops/arc-fork.sh and older scripts) get no answer: the host no longer resolves.
- Agree: yes for chain id, USDC address and decimals, explorer and verification. The repo's old RPC host `rpc.testnet.arc.network` disagrees with the docs and is dead; this work uses the documented `rpc.testnet.arc.io`. Owner to decide whether to update arc-fork.sh and the other scripts that still name the old host.
- Verification in practice (after the broadcast, 2026-10-18): all 12 sources verified on the explorer. Three things the docs do not say. `forge script --verify` fails before submitting because contracts/foundry.toml `[etherscan] arc_testnet` reads `${ARCSCAN_API_KEY}` and still points at the old `testnet.arcscan.app`; any value for the variable gets past it, Blockscout ignores the key. The explorer answers "Too many requests" to forge's is-verified pre-check and to repeated submissions; `--skip-is-verified-check` and spacing submissions out got 11 through. KarwanHub was refused that way 14 times from node-services and went through at once from another address via Blockscout's own API (`POST /api/v2/smart-contracts/<addr>/verification/via/standard-input` with the `forge verify-contract --show-standard-json-input` file).

### 2026-10-18 · One market: `tradesAs` added to `UserSettings` in frontend/core/api.ts · T1 Find and agree, T1.1

- Docs: not needed. The change is two lines in a TypeScript interface for a profile setting (`tradesAs?: 'self' | 'business'`); it adds no call to Arc, a contract, a wallet or any Circle product. The gate flagged the file because `core/api.ts` also holds Arc and Circle client calls, none of which changed (`git diff HEAD -- frontend/core/api.ts` is the interface lines only).
- Installed SDK: not used by this change.
- Read-only test: not applicable; no chain or Circle read or write was added.
- Agree: n/a. No Arc or Circle code written.

### 2026-10-18 · Arc Testnet endpoints moved to the documented hosts across backend, frontend, CRE and scripts; foundry.toml verification entry · Foundation (chain config), found by the T4 Milestone 1 rehearsal

- Docs: arc-docs MCP, read 2026-10-18. `arc/references/rpc-endpoints`: testnet HTTP `https://rpc.testnet.arc.io`, WebSocket `wss://rpc.testnet.arc.io`, also Blockdaemon, dRPC (`rpc.drpc.testnet.arc.io`) and QuickNode under `*.testnet.arc.io`; mainnet `https://rpc.mainnet.arc.io` and `wss://rpc.mainnet.arc.io`; explorers `explorer.testnet.arc.io` and `explorer.arc.io`. `arc/tutorials/deploy-on-arc`: verification through Blockscout at `https://explorer.testnet.arc.io/api/`, no API key.
- Installed SDK: viem 2.55.11 (frontend, pinned) and 2.56.3 (cre workflows). Both ship `arcTestnet` with the old hosts (`rpc.testnet.arc.network`, `rpc.quicknode.testnet.arc.network`, `rpc.blockdaemon.testnet.arc.network`, explorer `testnet.arcscan.app`), and `arc` (mainnet) with an empty RPC list. The app must not rely on those defaults: they are what a wallet receives in `wallet_addEthereumChain`.
- Read-only test, laptop and node-services: `eth_chainId` → `0x4cef52` on `rpc.testnet.arc.io`, `rpc.quicknode.testnet.arc.io`, `rpc.blockdaemon.testnet.arc.io`, `rpc.drpc.testnet.arc.io`, `arc-testnet.drpc.org`; no answer (DNS) from `rpc.testnet.arc.network`, `rpc.quicknode.testnet.arc.network`, `rpc.blockdaemon.testnet.arc.network`. WebSocket upgrade on `rpc.testnet.arc.io` → 101. `testnet.arcscan.app/tx/<hash>` → 301 to the same path on `explorer.testnet.arc.io`, so old explorer links still land.
- Live testnet backend (karwan-vm, read only, hostnames only): `ARC_TESTNET_RPC_URLS` lists the dead host third behind two healthy ones and `ARC_TESTNET_WSS_URL` names the dead host; the WSS list only feeds chain metadata, no transport opens it, and the last 6 hours of logs hold no DNS errors. Not an outage; the env change is the owner's.
- Agree: yes. Docs, probes and the deployed explorer agree on the `*.arc.io` hosts. The code defaults and viem's chain definitions are what disagree, and this change replaces them.

### 2026-10-18 · Delivery-check add-on to the Ignyte rehearsal (contracts/script/IgnyteCheckScenario.s.sol) · T4 trade finance, Milestone 1 (the proof-of-delivery trigger as a check)

- Docs: as in the rehearsal entry above, read 2026-10-18 (chain id 5042002, `rpc.testnet.arc.io`, USDC `0x3600…0000` with 6 decimals, Blockscout verification at `explorer.testnet.arc.io/api/`). No new Arc or Circle surface: the add-on deploys one `KarwanCheckVerifier` from `contracts/src` unchanged and calls the rehearsal hub and escrow already on chain.
- Installed SDK: Arc Foundry v0.8.0-2 on node-services (tarball sha256 checked), solc 0.8.28.
- Read-only test: `forge script` simulation against live Arc Testnet with the owner's keys and a throwaway checker key generated on node-services (0.5 USDC order, all assertions green, about 1.51 USDC of gas); then a broadcast to a scratch anvil fork only (port 8549, separate broadcast dir, deleted after) that `build_deployment.py --check-broadcast` turned into a 7 of 7 record. Live balances unchanged afterwards.
- Agree: yes. Before the check the escrow's review end is delivery + start longstop + review window; the checker's pass on the same bill of lading fingerprint starts the review at once, as `AgreementCheck.t.sol` asserts.

### 2026-10-18 · Source for the endpoint move, and the node release that came with it · Foundation

- Source (owner, 18 Oct): Circle's Arc announcement of 7 Oct 2026, "Arc update: v0.8.1 release and legacy RPC URL deprecation": the legacy `arc.network` Testnet RPC URLs stop working after 15 October 2026 (brownout on 8 October); integrations move to the matching `.arc.io` endpoints; `snapshots.arc.network` stays; Arc Mainnet only ever used `arc.io`. docs.arc.io `arc/references/rpc-endpoints` shows the same testnet table used in the entries above.
- Other `arc.network` names in the repo: `docs.arc.network` and `community.arc.network` answer 301 to `docs.arc.io` and `community.arc.io`. The site footer link now names `docs.arc.io`; newsletter and signal test fixtures keep the old URLs as content.
- Our nodes on node-services (read only): Arc Mainnet and Arc Testnet run arc-node v0.8.0 (commit 66ad2d5), both following `*.arc.io` upstreams and in sync (mainnet equal to `rpc.mainnet.arc.io` at 0x196503a, testnet 2 blocks behind). Release v0.8.1 (published 2026-10-07) holds one fix, "fix(pq-precompile): reserve base gas before decoding input" (circlefin/arc-node#486), and Circle asks operators to upgrade as soon as possible. Linux x86_64 tarball sha256 `04127c5bb9488de743755b5089f4434c335cf349386d5d01347abfbc402d932a`. The upgrade restarts the node behind `rpc.karwan.site`, so it is the owner's to run.
- Agree: yes. The announcement, the docs and the probes agree.
- 2026-10-18, testnet node upgraded by the owner: arc-node-execution and arc-node-consensus report v0.8.1 (tarball sha256 checked), both services active, height level with `rpc.testnet.arc.io` within one block over 15 s. Consensus logs "Failed to fetch certificates … 429 Too Many Requests" from the public upstreams at the same rate as on v0.8.0 (about 300 per 10 minutes before and after the restart; the mainnet node on v0.8.0 shows the same warning), so it is upstream rate limiting, not the release. v0.8.0 binaries kept as `*.v0.8.0` beside the new ones.
- 2026-10-18, mainnet node upgraded by the owner: execution and consensus report v0.8.1, arc-node-execution, arc-node-consensus and arc-rpc-allowlist active, height level with `rpc.mainnet.arc.io` within one block over 15 s, karwan-api-mainnet healthy with no RPC errors in its log. Startup warnings were the usual restart ones. One standing warning to review: the execution node is started with `--public-api` while `--http.api` includes `txpool,trace,debug`.
- 2026-10-18, delivery check broadcast by the owner on Arc Testnet: KarwanCheckVerifier `0x871943E469F87685C69997093bc231c5B66BbcBF` (one checker `0xe0771626abd0331403b0eac982ab52b5235715ec`, threshold one) deployed, registered on the rehearsal hub and source-verified through Blockscout with no API key (the foundry.toml change works in practice). Checked order `0x390a…53c8`: buyer paid 20.1 USDC, bill of lading fingerprint `0x81bf…7f7a` posted, the checker's pass on the same fingerprint started the 3-day review, buyer released 19.9 USDC to the supplier and 0.2 fee, completed outcomes on identities 1 and 2. All 7 hashes checked against the explorer API: sender, target, method and block match.

### 2026-10-18 · Get paid now on the new deal page: the factoring accept call moved to frontend/features/factoring/acceptOffer.ts, shared by the old banner and the new GetPaidNow section · T4 trade finance, T4.3

- Docs: no Arc or Circle behaviour changed. The call is the existing `KarwanInvoiceRegistry.assignReceivable`, same ABI and arguments, moved unchanged into a shared module; Circle sellers still have it signed by the backend from their identity wallet.
- Installed SDK: viem 2.55.11 (node_modules/viem/package.json), used through wagmi's wallet client as before.
- Read-only test, 18 Oct 2026 on `https://rpc.testnet.arc.io`: `authorizedAssigners(0xFb0D…C649)` on escrow `0x0262…2B63` returned true; both contracts have code. The August factoring trade's advance (`0x4fea…e60d`) and release (`0x6dd1…9ea2`, financier repaid 200 USDC first) read back from the explorer API.
- Agree: yes.

### 2026-10-18 · The website's Arc RPC list splits a comma-separated NEXT_PUBLIC_ARC_RPC_URL and drops retired arc.network hosts (frontend/core/arcNetwork.ts) · Foundation, found in the T4 rehearsal (business balance showed "-")

- Docs: arc-docs, read 18 Oct 2026 (entry above): Arc Testnet RPC `https://rpc.testnet.arc.io`; the `arc.network` RPC hosts stopped after 15 Oct 2026 (Circle's Arc announcement, 7 Oct).
- Installed SDK: viem 2.55.11 and wagmi, unchanged; only the URL list fed to wagmi's fallback transport changes.
- Read-only test, 18 Oct 2026: `eth_getBalance` for `0x6b51…4922` on `https://rpc.testnet.arc.io` returned 160.715 USDC; a POST with `Origin: https://testnet.karwan.site` answered 200 with `access-control-allow-origin: https://testnet.karwan.site`; `rpc.drpc.testnet.arc.io` answered 200 with `*`; `rpc.testnet.arc.network` did not answer. In the owner's browser the deployed site sent the whole comma list as one URL to the dedicated provider (401) while an extension blocked the public hosts (ERR_BLOCKED_BY_CLIENT).
- Agree: yes. Owner action: set NEXT_PUBLIC_ARC_RPC_URL on Vercel to the dedicated URL alone; the code now copes with a list either way.

### 2026-10-18 · A factoring repayment the escrow paid in parts is recorded one verified payment per release (backend/src/money/repaymentProof.ts, financing.ts) · T4 trade finance, T4.3

- Docs: arc-docs `arc/references/usdc-system-events` and `arc/references/contract-addresses`, read 18 Oct 2026: the ERC-20 USDC interface `0x3600…0000` emits its own `Transfer(from, to, value)` with 6 decimals for ERC-20 activity, and an ERC-20 `transfer()` also logs from the system emitter `0xffff…fffe` at 18 decimals; match on the emitter so nothing counts twice. The escrow pays through the ERC-20 interface, and the code matches only on `0x3600…0000` at 6 decimals, as before.
- Installed SDK: viem 2.55.11 (node_modules/viem/package.json), `parseEventLogs` with `erc20Abi`, unchanged.
- Read-only test, 18 Oct 2026 on `https://rpc.testnet.arc.io`: offer b6ed1b88 (500 USDC owed, escrow `0x0262…2B63`, financier `0xa045…03c5`). Of the deal's six recorded transactions, two carry escrow-to-financier transfers: `0x93c9774b…` 496.25 USDC (block 67885577) and `0x1e611e68…` 3.75 USDC (block 67885603). The real `repaymentProof` returns both parts; each receipt is a success, has the escrow as target and holds an exact transfer at its own amount, which is the check `recordVerifiedFinancingMovement` applies. The previous build failed that check because it asked the 3.75 release for the whole 500.
- Agree: yes.

### 2026-10-20 · One balance for the page and the assistant: the App Kit unified-balance read moved unchanged from routes/gateway.ts to backend/src/gateway/pooledBalance.ts, read by backend/src/money/ownedBalance.ts (GET /api/money/balance, assistant get_my_balance) · T5 money, found from the owner's report that the Telegram agent's balance did not match the balance page

- Docs: arc-docs, read 20 Oct 2026. `app-kit/references/sdk-reference#getbalancesresult` and `app-kit/tutorials/unified-balance/check-unified-balance`: `kit.unifiedBalance.getBalances({ sources, networkType, includePending })` returns `totalConfirmedBalance` (human-readable decimal string across all accounts and chains), `totalPendingBalance` when `includePending` is true, and a per-depositor, per-chain `breakdown` with `confirmedBalance` and `pendingBalance`. Circle's developer docs now point App Kit questions to docs.arc.io.
- Installed SDK: @circle-fin/app-kit@1.15.2 (node_modules/@circle-fin/app-kit/package.json, pinned in backend/package.json). Same call, same arguments and same address-only source as before the move; viem 2.55.11 for the USDC `balanceOf` reads on the seven other chains and Arc, unchanged.
- Read-only test, 20 Oct 2026, `npx tsx pooled-probe.mts 0xa045e8104bc066fff5bfc673abf354871edc03c5` (scratchpad script importing the new readPooledBalance and the existing readSourceUsdcBalance): pooled `confirmed 121.349817`, `pending 0.000000`, 12 chains in the breakdown (Ethereum 41.07, Arbitrum 29.95, Optimism 20.00, Avalanche 20.00, Unichain 10.00, Arc 0.17, Base 0.16), 869 ms; Base Sepolia wallet USDC 25.634193. The pooled figure is exactly the 121.35 by which the balance page (832.32 in the wallet on Arc) exceeded the assistant's 710.97: the page read the sign-in wallet's pool through App Kit, the assistant read `record.gatewayWallet` on Arc only. The Base figure matches the page's Base row (25.63).
- Agree: yes. Docs, SDK and the live read agree; the disagreement was between our two surfaces, which now share one reader. The router's spend path (`gateway/router.ts readSpendable`) is unchanged.

### 2026-10-20 · A financing offer is checked against the financier's USDC before it goes out, and accepting checks it again (backend/src/routes/factoring.ts) · T4 trade finance, T4.3, found from the owner's report that accepting an offer failed with "The offer was not accepted and is still open"

- Docs: arc-docs `arc/references/contract-addresses` and `arc/references/usdc-system-events` (entries of 18 Oct, unchanged): USDC's ERC-20 interface on Arc is `0x3600…0000` with 6 decimals; `balanceOf` is the spendable ERC-20 balance the EIP-3009 advance draws on.
- Installed SDK: viem 2.55.11 (node_modules/viem/package.json); the check uses the existing `readUsdcBalance` (`balanceOf` on the configured USDC), no new calls.
- Read-only test, 20 Oct 2026 on `https://rpc.testnet.arc.io` (scratchpad usdc-probe.mts): financier `0xa045…03c5` holds 310.972208 USDC, `decimals()` 6. The two offers the seller could not accept advanced 880 and 815 USDC, so `assignReceivable`'s transfer of the advance could not succeed: the cause of the failed accept.
- Agree: yes.

### 2026-10-22 · The pooled Gateway balance is read once per page and the Arc row waits for it (frontend/features/gateway/useGatewayBalance.ts, features/balances/components/BalancesCard.tsx) · foundation, found in the platform audit (audit H2/M1): /api/gateway/balance was requested four times per page and the wallet page showed Arc without the pool until the pool arrived

- Docs: Circle developer docs, read 22 Oct 2026. `gateway/references/technical-guide` "Check balances": the balance Gateway reports is what is available to transfer at once. `gateway/nanopayments/howtos/x402-buyer` "Understand deposit finality": a deposit becomes available after block confirmations (Arc Testnet about 0.5 s). Our `confirmed` is that available figure and `pending` is not yet spendable, as the hook already documents.
- Installed SDK: @circle-fin/app-kit@1.15.2 and @circle-fin/unified-balance-kit@1.7.0 (node_modules/*/package.json). No SDK call changed: the frontend still reads our own `GET /api/gateway/balance`, which reads the pool through backend/src/gateway/pooledBalance.ts (entry of 20 Oct). Only the browser-side caching changed, from a per-component state to one shared react-query entry with a 30 s stale time, matching the backend's 30 s cache.
- Read-only test, 22 Oct 2026, signed-in `GET https://api.karwan.site/api/gateway/balance` for @lawful (0x7711…5a35) from the in-app browser: 200 in 781 ms, `confirmed "50.000000"`, `pending "0.000000"`. That is exactly the 50.00 by which the wallet page's "In your wallet on Arc" (159.51) exceeded the Arc row of "By chain" (109.51), so the two figures differed only while the pool had not loaded.
- Agree: yes.

### 2026-10-22 · Send uses the whole balance: when the Arc wallet alone is short, the shortfall moves from the pooled Gateway balance into the account's own wallet first (backend/src/gateway/walletTopUp.ts, gateway/spend.ts topUpWalletFromGateway, POST /api/gateway/to-wallet) · T5 money, architecture view 22, approved by the owner 22 Oct 2026

- Docs: arc-docs `app-kit/concepts/unified-balance-fees`, read 22 Oct 2026: a spend whose source and destination are the same chain pays no Gateway fee; the Forwarding Service fee is taken from the minted amount, while gas and provider fees come out of the pooled balance. So the top-up adds the forwarder fee on top of the shortfall, rounds up to the cent, and requires the pool to cover gas and provider fees as well.
- Installed SDK: @circle-fin/app-kit@1.15.2 (node_modules/@circle-fin/app-kit/package.json). `kit.unifiedBalance.estimateSpend` returns FeeEntry items typed `forwarder`, `provider`, `gasFee` and `kit` (unifiedBalance.d.ts); `kit.unifiedBalance.spend` is the same call already used to fund an agent from the pool, here with the account's own address as recipient.
- Read-only and live test: not run from this session, which cannot move money on the hosted testnet. The owner runs it after deploy: 0.10 USDC from @lawful's pool to @lawful's own wallet on Arc Testnet, both balances read before and after.
- Agree: yes on docs and SDK; live behaviour not verified yet.
- Correction, 22 Oct 2026, from the owner's first live send (50 USDC, nothing moved): the testnet log read "you have no pooled balance to draw on" for 0x7711…5a35 and 0xa045…03c5, and a read-only query of the testnet `agent_wallets` table shows 0 of 117 accounts hold a `gatewayWallet`. The pool the page shows (GET /api/gateway/balance) is deposited under the sign-in wallet itself, and a Gateway spend needs the depositor's own EOA signature (frontend/features/gateway/lib.ts, rule already followed by the agent top-up). So a wallet account now signs the top-up in the browser: `kit.unifiedBalance.estimateSpend` then `spend` with the browser adapter (@circle-fin/adapter-viem-v2 `createViemAdapterFromProvider`), recipient its own address, forwarder fee added on top. The server route stays for a server-held Gateway wallet. Live test still the owner's.

### 2026-10-23 · View 23 (the pool works under the hood): arrivals from other chains into a Karwan-held pool · T5 money, approved 23 Oct, STOPPED before code

- Docs: arc-docs, read 23 Oct 2026. `app-kit/unified-balance#what-to-know-about-wallet-models`: Circle Wallets SCAs cannot sign their own spends; an authorized EOA must sign. `app-kit/tutorials/unified-balance/manage-delegates#poll-until-ready` and `arc/concepts/deterministic-finality`: a standard deposit is spendable only after source-chain finality, up to about 15 minutes on Ethereum, Base and Arbitrum (Arc and Avalanche near-instant). `app-kit/tutorials/unified-balance/use-fast-deposits`: a fast deposit settles quickly but only from Arbitrum, Codex, Ethereum, Ink, Linea, OP Mainnet, Plume, Unichain and World Chain (not Base, not Solana), only into Arc, Avalanche or Polygon PoS, and charges a USDC forwarder fee on top of source gas.
- Installed SDK: @circle-fin/app-kit 1.15.2; `unifiedBalance.depositFor`, `estimateDeposit` and `deposit` with `config.transferSpeed` are in its typings.
- Code read: email identity wallets are SCAs (backend/src/circle/wallets.ts, `accountType: 'SCA'`); `provisionGatewayWallet` makes that SCA the pool owner and never saves it to the record, so `gateway/spend.ts` finds no owner. Today arrivals reach the Arc wallet by CCTP (circle/depositRouter.ts).
- Agree: NO. A pool fed by standard deposits makes arrivals slower (minutes instead of CCTP Fast's seconds); a fast deposit is as fast but excludes Base and Solana and adds a fee, and every later Arc spend from the pool pays the forwarder fee again to reach the wallet. Reported to the owner before any code.

### 2026-10-23 · Pool spends signed by the wallet that owns the pool; email and passkey accounts hold no pool (frontend features/gateway/useGatewayBalance.ts, features/money/hooks/useMoneyMove.ts, features/gateway/TopUpFromGateway.tsx, features/bridge/components/CrossChainFlow.tsx, features/deposit/components/FundAgentFromBalance.tsx) · T5 money, owner decision 23 Oct after view 23 was dropped

- Docs: arc-docs, read 23 Oct 2026 (entry above): only a plain wallet (EOA) can sign a Unified Balance spend; Circle Wallets SCAs need a delegate. `app-kit/tutorials/unified-balance/estimate-spend-fees`: `estimateSpend` takes the same parameters as `spend`. `app-kit/concepts/unified-balance-fees`: the forwarder fee comes out of the minted amount, so it is added on top.
- Installed SDK: @circle-fin/app-kit 1.15.2 with @circle-fin/adapter-viem-v2 `createViemAdapterFromProvider`, the browser path the bridge page's Gateway rail already uses (frontend/features/gateway/lib.ts).
- Read-only check, 23 Oct 2026: testnet `agent_wallets` has 0 of 117 rows with `gatewayWallet`, so no server-signed spend could ever succeed; the pool the balance page shows is under the sign-in wallet (GET /api/gateway/balance). Email accounts' "fund agent from balance" called the pool route and so failed; it now funds from their Arc wallet (`POST /api/activation/fund-agent`), the same route the quick sheet already used.
- Live test not run from this session: the owner, signed in with a web3 wallet holding a pool, tops up an agent from it and sends more than the wallet holds; each asks for one wallet confirmation.
- Agree: yes.

### 2026-10-23 · Mutation batch two: tests, the triage file, and the unused `_account` removed from the settlement base (contracts/src/suite/KarwanSettlementBase.sol, contracts/test/suite/mocks/BlocklistToken.sol, MUTATION_TRIAGE.md, SLITHER_TRIAGE.md) · T2 protected deals, T2.1 gate step 6

- Docs: not needed. Nothing here calls Arc, USDC or any Circle product, or changes how the contracts do. `KarwanSettlementBase.sol` loses one internal view, `_account`, that nothing called (`git diff HEAD -- contracts/src/suite/KarwanSettlementBase.sol` is those four lines only). `BlocklistToken.sol` gains `BonusToken`, a test token that delivers 1% more than asked, used only to test the yield pool against a token that is not USDC; the existing USDC-like blocklist token is unchanged. The two triage files are text. The gate flagged them because the files name USDC.
- Installed SDK: not used. Read-only test: not needed; the suite's tests, including the Arc fork tests, run in the plan's gates.
- Agree: n/a.
- Live test, 23 Oct 2026, by the owner on Arc Testnet: a web3 wallet holding about 34 USDC in its Arc wallet and its own pool sent 50 USDC to @lawful. The wallet signed the top-up from its pool, then the send went out; the screen confirmed "50.00 USDC sent to @lawful". The browser-signed pool spend works live.

### 2026-10-23 · View 25 (pay strangers safely): protected payments on the x402 auth-capture escrow, and a check before paying · T2 protected deals and T3 reputation, spec stage, no code

- Docs: x402 `specs/schemes/auth-capture/scheme_auth_capture_evm.md` (x402-foundation main, read 23 Oct 2026): the payer signs once (ERC-3009 or Permit2) and the money is held in the canonical AuthCaptureEscrow; under `operatorType: "delegated"` the facilitator is the operator (`extra.captureAuthorizer`) and `capture`, `void`, `refund` and `charge` need an EIP-712 signature from `extra.receiverAuthorizer`, which the server chooses and which may be an address the facilitator advertises; partial capture is allowed; the payer alone can `reclaim` after `authorizationExpiry` (the capture deadline); `refund` after capture under delegated needs an out-of-band funding agreement; a zero fee receiver requires 0 bps. `"policy"` is reserved, not specified. Open proposals #2222 (generic escrow scheme) and #3720 (release on a third party's signed acceptance) show capture is otherwise decided by the server alone.
- arc-docs, read 23 Oct 2026: `build/ecommerce` and `arc/references/sample-applications` list an Arc e-commerce sample on the Commerce Payments Protocol (escrow checkout). Circle docs `gateway/nanopayments/concepts/x402`: Nanopayments uses only the `exact` scheme, so protected payments are not batched or gasless.
- Read-only test, 23 Oct 2026, Arc Testnet (chain 0x4cef52 = 5042002) by `eth_getCode`: AuthCaptureEscrow v1.1 0xf96815976523E00e65Be8f34cA5e64b4f41EB19c has 10,978 bytes; ERC-3009 collector 0x8612…ab88 3,982; Permit2 collector 0xD698…446e 4,049; operator refund collector 0x7a03…a486 844; v1.0 escrow 0xBdEA…0cff 11,053; Permit2 0x0000…8BA3 9,152. Arc USDC 0x3600…0000 answers `authorizationState` (ERC-3009).
- Installed SDK: @x402/evm 2.14.0 and @x402/core 2.14.0 (root node_modules); `@x402/evm` ships only the auth-capture client (`AuthCaptureEvmScheme`). The latest, 2.28.0 (29 Sep 2026), also ships only the client; the facilitator side exists in the Go module (`go/v2/mechanisms/evm/auth-capture`). Karwan would write the facilitator side.
- Agree: yes, the pieces exist on Arc Testnet. Not verified: that the deployed bytecode matches the published v1.1 source (compare with the Base deployment before any money moves), and a live authorize, capture and void.

### 2026-10-23 · Plan 7c: the endgame suite's deploy, with the hub owned by KarwanTimelock from construction and owner, guardian and reviewer Safes · T2 protected deals, T2.1 (deploy wiring), owner decisions 23 Oct

- Docs: arc-docs MCP, read 2026-10-23. `integrate/exchanges/custody` ("Multi-sig wallets (SAFE)"): Safe contracts deploy and operate on Arc without modification, same factory addresses, same proxy pattern and signature checks, one on-chain confirmation; the Safe web interface takes Arc as a custom network. `arc/concepts/transaction-memos`: Safe and other contract wallets are ordinary callers. `integrate/infrastructure/bridges`: the CREATE2 factory sits at the standard address.
- Installed SDK: none for this check. The deploy runs with Foundry v1.7.1 (pinned image in scripts/ops/forge-remote.sh) and, for the Arc fork, Arc Foundry v0.8.0-2 (entry of 2026-10-18).
- Read-only test: `eth_getCode` on `https://rpc.testnet.arc.io` at block `0x417931d`, 23 Oct 2026 07:24 UTC, for the Safe v1.4.1 deployment: SafeProxyFactory `0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67` 3,054 bytes; SafeL2 `0x29fcB43b46531BcA003ddC8FCB67FFE91900C762` 24,421; Safe `0x41675C099F32341bf84BFc5382aF534df5C7461a` 23,579; MultiSendCallOnly `0x9641d764fc13c8B624c04430C7356C1C7C8102e2` 410; CompatibilityFallbackHandler `0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99` 5,637; CreateCall `0x9b35Af71d77eaf8d7e40252370304687390A1A52` 1,099.
- Agree: yes. Arc mainnet is out of this plan's scope and gets its own read before any mainnet deploy.

## 2026-10-23 Safe{Wallet} on Arc Testnet (plan 7c Task 4)

- Checked: Safe config service `https://safe-config.safe.global/api/v1/chains/5042002/`.
- Found: Arc Testnet is an official Safe{Wallet} chain (shortName `arc-testnet`, transaction service `https://api.safe.global/tx-service/arc-testnet`, explorer testnet.arcscan.app). Arc mainnet 5042 is listed too. Recommended Safe version there is 1.5.0; the rehearsal drove 1.4.1 through the same execTransaction/getOwners/getThreshold/nonce calls.
- Consequence: the owner creates Safes at app.safe.global with no custom network. Also checked 23 Oct: the public RPC no longer serves full state at block 66719638; Arc fork pin moved to 68661248.
- Docs: not needed.

## 2026-10-23 · Round 2 follow-up and view 26 (no Arc or Circle change)

- `frontend/features/bridge/components/CrossChainFlow.tsx`: one text space added before the "USDC" label beside the amount input, so screen readers and copied text read "50 USDC". No call, chain, SDK or amount logic changed. No docs or SDK check needed.
- View 26 (ways you deal) changes matching and settings only; no contract, chain or Circle call. Shapes offered are the four the live v3 escrow already holds.
- `contracts/deployments/endgame-5042002.config.json` is another session's file, not touched here.

## 2026-10-23 · New look, sign-in and Home (no Arc or Circle change)

- This session changed only colours, layout and copy on sign-in, waitlist and Home. No chain, SDK, contract or Circle call changed; the sign-in steps (email lookup, code, passkey, wallet) are the existing ones.
- `contracts/deployments/endgame-5042002*.json` belong to the other session's deploy work and were not touched here; their checks are that session's to record.

## 2026-10-23 · Money and Send in the new look (no Arc or Circle change)

- Changed only layout, words and button shapes on the balance page, Send and the shared money controls. The balance figures still come from the same reads; no chain, SDK, contract or Circle call changed.
- `contracts/script/suite/EndgameRoles.sol` is the other session's deploy work, not touched here.

## 2026-10-23 Deploy config loader range checks (plan 7c final review)

- Change: `contracts/script/suite/EndgameConfig.sol` refuses config numbers wider than their field instead of wrapping them. Input validation only; no new Arc call, address or SDK use.
- Read-only test, Arc Testnet block 0x4189ae8: timelock 0xB434527FA2C7eA05313850FA03A976de05997Eff `getMinDelay()` = 86400; hub 0xB874C290B82c0689De75Eaf9434774f83da138a6 `owner()` = the timelock. Matches the deployed record.
- Docs: not needed (no Arc or Circle behaviour involved). SDK: none touched.

## 2026-10-23 Deploy and scenario script fixes (plan 7c deferred minors)

- Change: DeployEndgame refuses to deploy over a recorded deployment and takes the config path as an argument; the config loader refuses a delay under 48 hours on Arc mainnet (chain 5042); CheckEndgame always reruns the deploy checks; the role scenario's stage one resumes from chain state; EndgameDeploy builds the same first-settings calls in a helper. No new Arc call, address or SDK use.
- Read-only test, Arc Testnet block 0x418af12: timelock getMinDelay() = 86400, hub owner() = the timelock 0xB434527FA2C7eA05313850FA03A976de05997Eff. Matches the deployed record.
- Docs: not needed (Arc mainnet chain id 5042 as already recorded in this file and view 11). SDK: none touched.

## 2026-10-24 Confirmation by passkey or Karwan PIN (plan 1 of 3, deals on the escrow family)

- Change: `backend/src/presence/` and `/api/confirm` ask a person to confirm before money leaves Karwan (cashout arc-withdraw and arc-send, gateway cash-out, bridge circle-bridge-out, activation withdraw) and before the identity wallet stakes (vault deposit). The check runs before the existing Circle calls; no Circle call, wallet set, address or SDK use changes.
- Arc use: a web3 account confirms by signing the action text; the backend verifies it with viem `publicClient.verifyMessage` (viem ^2.21.0, the same call SIWE uses, covering EOAs and ERC-1271 smart accounts). Passkeys use `@simplewebauthn/server` 13.3.0 as sign-in does, now with user verification required.
- Read-only test, Arc Testnet RPC https://rpc.testnet.arc.io: `eth_chainId` = 0x4cef52 (5042002), `eth_blockNumber` = 0x418ff57. Matches the network the backend signs on.
- Docs: not needed beyond the above (no new Arc or Circle behaviour). SDK: none upgraded.

## 2026-10-24 Quiet cancel of the confirmation sheet (plan 1 deferred minors)

- Change: `frontend/features/bridge/hooks/useBridge.ts` (bridge out and Arc send), `features/cashout/CashoutView.tsx`, `features/deposit/components/FundAgentOptions.tsx`, `features/money/hooks/useMoneyMove.ts` and `features/reputation/components/StakeCard.tsx` treat a closed confirmation sheet (`ConfirmCancelled`) as nothing sent: the row is dropped or the form returns, instead of an error or an in-flight state. No Circle or Arc call, address, chain or request body changes; the calls simply never start.
- SDK: installed `@circle-fin/app-kit` 1.15.2 (frontend and backend), `@circle-fin/adapter-solana-kit` 1.6.3, `@circle-fin/developer-controlled-wallets` ^10.8.0 (backend); none touched or upgraded.
- Read-only test, Arc Testnet RPC https://rpc.testnet.arc.io: `eth_chainId` = 0x4cef52 (5042002), `eth_blockNumber` = 0x41923af.
- Docs: not needed (no Arc or Circle behaviour involved).

## 2026-10-24 Plan 2 Task 1: Circle SCA binding signature and suite read-back (deals on the escrow family)

- Circle docs (circle MCP, 24 Oct 2026): developer-controlled SCAs are `circle_6900_singleowner_v3` (ERC-6900 v0.7, ERC-4337 v0.6; testnet factory 0xf61023061ed45fa9eAC4D2670649cE1FD37ce536); signing uses `POST /developer/sign/typedData`; SCAs deploy lazily, so `/sign/typedData` fails until the wallet's first transaction (https://developers.circle.com/wallets/signing-apis, /wallets/account-types). Contract execution on ARC-TESTNET is supported for developer-controlled wallets.
- Arc docs (arc-docs MCP, 24 Oct 2026): Arc supports ERC-4337; Circle Wallets SCA signatures are ERC-1271 (App Kit unified balance notes that USDC permit's `ecrecover` rejects them). No change since 23 Oct noted.
- SDK: `@circle-fin/developer-controlled-wallets` 10.8.0 (package-lock, backend); `client.signTypedData({ walletId, data, memo })` returns `data.signature`, used today by `backend/src/x402/dcwSigner.ts`.
- Read-only test 1 (stop gate): `design/endgame-testnet-2026-10/tools/bind-sig-check.mjs` signs one KarwanIdentity `Bind` digest with a deployed ARC-TESTNET SCA and `eth_call`s `isValidSignature` on it. Run by the owner in the testnet API container (`-w /app/backend`) on 24 Oct 2026. Result: PASS. SCA 0x5bd7c04c0627a4329b07f2f51dd2f59490aa5631, scaCore `circle_6900_singleowner_v4` (newer than the v3 the docs table lists), the script's digest equals the contract's `bindDigest`, a 65-byte signature, `isValidSignature` = 0x1626ba7e. The selling and buying agents can bind with Circle `signTypedData` as plan 2 designs.
- Read-only test 2: `CheckEndgame PHASE=configured` after the owner executes the timelock batch (ready 24 Oct 16:08:33 UTC). Executed 24 Oct 16:59:06 UTC, tx 0x40193974f211a1989f8dbac110ee52279418088afaeb70d1b60d562f3ee5f2c2, block 68892196. Run on node-services as `forge script script/CheckEndgame.s.sol --sig "check(string,bool)" deployments/endgame-5042002.config.json true --rpc-url https://rpc.testnet.arc.io`. Result: PASS, every role and value matches the config.

## 2026-10-24 Plan 2 Task 13: the suite path on an Arc fork (deals on the escrow family)

- Arc docs (arc-docs MCP, 24 Oct 2026): unchanged since the Task 1 entry; Arc's own Foundry release v0.8.0-2 (`anvil --network arc`) is the fork tool, the same pinned tarball and hash as `scripts/ops/forge-remote.sh`.
- Fork: Arc Testnet at block 68801000 (after the suite deploy, before the owner's timelock execute), on node-services port 8558, through `scripts/ops/arc-fork.sh e2e`.
- Read-only parity on the deployed suite: PASS 4/4. `agreementTermsHash` = `termsHashOf`, `agreementDealId` = `dealIdFor`, `bindingTypedData` digest = `bindDigest`, and the check report's EIP-712 digest (KarwanCheckVerifier/1) = `reportDigest`.
- Rehearsal on the fork only: the scheduled batch in `contracts/deployments/endgame-5042002.execute.json` carried out by impersonating the owner Safe after warping past the delay (nothing sent to the live network). Then the full run: PASS 16/16 (records, a one-time deal, the exact earnings move, a two-of-three check, a dispute ruled from the table and carried out after 72 h, the ruled share moved). Finding: the Agreement escrow takes a dispute only about a delivery (`BadState` with `deliveredAt == 0`); the backend now refuses that case before any call.
- The same full run at block 68892300, after the owner's real execute, without the fork-only step (24 Oct). Result: PASS 15/15.

## 2026-10-24 Plan 2 follow-ups: key loading, suite switch-on, earnings writes, record-card fee line

- Scope: how Karwan's checker, arbiter and issuer keys load (`chain/platformSigners.ts`, `platformSignersLive.ts`), the suite boot check now also waiting for those keys (`chain/suiteConfig.ts`), and locked writes of earnings moves (`db/deals.ts`). No contract call, ABI, Circle request or signing scheme changed.
- Circle docs (circle MCP, 24 Oct 2026): `https://developers.circle.com/wallets/gas-station/policy-management` says testnet accounts get a default Gas Station policy, Arc Testnet sponsored token USDC, daily limit 50; mainnet needs a configured policy. `https://developers.circle.com/wallets/gas-fees` lists Arc Testnet SCA fees (deploy 0.003381 USDC, transfer 0.00771808 USDC). Consequence: the record card's network-fee line is not built; who pays the identity wallet's gas on Arc must be confirmed first (console policy, mainnet plan). The repo flag `CIRCLE_GAS_STATION_ENABLED` covers the bridge wallets only.
- Arc docs: unchanged since the Task 13 entry the same day.
- SDK: viem 2.55.11 (package-lock), local signing with `privateKeyToAccount` for the platform keys, unchanged; Circle `@circle-fin/developer-controlled-wallets` 10.8.0 (backend), unchanged since the Task 1 entry.
- Read-only test: the Task 13 fork parity run on the deployed suite (block 68801000, 4/4: termsHashOf, dealIdFor, bindDigest, reportDigest) stands for these files, which change no read or digest. Unit tests: `a_bad_or_missing_key_is_reported_without_stopping_the_backend`, `new_deals_stay_put_while_karwan_keys_are_missing`, `two_moves_of_one_deal_saved_at_once_both_stay` (real Postgres), all pass. Docs and code agree.

## 2026-10-24 Seller record at agreement: a never-used agent signs its binding

- Circle docs (circle MCP, 24 Oct 2026): `https://developers.circle.com/wallets/signing-apis` warns that SCAs deploy lazily and `/sign/message` and `/sign/typedData` fail before the wallet's first onchain transaction; any outbound transfer or contract execution deploys it (`https://developers.circle.com/wallets/wallet-upgrades`, same rule). `https://developers.circle.com/wallets/gas-fees` gives the Arc Testnet SCA deploy fee as 0.003381 USDC.
- Consequence in code: before an agent signs its binding, `identity/suiteIdentity.ts` reads whether the agent's account is on chain (`getCode`) and, if not, sends one contract call from it, USDC `approve(identityRegistry, 0)`, then reads again; still empty stops setup with a plain sentence. On testnet the default Gas Station policy covers the call's gas; mainnet needs a policy or a funded agent (owner decision with the fee-line question).
- SDK: `@circle-fin/developer-controlled-wallets` 10.8.0 (backend), `executeContractCall` as used elsewhere; viem 2.55.11 `getCode`.
- Read-only test: the Task 1 check (24 Oct) proved `isValidSignature` for a deployed agent; the undeployed case follows Circle's documented rule above and is covered by unit tests (`a_new_agent_is_deployed_before_it_signs`, `an_agent_that_stays_undeployed_stops_setup_plainly`). The live proof is the Task 14 deal with a brand-new account. Docs and code agree.

## 2026-10-24 Email accounts: staking proof and deposits on every chain activation provisions

- Circle docs (circle MCP, 24 Oct 2026): `https://developers.circle.com/w3s/supported-blockchains-and-currencies` lists Arc Testnet and Avalanche Fuji with Wallets SCA, Contracts and Gas Station; `https://developers.circle.com/wallets/supported-blockchains` lists contract execution on Arc Testnet and Avalanche. `https://developers.circle.com/wallets/modular/key-features` describes SCA transactions as user operations sent to a bundler and settled through the EntryPoint.
- Read-only test 1 (Arc Testnet RPC `https://rpc.testnet.arc.io`, 24 Oct 2026): the failed stake's approval, tx `0x842e2aea850c81ed682991e179d5f425204e637c01dcec741c7795bed4ae2221`, is status 1 with `to` = EntryPoint v0.6 `0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789` and `from` = bundler `0xf18c33c9a6f4b1ac83490a145ad52ed63c77f3f3`; its logs hold a USDC (`0x3600…0000`) Approval owner `0x7711…5a35` spender vault `0xa600…8927` value 50 USDC, and a `UserOperationEvent` with sender `0x7711…5a35`. Consequence in code: `money/vaultStake.ts` no longer reads the receipt's to/from for a user operation; it requires a successful `UserOperationEvent` for the wallet, the USDC Approval/Transfer events and the vault's own `Deposited` event (`receiptParties`).
- Read-only test 2 (testnet database, 24 Oct 2026): account `0x7711…5a35` holds deposit wallets on MATIC-AMOY, OP-SEPOLIA, SOL-DEVNET, ARB-SEPOLIA, ETH-SEPOLIA, UNI-SEPOLIA, BASE-SEPOLIA and none on AVAX-FUJI: its Avalanche provisioning failed at activation and the on-demand heal (`money/depositAddresses.ts`) covered only five chains. The heal and the card now cover all eight chains activation provisions; `backfill:deposit-wallets -- --stranded` reports USDC already sitting in deposit wallets and `--stranded --route` moves it to Arc through the live deposit route.
- SDK: `@circle-fin/developer-controlled-wallets` 10.8.0, viem 2.55.11 (`parseEventLogs`, `readContract` for the stranded report), unchanged. Docs and chain agree.

## 2026-10-24 Buyer silence on the escrow family (policy over the deployed Agreement escrow)

- Source read (repo, the deployed suite's frozen sources, 24 Oct 2026): `contracts/src/suite/agreement/AgreementDeliveryLib.sol` `claimBar` (the payee may claim once review ends when `silenceOutcome = SILENCE_PAYS_SELLER`) and `reclaimBar` (the buyer cannot take a delivered payment back under that setting); `AgreementDisputeLib.dispute` (a seller may dispute a delivered payment while `reclaimBar != 0`; a buyer only while `claimBar != 0`); `DisputeLib` (arbiter proposes once, 72-hour `APPEAL_WINDOW` for a party to escalate, anyone executes; review Safe 5 days; then `fallbackBps`).
- No Arc or Circle API, SDK or contract change: the backend stops sending claims and the auto-release ladder for suite deals, and drives the dispute machinery above with the selling agent (Circle DCW, as already checked) and the arbiter key (local signing, as already checked).
- Proof: the Task 13 fork run already exercised dispute -> proposal -> 72-hour warp -> execute on this escrow (16/16); the new rule is unit-tested (`buyerSilence`, `suiteDisputeWatcher` R5, routes) and covered by the e2e "ask for payment". Docs and code agree.

## 2026-10-24 First live deal follow-ups: earnings move request key, one notice per transfer, payout destination

- Scope: `deals/suiteEarnings.ts` (the earnings move's Circle request key), `chain/announcedTransfers.ts` and `chain/balanceWatcher.ts` (the watcher stays quiet about a USDC transfer whose transaction a bridge or escrow event already announced), `deals/payoutLeg.ts` (the release leg names the payee). No new contract call, ABI, address, chain or SDK use.
- Circle docs (circle MCP, 24 Oct 2026): https://developers.circle.com/w3s/idempotent-requests says the idempotency key must be a UUID version 4. The earnings move sent `earnings:<job>:<key>:<n>` and Circle answered "API parameter invalid" on the live testnet deal 0xe5471eb8…2426; it now sends `deterministicIdempotencyKey(...)` (v4 wire format, same seed gives the same key), as the other contract calls already do.
- Arc docs (arc-docs MCP, 24 Oct 2026): https://docs.arc.io/arc/references/usdc-system-events says the ERC-20 USDC contract 0x3600…0000 emits `Transfer` (6 decimals) and mint/burn show as transfers from/to the zero address. The watcher reads exactly that log; unchanged. Noted, not changed here: the same docs say a plain native USDC send emits no log at 0x3600…0000, only at the system emitter 0xffff…fffe, so the watcher does not see native sends.
- SDK: `@circle-fin/developer-controlled-wallets` 10.8.0, `viem` 2.55.11 (package-lock); not upgraded.
- Read-only test, Arc Testnet RPC https://rpc.testnet.arc.io, 24 Oct 2026: release tx 0x311f1008…26cf (status 1, block 0x41b7656) logs USDC `Transfer` from the Agreement escrow 0x55460d2b… to the seller agent 0x17be62a0… for 9,950,000 (the stored `escrowTerms.seller`, now the leg's `destinationAddress`) and 100,000 to the fee Safe 0x915eb077…; CCTP mint tx 0x85c6eec8…78a1 (status 1) logs `Transfer` from the zero address to the seller identity 0x03e209a0… for 19,997,400, the transaction `bridge.minted` already announced. Docs, SDK and chain agree.

## 2026-10-25 Balance watcher also reads native USDC sends (system emitter)

- Scope: `chain/balanceWatcher.ts` reads `Transfer` from Arc's system emitter as well as from the ERC-20 USDC contract, and handles only the transfers the ERC-20 log does not already carry (a plain native send to a tracked wallet). New pure module `chain/nativeTransfers.ts`. No contract, ABI or SDK change.
- Arc docs (arc-docs MCP, 25 Oct 2026): https://docs.arc.io/arc/references/usdc-system-events and /integrate/infrastructure/indexing-events: every explicit USDC movement (native send, the native leg of an ERC-20 transfer, mint, burn) emits `Transfer(address,address,uint256)` from 0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE in 18 decimals; the ERC-20 contract 0x3600…0000 also logs its own 6-decimal `Transfer`, so an ERC-20 transfer appears twice and must not be counted twice; a native send emits nothing at 0x3600…0000; gas deductions emit nothing; on testnet before the Zero5 fork the precompile 0x1800…0000 emitted NativeCoin* events instead (mainnet uses `Transfer` since genesis).
- SDK: `viem` 2.55.11 (getLogs on two addresses); no Circle SDK use.
- Read-only test, Arc Testnet RPC https://rpc.testnet.arc.io, 25 Oct 2026: release tx 0x311f1008…26cf (block 0x41b7656) carries system-emitter `Transfer` escrow -> seller agent 9,950,000,000,000,000,000 beside the ERC-20 `Transfer` of 9,950,000 (same from, to, value / 10^12), and a system-only `Transfer` from the ERC-4337 EntryPoint 0x0000000071727De22E5E9d8BAf0edAc6f37da032 to the bundler; mint tx 0x85c6eec8…78a1 has the pair from the zero address and a system-only `Transfer` from EntryPoint v0.6 0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789. So Zero5 is active on testnet at these blocks, the pairing rule holds, and EntryPoint gas payments and refunds appear only on the system emitter. Decision: pair by (tx, from, to, value / 10^12); never record a transfer from either EntryPoint as money arriving. Docs and chain agree.
- Live check of the code, 25 Oct 2026 (throwaway probe on node-services, removed): `nativeOnlyTransfers` over Arc Testnet blocks 68908628-68908632 (the release) gave token 6, system 7, native-only 0 (each pair matched, the EntryPoint transfer dropped); over 68908192-68908196 (the mint) token 4, system 11, native-only 6, all plain native sends between other apps' contracts, which the watcher's registry filter then ignores. Result: PASS.

## 2026-10-25 Review then pay on the escrow family (owner decision, replaces view 27 decision 7)

- Scope: `deals/suiteReviewEnd.ts` (+Live) and the deal watcher's suite branch: remind the buyer 24 hours before the on-chain review ends, then send `KarwanAgreementEscrow.claim(bytes32)` from the deal's selling agent when it has ended. Removes the 24 Oct buyer-silence flow (no more seller-raised `dispute` for silence). No contract, ABI or SDK change; `claim` and `reviewEndOf` are already in the backend ABI and adapter (`chain/agreementEscrow.ts`, `agreementEscrowReads.ts`).
- Source read (repo, frozen sources of the 23 Oct deploy, 25 Oct 2026): `KarwanAgreementEscrow.claim` "Anyone triggers the seller's claim"; `AgreementDeliveryLib.claimBar` allows it once `reviewEnd` has passed, unless the deal is a deposit (`SILENCE_REFUNDS_BUYER`), a check failed, the review has not started on a check, or the last tranche is `FINAL_BY_BUYER`; Karwan writes `finalRelease` 0, so every tranche, the last included, pays on the timer. `requestMoreTime` (buyer only, `maxExtensions` 1 in Karwan's terms) moves `reviewEnd`; `dispute` by the payer is allowed while `claimBar != 0`.
- Circle docs (circle MCP, 25 Oct 2026): unchanged since the 24 Oct entries; contract execution from a developer-controlled SCA with a UUID v4 idempotency key (https://developers.circle.com/w3s/idempotent-requests). SDK `@circle-fin/developer-controlled-wallets` 10.8.0.
- Read-only test: the 25 Oct fork run `scripts/ops/suite-e2e.sh` (block 69092972) paid a tranche with `release` and read the escrow back; the new fork steps (a silent buyer paid by `claim` after `reviewEnd`, and `requestMoreTime` making an early claim revert `Early`) ran on 25 Oct 2026 at block 69102482 (`scripts/ops/suite-e2e.sh`): a claim before review end reverts, `requestMoreTime` moves `reviewEndOf` from 1793230569 to 1793234169, `runSuiteReviewEnd` reminds in the last day and then claims, and the deal reads Settled with the seller agent paid. Result: PASS, 21/21 with the earlier checks.

## 2026-10-26 Delivery deadline: reminders, and the refund waits on the buyer's answer (owner decision)

- Scope: the deal watcher's deadline branch (`agents/dealWatcher.ts`, new pure module `deals/deliveryDeadline.ts`) and the extension routes (`routes/deals.ts`). The watcher reminds the seller before the delivery date, tells both sides when it passes, and does not send the deadline refund while a seller's request for more time is unanswered. An approval counts the extra days from the later of the old date and now. No new contract call, ABI, address or SDK use: `extendDeadline` and `reclaim` are the calls already checked.
- Source read (repo, frozen sources of the 23 Oct deploy, 26 Oct 2026): `AgreementLib._moveDeadline` takes any later deadline while the deal is `Accepted`, up to `block.timestamp + maxHorizon`, even after `deadline + reclaimGrace`; `AgreementDeliveryLib.mark` refuses a delivery after `deadline + reclaimGrace` (`Late`); `reclaimBar` allows the refund only after `deadline + reclaimGrace`. `KarwanDealEscrow._moveDeadline` (v3) has the same bounds. So a buyer who approves late moves the date and the seller can deliver again; nothing reverts because the refund waited.
- Circle docs: unchanged since the 25 Oct entry; the buyer agent signs `extendDeadline` as before. SDK `@circle-fin/developer-controlled-wallets` 10.8.0, viem 2.55.11.
- Test: new forge test `AgreementDeadlines.t.sol` `test_a_late_approval_after_the_grace_lets_the_seller_deliver` (extend 10 days after `deadline + reclaimGrace`, reclaim then reverts `Early`, the seller can deliver). The live testnet deal after the deploy (a missed date, a request, a late approval) is the check on chain.

## 2026-10-26 Each milestone is delivered before it is released (escrow family and v3)

- Scope: new pure module `deals/milestoneDelivery.ts`; the deliver, release, cancel and extension routes, the deal view, the watcher's deadline branch and timer ladder, the batch `/api/milestones/release` route (refused for these escrows) and the assistant's deliver, release and take-back tools. Off-chain field `deliveredMilestone` names the milestone a delivery is for; it is compared with the chain's paid count. No new contract call, ABI or SDK use: `markDelivered` per milestone and `release` are the calls already checked.
- Source read (repo, frozen sources of the 23 Oct deploy, 26 Oct 2026): `AgreementDeliveryLib.nextTranche` sets `deliveredAt = 0` and clears the review and check after every paid tranche, so the next tranche has no delivery until `markDelivered` runs again; `AgreementLib.release` itself does not check for a delivery, which is why the app must. `KarwanDealEscrow` (v3) resets `deliveredAt` the same way (line 455). `reclaimBar` allows the deadline refund of the remaining balance when `deliveredAt == 0` after `deadline + reclaimGrace`.
- Also fixed: the assistant's release card read the earliest escrow by job id (`readEscrow`) for every deal; it now reads the deal's own escrow (`dealEscrowOps.read`).
- Test: unit tests (`milestoneDelivery`, `dealView`, routes source check); the live testnet deal after the deploy (two milestones, release the first, see milestone 2 wait for its delivery) is the check on chain.

## 2026-10-26 Public texts brought in line with review then pay (copy only)

- Scope: content-os canon page `milestone-escrow.md` (rewritten for the escrow family, status live), the docs disputes page `buyerSilent` copy in five languages, and one sentence in `assistant/platformGuide.ts`. No contract call, ABI, address, SDK use or route changes. The `frontend/core/api.ts` change in this worktree is the delivery-deadline batch covered by the entry above.
- Source read (repo, 26 Oct 2026): the claims rest on the 25 Oct source read above. Checked again here: `KarwanEscrow.sol` (earlier escrow) `claimMilestone` lets the seller claim any milestone, the final one included, once `claimDeadline` passes, so the old canon line "the final milestone never releases on a timer" was false for both escrows. `backend/src/deals/suiteReviewEnd.ts` `reviewEndStep` claims only on family deals that are delivered, not disputed, not a deposit and with no failed check; `MAX_REVIEW_DAYS` 30 (`deals/reviewClock.ts`); the app takes 1 to 5 milestones (`deals/createSchema.ts`); the fee is 1%, half from each side (view 27).
- Circle docs: not consulted; nothing here calls Circle. SDK `@circle-fin/developer-controlled-wallets` 10.8.0 (package-lock.json), unchanged.
- Test: no chain test, since no chain behaviour changed; the 25 Oct fork run above is the read-only proof of the claim rule the copy describes. Copy gates ran on node-services (content-os 72/72, canon validate and guard ok; frontend and backend runs recorded in the handoff).

## 2026-10-26 Records on testnet signed by Karwan for wallets it holds (owner decision)

- Scope: `identity/suiteIdentity.ts` `requireIdentity` runs `setUpIdentityForCustodial` itself when a record is missing or the buying agent has expired, testnet only (`autoSetupCustodial: ARC.testnet` in `suiteIdentityLive.ts`), one setup per person at a time; a failed setup falls back to asking. New `scripts/backfill-records.ts` (report by default, `--execute`, `--limit`) runs the same setup for every existing testnet account whose identity wallet Karwan holds. No new contract call, ABI or SDK use: `KarwanIdentity.register`, `bind` (agent signature over the `Bind` typed data) and `unbind` from the identity DCW, and one `approve(registry, 0)` to put an undeployed agent account on chain, are the calls checked on 24 Oct and used for the first live deal (identity.register/bind receipts on 24 Oct).
- Circle docs: unchanged since the 24 Oct entries (contract execution and typed-data signing from developer-controlled SCAs, UUID v4 idempotency keys). SDK `@circle-fin/developer-controlled-wallets` 10.8.0, viem 2.55.11.
- Test: unit tests in `identity/suiteIdentity.test.ts` (auto setup, own wallet never signed for, two gates at once set up once, expired agent renewed, failure falls back). On chain: the backfill confirms each account from `bindingOf` after its calls, and its report-only run lists what it would do first.

## 2026-10-26 Money the seller never accepted on the escrow family

- Scope: new pure module `deals/unacceptedEscrow.ts`, the watcher's branch for deals paid in but not accepted (`agents/dealWatcher.ts` `maybeSettleUnaccepted`), the take-back step moved out of the cancel route into `deals/takeBackUnaccepted.ts`, the deal view (`paidIn`, `acceptUntilMs`, outcome `unaccepted-refund`) and the page's Something is wrong menu. No new contract call, ABI or SDK use: `accept` from the selling agent and `cancelUnaccepted` from the buying agent are the calls checked for the first live deal on 24 Oct.
- Source read (repo, frozen sources of the 23 Oct deploy, 26 Oct 2026): `AgreementLib.accept` reverts `Late` once `block.timestamp > acceptBy` (set to funding time plus 3 days in `fundDirectSuite.ts`); `cancelUnaccepted` needs only `state == Funded` and the buyer, with no time gate, pays the whole balance back and records the outcome as cancelled. So retrying the accept is safe until `acceptBy`, and a refund is always possible.
- Circle docs: unchanged since the 24 Oct entries (contract execution from developer-controlled SCAs, UUID idempotency keys). The retry reuses the funding movement's `activate` leg and its idempotency key, so a retry never sends a second accept or any transfer; it passes an authorised total of zero, which refuses every path that would fund again. SDK `@circle-fin/developer-controlled-wallets` 10.8.0, viem 2.55.11.
- Test: unit tests `unacceptedEscrow.test.ts` and `dealView.test.ts`, page `problems.test.ts`. The check on chain is a testnet deal funded while the seller's accept is held back.

## 2026-10-26 Delivery proof by kind: whole-delivery fingerprint and handover code

- Scope: `deals/deliveryProofRules.ts`, `deals/handoverCode.ts`, `deals/deliveryPhotos.ts` and the delivered, handover-code and delivery-photos routes (`routes/deals.ts`). No new contract call, ABI or SDK use. `markDelivered(dealId, proofHash)` now carries the fingerprint of the whole delivery (note, shipment, photo fingerprints, handover time) instead of the note alone; the contract stores `proofHash` as an opaque `bytes32` and emits it in `Delivered`, and nothing in the app or the CRE workflows recomputes it from the note (searched 26 Oct). A right handover code calls `startReview` from the buyer agent, the same call and wallet as the buyer's It arrived.
- Source read (repo, frozen sources of the 23 Oct deploy, 26 Oct 2026): `AgreementLib.startReview` needs the buyer and goes through `AgreementDeliveryLib.buyerStart`; `dealEscrowOps.confirmArrival` only calls it when `deliveredAt != 0` and the review has not started, so it runs after `markDelivered` in the same request.
- Circle docs: unchanged since the 24 Oct entries (contract execution from developer-controlled SCAs). SDK `@circle-fin/developer-controlled-wallets` 10.8.0, viem 2.55.11.
- Test: unit tests `deliveryProofRules.test.ts`, `handoverCode.test.ts`, `deliveryHistoryView.test.ts`; frontend `delivery.test.ts`, `deliveryCard.test.ts`. The check on chain is a testnet goods deal handed over with a code, and one sent with a courier and a photo.


## 2026-10-27 Record setup in one transaction for people with their own wallet (design, before code)

- Scope: view 27 decision 10, record setup for web3 accounts riding along with their next Arc transaction. Planned change: `identity/suiteIdentity.ts` `preparedSetupCalls` returns every missing call at once (register, unbind an expired buying agent, bind the buying agent, bind the selling agent); every Arc transaction the person signs in the app (USDC sends, agent top ups, deal insurance, yield claims, financier steps, assistant wallet cards) goes through one shared sender that wraps the person's own call (`allowFailure: false`) and the missing record calls (`allowFailure: true`) in one `Multicall3From.aggregate3`, only when the balance covers the extra fee. No contract change and no new contract of ours.
- Arc docs (read 27 Oct 2026): https://docs.arc.io/arc/concepts/batched-transactions and the transaction extensions table in https://docs.arc.io/arc/references/contract-addresses. `Multicall3From` is predeployed at `0x522fAf9A91c41c443c66765030741e4AaCe147D0` on Arc Testnet and Arc mainnet; each subcall goes through the `CallFrom` precompile, so the target sees the signing EOA as `msg.sender`. Guardrails: the batch must be sent from an EOA (a contract caller is rejected), no value forwarding, `allowFailure: false` reverts the whole batch if one call fails.
- Source read (repo, frozen sources of the 23 Oct deploy): `KarwanIdentityRegistry.register` sets `controllerOf[++identityCount] = msg.sender`; `bind` needs `msg.sender` to be the identity's controller and checks the agent's signature over `bindDigest(id, wallet, kind, expiry, perPayment, total, nonces[wallet], deadline)`. So in one batch the agent signatures must name the identity id before it exists: Karwan reads `identityCount` and signs for `identityCount + 1`. If another registration lands first, `bind` reverts `BadSignature` alone (its `allowFailure` is true), the person's own call and the registration stand, and the next transaction binds with the right id. `bind` always uses the sender's own identity (`_controlled(msg.sender)`), so a wrong id cannot attach an agent to another identity.
- Read-only test (27 Oct 2026, viem 2.55.11, `https://rpc.testnet.arc.io`, chain 5042002): `Multicall3From` has 3,180 bytes of code; `identityCount` on the identity registry `0x5409e859E1604b6Efa01827CCd3d2D7aaB1e3D5D` was 40; an `eth_call` of `aggregate3([register(), identityOf(from)])` from an address with no identity returned id 41 from `register` and 41 from `identityOf(from)` inside the same batch. The registry saw the caller, not `Multicall3From`, and the predicted id matched.
- Circle docs: not consulted; this path is the person's own wallet and calls no Circle API. The agent signatures and the agents' first on-chain call are unchanged from the 24 Oct entries. SDK `@circle-fin/developer-controlled-wallets` 10.8.0.
- Full batch, read only (27 Oct 2026, `backend/src/scripts/record-batch-probe.ts`, viem 2.55.11, identityCount 40, fresh throwaway keys for the person and both agents, EOA agent signatures accepted by `SigCheck`): `aggregate3` of a USDC `transfer(self, 0)` (`allowFailure: false`), `register` and both `bind` (`allowFailure: true`), then `bindingOf` reads. Right number: every subcall succeeds, both agents bound to 41. Wrong number (42): transfer and register succeed, both binds fail alone, the batch does not revert, nothing bound. Expired deadline: the same, binds fail alone. Register twice: the second fails alone, binds still land on 41. Gas: 47,307 for the transfer alone through `aggregate3`, 259,143 with the record, so the record adds about 212,000 gas.
- Built 27 Oct 2026: backend `chain/multicall3From.ts` `sentTo` lets the two receipt proofs that checked the outer target (agent top up in `routes/activation.ts`, own-wallet vault actions in `money/vaultActions.ts`) accept a receipt sent to `Multicall3From`, and both now count only logs emitted by USDC or the vault itself, since a batch can call other contracts. Frontend `shared/chain/useOwnWalletSend.ts` sends one plain transaction when there is nothing to add, simulates the batch with `eth_call` before asking the wallet, and treats code `0xef0100...` (EIP-7702 delegation) as an ordinary wallet.
- Still to prove before switching it on: one real setup on testnet from a browser wallet, with a real non-zero USDC transfer. Not yet checked: `wallet_sendCalls` (EIP-5792) for smart-contract wallets on Arc, and whether App Kit's send-out calls can be batched.

## 2026-10-27 Offers that move (view 35, T1.7): the deployed JobBoard, before code

- **What view 35 relies on.** A seller's second `submitBid` on a request replaces their first, and emits `BidSubmitted` again so the buyer's agent hears it; and `acceptBid` takes an offer above the posted budget (the leeway).
- **Source read.** `contracts/src/KarwanJobBoard.sol` lines 121-130 (`bids[jobId][msg.sender] = Bid(...)`, overwrite) and 172-190 (`acceptBid` has no budget check).
- **Read-only test against the live bytecode.** `contracts/test/arc-checks/ArcJobBoardRevision.t.sol`, run with `scripts/ops/forge-remote.sh --arc test/arc-checks` (Arc's own Foundry, anvil forking Arc Testnet at block 68661248), calling the deployed JobBoard `0x35224C2234263B5506a9F7BfF4bb98e9FceD3FF3` through an interface, not the source. Result 27 Oct 2026: 2 passed. 142.71 then 130 USDC leaves `bids(job, seller).price == 130e6` with two `BidSubmitted` logs; an offer of 150 USDC on a 120 USDC budget is accepted at 150.
- **Found.** The deployed build is older than the source: `postJob` returns nothing and its job id is not `keccak256(abi.encode(poster, salt))`. The backend reads the id from `JobPosted` (`agents/buyer.ts` `handleJobPosted`), so nothing breaks today; any new code must do the same, never derive the id from the source's formula.
- **Agree:** yes. No contract change is needed for view 35.

## 2026-10-28 · Testnet per-deal cap on the agreement escrow (hub caps)

- Source: `contracts/src/suite/KarwanHub.sol` (`setCaps(family, asset, perDeal, total)`, onlyOwner; `openingConfig` copies `perDeal` into each deal) and `SettlementLib.sol` (`OverCap` on fund).
- Read-only on Arc Testnet (rpc.testnet.arc.network), hub `0xB874C290B82c0689De75Eaf9434774f83da138a6`, agreement `0x55460D2b8b0D8067Ea33406b310224B5bd44F43C`, USDC `0x3600000000000000000000000000000000000000`: owner `0xB434527FA2C7eA05313850FA03A976de05997Eff`, `capsOf` = perDeal 1,005 USDC, total 10,000 USDC; `highValueOf(USDC)` = 5,000 USDC.
- The backend reads the cap fresh on each funding (`readAgreementLimits`), so raising it needs no restart. The owner sends `setCaps`; nothing in Karwan's code changes the cap.
- Correction, same day: the hub owner `0xB434…7Eff` is the TimelockController from `contracts/deployments/endgame-5042002.json` (min delay 86,400 s). The Safe `0xF253E02048FB2F89FFD3E3c931aa3ea14A857556` holds proposer, executor and canceller roles; 3 of 5 owners sign. Batches `contracts/deployments/caps-5042002-2026-10-28.{schedule,execute}.json` raise the cap to 101,000 USDC per deal and 10,000,000 USDC in total; both calls simulated with eth_call (setCaps as the timelock, schedule as the Safe) on 2026-10-28.

## 2026-10-28 · Safe batches for the testnet deal cap (docs, SDK, read-only test)

- Docs: Arc Docs, Network parameters (https://docs.arc.io/arc/references/rpc-endpoints#network-parameters), read 2026-10-28: testnet chain id 5042002, USDC is the native gas token. The batches name chainId 5042002 and USDC 0x3600000000000000000000000000000000000000.
- SDK: viem 2.55.11 (backend/node_modules) encoded the calls and ran the reads.
- Read-only test, 2026-10-28: rpc.testnet.arc.network returned chain id 5042002 (block 69,449,482); eth_call of setCaps as the timelock and of schedule as the Safe both succeeded; the operation is not queued yet.
- Docs, SDK and chain agree. Nothing was sent; the Safe signers queue it, then run it after 24 hours.

## 2026-10-28 · Deal guarantee on the family vault (view 37, T5.1): before code

- **Scope.** Put up, take out, cancel and collect a Deal guarantee on `KarwanStakeVault` `0xF5FD1fd6d790da42C022a5c5404676c048007ed5`; for an own wallet the missing record steps go first in one `Multicall3From` batch and must succeed (`stake` needs an identity); for a wallet Karwan holds, Circle contract execution of `approve` then `stake` after `ensureRecord`. Yield credited through `KarwanYieldDistributor`. No contract change.
- **Arc docs (read 28 Oct 2026).** https://docs.arc.io/arc/concepts/batched-transactions ("How a batch call works": each subcall goes through `CallFrom`, the target sees the signing wallet as `msg.sender`; `allowFailure: false` reverts the whole batch) and the transaction extensions table at https://docs.arc.io/arc/references/contract-addresses (`Multicall3From` `0x522fAf9A91c41c443c66765030741e4AaCe147D0` on testnet and mainnet). Unchanged from the 27 Oct entry.
- **Circle docs (read 28 Oct 2026).** https://developers.circle.com/contracts/scp-interact-smart-contract and the Gateway quickstart's approve-then-deposit example: `createContractExecutionTransaction({ walletId, contractAddress, abiFunctionSignature, abiParameters, idempotencyKey, fee })`, asynchronous, polled to a terminal state. Batching through `executeBatch` is documented only for MSCA wallets (https://developers.circle.com/wallets/batch-operations), so a held wallet sends `approve` and `stake` as two executions, as `money/vaultStake.ts` already does for the previous vault.
- **SDK.** `@circle-fin/developer-controlled-wallets` 10.8.0 (backend), `viem` 2.55.11 (backend and frontend).
- **Read-only test (28 Oct 2026, viem 2.55.11, rpc.testnet.arc.network, chain 5042002, block 69,519,778).**
  - Family vault: `hub()` = `0xB874C290B82c0689De75Eaf9434774f83da138a6` (the suite hub), `COOLDOWN()` = 604,800 s (7 days), `freeOf(0, USDC)` = 0. Hub: `assetAllowed(USDC)` = true. Identity registry `identityCount` = 53.
  - `eth_call` of `aggregate3([register(), USDC.approve(vault, 1 USDC), vault.stake(USDC, 1 USDC), vault.stakeOf(54, USDC)])`, every call `allowFailure: false`, from a fresh address given 10 USDC by state override: the batch succeeded, `register` returned 54 (predicted `identityCount + 1`), and `stakeOf(54)` read `active 1,000,000, reserved 0, cooling 0`. So approve and stake through `Multicall3From` see the person's wallet, and the vault credits the new identity in the same transaction.
  - `stake` from the same address without the batch reverts (the vault's `NotPerson`).
  - Yield distributor `0x9E4AdFcfB46108ED7c2F3C1AF1728AAE937f336F`: `operator()` = `0x9aB16Ac0e4830C8445A05e06E5Ba10296fa1cef3` holding 19.66 USDC; `outstandingClaims` 8.96 USDC, equal to its USDC balance; `creditsPaused` false.
- **Agree:** yes. Docs, SDK and chain agree; nothing was sent. Still to prove on testnet once built: one real put up from a wallet Karwan holds and one from a browser wallet.

## 2026-10-28 · CRE suite wiring, x402 dry run and hosted deploy plan (docs, SDK, read-only test)

- Docs: Chainlink CRE forwarder directory (https://docs.chain.link/cre/guides/workflow/using-evm-client/forwarder-directory-ts), read 2026-10-28: `arc-testnet` production KeystoneForwarder `0x76c9cf548b4179F8901cda1f8623568b58215E62`, simulation MockKeystoneForwarder `0x6E9EE680ef59ef64Aa8C7371279c27E496b5eDc1`; Arc mainnet not listed. Same as `contracts/script/EvidenceRegistryDeploymentConfig.sol`.
- Docs: CRE deploying workflows and private registry (https://docs.chain.link/cre/guides/operations/deploying-to-private-registry-ts) and deployed secrets (https://docs.chain.link/cre/guides/workflow/secrets/using-secrets-deployed), read 2026-10-28: private registry capped at 3 workflows per organisation; `cre workflow deploy <dir> --target <t> --yes` prints the workflow id; `cre workflow delete` is permanent and asks for the name; `cre secrets create <file> --target <t>`. Steps in `cre/DEPLOY-SUITE.md`.
- SDK: `@chainlink/cre-sdk` 1.23.0 in the three suite workflows; CRE CLI v1.38.0 on node-services (1.39.0 available, not adopted mid-deadline). viem 2.55.11 for the timelock batch encoder.
- Read-only and fork tests, 2026-10-28: a fork of Arc Testnet at block 69,520,901 on node-services. Anvil's public test accounts are refused by Arc's fork ("Blocked address"), so the rehearsal uses throwaway keys funded on the fork only. Arc USDC reports name `USDC`, version `2` for the EIP-712 domain. `KarwanCreFees.open` took a payer's `ReceiveWithAuthorization` for 0.25 USDC (run state 1). The adapter stores the workflow name as the first ten hex characters of sha256 of the name (`karwan-check-sim` -> `cf02a52718`), the same encoding `scripts/ops/cre-timelock-batch.mjs` writes.
- Testnet suite (contracts/deployments/endgame-5042002.json): hub, record issuers and adapter bindings sit behind the timelock `0xB434…7Eff`, 24 hour delay, proposed by the owner Safe `0xF253…7556`. No CRE adapter or fee contract is deployed there yet.
- Docs, SDK and chain agree. Nothing was sent to Arc Testnet.

## 2026-10-28 · CRE adapter and fee contract on Arc Testnet, production configs (docs, SDK, read-only test)

- Docs: the Chainlink forwarder directory entry recorded above, read 2026-10-28, still names `0x76c9cf548b4179F8901cda1f8623568b58215E62` as the `arc-testnet` production forwarder; Arc Docs network parameters (https://docs.arc.io/arc/references/rpc-endpoints#network-parameters, read 2026-10-28): chain id 5042002, USDC `0x3600000000000000000000000000000000000000`.
- SDK: Foundry 1.7.1 (forge, cast) on the laptop; `@chainlink/cre-sdk` 1.23.0 in the workflows.
- Read-only test, 2026-10-28, rpc.testnet.arc.io: `KarwanCreAdapter` `0x4eA2959C8843922b79f39976351543e46FC679CD` returns forwarder `0x76c9…5E62`, workflowOwner `0x6aE4…C104`, hub `0xB874…38a6`, binder `0xB434…7Eff` (the timelock), `bindingOf(1..4)` all zero; `KarwanCreFees` `0x9553ff79B13f27D767B2A94BB8428a8e6A7D9c7e` returns adapter `0x4eA2…79CD`, payee `0x915E…8d9E`, usdc `0x3600…0000`, price 250000. Sourcify v2 reports both `exact_match` for creation and runtime on chain 5042002.
- `cre/karwan-check`, `karwan-risk` and `karwan-record` `config.production.json` now name that adapter, the fee contract, the Agreement escrow `0x5546…F43C` and the suite verifier `0xCD39…AAa8` (`attest: false`). `gatewayKey` and `backendKey` are `0x182fd66E898DcED0e8B8966b7311325150B7c077`, the address of `CRE_GATEWAY_SIGNER_KEY`, made with `env-put.sh --new-key` into `~/.karwan-cre-env` on node-services the same day (never printed).
- Docs, SDK and chain agree.

## 2026-10-29: live CRE dry-run deal, which forge

- Finding: stock Foundry 1.7.1 on the laptop cannot run `contracts/script/CreLiveDryRunDeal.s.sol` against Arc Testnet. Its local EVM has no Arc USDC blocklist precompile, so the first USDC `transferFrom` (inside `fund`) hits `0x1800000000000000000000000000000000000001::isBlocklisted` and fails with `StackUnderflow`, then `Revert`. The contracts are not at fault.
- SDK: Circle's arc-foundry `v0.8.0-2` (forge 1.7.1-dev, hash-pinned in `scripts/ops/forge-remote.sh`) on node-services implements it. `design/cre-live-2026-10-29/deal.sh simulate|broadcast` runs the script there, with keys over ssh stdin, as `tools/roles.sh` does for the endgame roles.
- Read-only test, 2026-10-29, rpc.testnet.arc.io: the arc-foundry simulation passes. Deal `0x1e91da0b958d7d46404a289892beab83da5c7a7e281538954c9c6c309d2a0339` on `0x5546…F43C`; buyer `0x4EBA…E261` gets identity 54, seller `0x5dac…C358` identity 55; the deal ends in state 2 (accepted); about 1.32M gas, 0.053 USDC. Nothing was sent.
- Broadcast, 2026-10-28 23:4x UTC (owner, via `deal.sh broadcast`): five transactions, all status 1, blocks 69,579,845 to 69,579,859 (`0xd859aeb8…a155`, `0x08602fa3…c298`, `0x86cb658e…56aa`, `0x19365b37…72c5`, `0xfa13da04…bd6b`). Read back: deal `0x1e91…0339` in state 2, 5 USDC, verifier `0xCD39…AAa8`, `checkPolicy` `0xd4a6…0a03`; `identityOf` buyer 54, seller 55. Production `POST /api/x402/cre/dry-run/<family>/<deal>` with the buyer as payer now answers 402 with a price. `KarwanCreAdapter.bindingOf(1..4)` are still zero until the timelock batch executes (from 2026-10-29 20:40:52 UTC).

## 2026-10-29 · Agent wallets set up at sign-up (docs, SDK, read-only test)

- Change: the same `provisionUserAgentWallets` call (`backend/src/circle/wallets.ts`) that `POST /api/activate` runs also starts, in the background, after `POST /api/signup` creates an account (view 38, step 1). No new Circle or Arc call.
- Docs: Circle, create wallets for existing users (https://developers.circle.com/wallets/dev-controlled/onboard-users), read 2026-10-29: `createWallets({ walletSetId, accountType: 'SCA', blockchains, count, metadata: [{ name, refId }] })`, up to 200 wallets per request, response `data.wallets[]` with `id`, `address`, `refId`.
- SDK: `@circle-fin/developer-controlled-wallets` 10.8.0 installed (`^10.8.0` in `backend/package.json`). `CreateWalletsInput` has `blockchains`, `count` (multiplied by the number of blockchains), `metadata` (one per wallet), `walletSetId`, `accountType`; Karwan passes one blockchain, count 2, two metadata items.
- Read-only test: the type definitions in the installed package match the call; no wallet was created.
- Docs and SDK agree.

## 2026-10-29 · Deal guarantee collect on an Arc fork (view 37, F2)

- Fork of Arc Testnet at block 69,587,069 (`ARC_FORK_BLOCK=69587069 scripts/ops/arc-fork.sh up`); the runner's default block 66,719,638 no longer forks ("failed to get account" at genesis) and predates the endgame contracts.
- `scripts/ops/arc-fork.sh e2e guarantee` (backend/src/scripts/suite-fork-e2e.ts `guaranteeRun`), no role keys: a fresh wallet registered record 57 through the app's identity module, approved and staked 100 USDC on KarwanStakeVault 0xF5FD…07ed5, requested withdraw (COOLDOWN read back as 7 days), `withdraw` before the wait was refused, after warping the wait it returned exactly 100,000,000 micros (gas on Arc is paid in USDC: native 18 decimals, token 6, so the check adds the receipt's gas back).
- Docs, SDK and chain agree with the plan. Nothing on testnet was touched.

## 2026-10-29 · Financing on the family (T4.2, T4.3), before the spec

- Change planned: Get paid now on Agreement family deals through `KarwanTradeFinance` `0xAeEAda6aef8B07262224F010264eF1968177C779` (`open`, `settle`, `waive`, `keepStake`, `lineOf`, `lineIdFor`), with the seller's `Assign` signature on the Agreement escrow `0x5546…F43C` (submitter = the trade finance contract) and the `Reserve` signature on the family vault `0xF5FD…07ed5`.
- Docs: Circle, account types (https://developers.circle.com/wallets/account-types), read 2026-10-29: Karwan's held agent wallets are SCAs (`circle_6900_singleowner_v3`), so their EIP-712 signatures are checked through ERC-1271; the contracts use `SigCheck.isValid`, which takes both. The identity registry already accepts the selling agent's typed-data signature on testnet (bindings live since 24 Oct).
- SDK: `@circle-fin/developer-controlled-wallets` 10.8.0 (`signTypedData`, `createContractExecutionTransaction`); Foundry 1.7.1 `cast` for the reads.
- Read-only test, 2026-10-29, rpc.testnet.arc.io, block 69,622,426: `TF.hub()` = hub `0xB874…38a6`; `hub.isFamily(TF)` true; `hub.isFamily(agreement)` true; `hub.stakeVault()` = `0xF5FD…07ed5`; `MIN_STAKE_BPS` 1000; trade finance code 6,216 bytes. Contract facts from source: `receivableOf.financeable` only for an accepted, fully paid-in deal (a delivered deal stays Accepted, so both moments qualify); the vault refuses a reservation from an agent wallet (`NotPerson`), and the selling agent is bound as a person's wallet (`Kind.Wallet`), so it can sign; `open` must be sent by the financier and pulls the advance with `transferFrom`, so the financier approves the contract first.
- Docs, SDK and chain agree. Nothing was sent.

## 2026-10-29 · View 39, /start to Home

No Arc or Circle code changed. The guarantee sheet reads the Arc wallet balance through the existing useMoneyBalances hook (the same balanceOf the guarantee route checks); no new chain call, SDK or contract. The privacy notice names Circle as the wallet provider for email accounts, as section 2 of the terms already does.

## 2026-10-29 Telegram interview order (view 39 follow-up)

No Arc or Circle code changed. Files: backend/src/channels/interview.ts and its test, platformGuide.ts, canon, docs. No SDK, contract, chain or Circle call is touched, so no docs check or read-only test applies.
Not checked here: backend/src/chain/tradeFinance.ts and backend/src/money/familyFinancing*.ts belong to the deal guarantee part 2 session, which owns their Arc and Circle entry.

## 2026-10-29 · Financing on the family, built (T4.2, T4.3)

- Change: `backend/src/money/familyFinancingLive.ts` signs the seller's `Assign` and `Reserve` with the selling agent's Circle wallet (`dcwEvmSigner(...).signTypedData`), sends a held financier's `approve` and `open` through `executeContractCall` (`abiFunctionSignature` `open(address,bytes32,uint128,uint128,uint128,uint64,(uint256,uint256,bytes),(uint256,bytes))`, tuples as nested arrays), and reads `receivableOf`, `nonceUsed`, `identityOf`, `freeOf`, `expiryOf`; `familyFinancingRunner.ts` sends `settle` and `keepStake` from the yield operator wallet (`OPERATOR_PRIVATE_KEY`, 0x9aB1…cef3) with viem.
- Docs: Circle, interact with a smart contract (https://developers.circle.com/contracts/scp-interact-smart-contract) and batch operations (https://developers.circle.com/wallets/batch-operations), read 2026-10-29: `createContractExecutionTransaction({ walletId, contractAddress, abiFunctionSignature, abiParameters, idempotencyKey })`; tuple arguments are passed as nested arrays, as in their `executeBatch((address,uint256,bytes)[])` example. Karwan's `fundEscrow(...,(uint64,uint64,uint64))` already uses the same form on testnet.
- SDK: `@circle-fin/developer-controlled-wallets` 10.8.0; viem as installed in backend.
- Read-only test: the digests the code builds equal `assignDigest`, `reserveDigest` and `lineIdFor` read from Arc Testnet at block about 69,622,426 (`backend/src/chain/tradeFinance.test.ts`). Fork run below.
- Docs, SDK and chain agree.
- Fork run, 2026-10-29, Arc Testnet forked at block 69,622,426 (`ARC_FORK_BLOCK=69622426 scripts/ops/arc-fork.sh up`, then `scripts/ops/arc-fork.sh e2e financing < /dev/null`; the phase reads stdin, so it must be closed), with the app's own `createFamilyFinancing` core and fresh wallets, no role keys: a 150 USDC goods order funded and accepted; the seller had no free guarantee, so the same take put up 11.94; the selling agent signed both; the financier opened 119.40 / 122.982 / 11.94 and the seller agent received exactly 119,400,000 micros; release paid the financier exactly 122,982,000 first; `settle` emitted `LineRepaid` and freed the hold. A second order opened the same way, was never delivered, the buyer reclaimed after the deadline and grace, and `settle` emitted `LineDefaulted` and paid the financier exactly 11,940,000 micros from the hold. All checks passed. Nothing was sent to testnet.
- Review fix, 2026-10-29 (later): `money/familyFinancing.ts` gained a per-deal take lock and lets a waiting offer lapse after its 24 hours; no new Arc or Circle call. Same docs (Circle contract execution, read 2026-10-29), same SDK (`@circle-fin/developer-controlled-wallets` 10.8.0), and the same read-only check (digests equal to the deployed contracts' views) still hold; the fork run above used this core. Docs, SDK and chain agree.

## 2026-10-29 · Testnet cap increase executed

- Executed by the owner Safe `0xF253…7556`, tx `0x6d8fc80a83787fe7dc54a437c799f9665c7a0049988ea022b12cb5d8599b1cce`, block 69,669,748, 12:29:26 UTC, status success (operation `0x98f5…13b5`, ready from 05:34:28 UTC).
- Read back on rpc.testnet.arc.network: `CapsSet` from hub `0xB874…38a6` for agreement escrow `0x5546…F43C` and USDC `0x3600…0000`; `capsOf` returns 101,000 USDC per deal and 10,000,000 USDC in total, matching `caps-5042002-2026-10-28.schedule.json`; `isOperationDone` true.
- Still queued: CRE batch, operation `0xba29…df5e`, ready from 20:40:52 UTC, not done.

## 2026-10-29 · Job escrow before part 3 (view 40)

- Arc Testnet, rpc.testnet.arc.io, block 69,670,758, read-only: job escrow `0xEA06b70c0808c2ad9b6316758407284fdAD9D550`; `hub()` = `0xB874…38a6`; `hub.isFamily` true; `asset()` = USDC `0x3600…0000`; `jobCount()` = 0.
- `hub.openingConfig(jobs, USDC)`: open true, feeBps 100, fee recipient `0x915E…8d9E`, perDealCap 1,005 USDC, highValue 5,000 USDC, review Safe `0x5538…cAAA`, senior Safe `0x40A0…9296`, auto arbiter `0x9Fef…D3d`, yieldBps 0. `acceptsMoney` true; `totalCapOf` 10,000 USDC. Today's cap batch raised the agreement escrow only.
- Arc docs (docs.arc.io, read 29 Oct 2026): contract-addresses#erc-8183 and tutorials/create-your-first-erc-8183-job. The reference job contract is `0x0747…4583`; its flow is createJob(address,address,uint256,string,address), setBudget(uint256,uint256,bytes), approve, fund(uint256,bytes), submit(uint256,bytes32,bytes), complete. OURS DIFFERS: fund(uint256 jobId, uint256 expectedBudget, bytes) refuses a changed budget; hooks refused; see view 11 "Where the Jobs family differs". The MCP must hand agents our exact calls.
- Circle docs (developers.circle.com/gateway/nanopayments, x402-seller, concepts/x402, read 29 Oct 2026): x402 over Gateway batched settlement; the buyer deposits once into a Gateway Wallet, signs EIP-3009 authorizations offchain, the seller verifies and serves, Gateway settles in batches. Installed: @circle-fin/x402-batching ^3.0.4, @x402/evm ^2.14.0 (backend/package.json). Still to log before MCP code: MCP SDK version (not installed), a read-only facilitator call from node-services.

## 2026-10-29 · Agents that always answer, phase 1 (T1.8, view 41)

No Arc or Circle code changed. Files: backend/src/agents (agentQuestion, limits, questionSweep, requestReach, seller, nearMiss, buyer), db/agentQuestions and migration 51, routes/agentQuestions, routes/jobs (reach), routes/offers, channels/notifyVia, emails/dealNotifier, telegram/notifier, assistant tools, guide, canon, frontend. The seller's offers and counter replies keep going through the market board helpers already in seller.ts (view 40, part A, checked by that session); this phase adds no contract, chain or Circle call, so no docs check or read-only test applies.
Not checked here: backend/src/chain/suiteConfig.ts and backend/src/chain/jobEscrow.ts belong to the contests session (view 40, part 3), which owns their Arc and Circle entry above (Job escrow before part 3).

## 2026-10-29 · Time escrow before part 4 (view 32, hourly work and retainers)

- Arc Testnet, rpc.testnet.arc.network, block 69,700,130, read-only: time escrow `0xdB32e026B2FB71e4A40E68ded28bC075c1fe11C1` has code (13.3 KB); `hub()` = `0xB874…38a6`; `hub.isFamily(time)` true; no events from the escrow since block 69,500,000, so no engagement has been opened yet. `asset()` reverts: the Time family names the asset in each engagement's terms.
- `hub.openingConfig(time, USDC)`: open true, feeBps 100, fee recipient `0x915E…8d9E`, perDealCap 1,005 USDC, highValue 5,000 USDC, review Safe `0x5538…cAAA`, senior Safe `0x40A0…9296`, auto arbiter `0x9Fef…D3d`, yieldBps 0; `totalCapOf(time, USDC)` 10,000 USDC. The per-deal cap counts what an engagement holds at once, so one funded week holds at most about 1,000 USDC of budget plus the hirer's half of the fee.
- `dealIdFor(0x…01, 0x…02)` reads `0x8c6e…7284`; the backend's id derivation is tested against this vector before any open is sent.
- Circle: the same contract execution docs read today for financing and contests (developers.circle.com/contracts/scp-interact-smart-contract): `createContractExecutionTransaction` with tuples as nested arrays, which `open(bytes32,(address,address,uint128,uint32,uint32,uint32,uint16,uint64,uint64,uint32,uint32,uint8,bool,uint16,uint16,bytes32))` needs. SDK `@circle-fin/developer-controlled-wallets` 10.8.0.
- Still to check before the first send: `termsHashOf` against the backend's hashing, the event signatures the watcher listens for, and the full week on an Arc fork.

## 2026-10-29 · Agents that always answer, phases 2 to 4 (T1.8, view 41)

No Arc or Circle code changed. Phase 2 (lowest and usual price, no highest), phase 3 (quantity for goods) and phase 4 (seller index, matching on post and on save, example stock never a seller, posted-to-first-decision measure) live in backend/src/agents, backend/src/matching, backend/src/llm/quantity.ts, backend/src/marketplace/matchCandidates.ts, routes, the assistant, the frontend, the guide and the canon. The seller agent's board writes still go through the market board helpers in seller.ts, unchanged by these phases; no contract, chain or Circle call was added, so no docs check or read-only test applies.
Not checked here: backend/src/chain/timeEscrow.ts and db/engagements.ts belong to the hourly-work session (view 32, Time family), which owns their Arc and Circle entry.

## 2026-10-29 · Time escrow, part 4 built (view 32)

- Change: `backend/src/chain/timeEscrow.ts` (calls, money maths, receipt proofs), `backend/src/work/workLive.ts` sends `open`, `accept`, `cancelOffer`, `fundCycle`, `submit`, `approve`, `object` and `giveNotice` through Circle `executeContractCall` from the hirer's buying agent or the worker's selling agent (`open(bytes32,(address,address,uint128,uint32,uint32,uint32,uint16,uint64,uint64,uint32,uint32,uint8,bool,uint16,uint16,bytes32))`, the terms tuple as a nested array); `settle`, `close` and `applyFallback` from the yield operator key (`OPERATOR_PRIVATE_KEY`); `escalate` from `SUITE_ARBITER_KEY` (the hub's auto arbiter).
- Docs: the Circle contract execution page read today for financing and contests (tuples as nested arrays). SDK `@circle-fin/developer-controlled-wallets` 10.8.0.
- Read-only test: the forge artifact's 15 method identifiers are each found in the deployed bytecode at `0xdB32…11C1`; `termsHashOf(fixed terms)` = `0x425d…fa78` and `dealIdFor(0x…01, 0x…02)` = `0x8c6e…7284` equal the backend's hashing (`backend/src/chain/timeEscrow.test.ts`). The id is `keccak256(abi.encode(chainid, escrow, employer, salt))`.
- Fork run, 2026-10-29, Arc Testnet forked at block 69,713,734 (`ARC_FORK_BLOCK=69713734 scripts/ops/arc-fork.sh up`, then `scripts/ops/arc-fork.sh e2e hourly < /dev/null`), fresh wallets, the auto arbiter impersonated: 15 USDC an hour, up to 20 hours, 2 weeks; week 1 funded 301.50 at open; 750 minutes approved paid the worker 186,562,500 at once and settle returned 113,062,500; week 2 funded, 1,200 minutes logged, 300 objected: 223,875,000 paid at once, escalated, and `applyFallback` after 5 days paid 37,312,500 more (17.5 hours gross, 262,500,000); close recorded 450,000,000 paid gross; a 400 USDC monthly retainer paid 398,000,000 by silence; an unaccepted offer returned 50,250,000 in full. All checks passed. Nothing was sent to testnet.
- Docs, SDK and chain agree.


## 2026-10-29 · Hourly work posted to the market (view 32)

No new Arc or Circle call. Posted work (`backend/src/work/workRequests.ts`, `workRank.ts`, `workRequestsLive.ts`, `routes/workRequests.ts`, migration 53) keeps requests and rates off chain and hires through the hourly work core logged above, which sends the same `open` and `accept` through Circle contract execution (`@circle-fin/developer-controlled-wallets` 10.8.0) and is proved on the Arc fork at block 69,713,734. No docs check or read-only test beyond that entry applies.

## 2026-10-30 · Older contracts table for the team (view 37, C4)

- No new Arc or Circle surface. The table reads USDC `balanceOf` on each older contract and the same `positions`, `escrows(bytes32)` getters and `eth_call` step simulations the legacy page already uses (checked 28 and 29 Oct, entries above). No transaction is sent.
- Timelock batch executed (owner's Safe), tx `0x3a0e08bc381cfc8ed98976cda268325873eb536f39cffc3549a944cc3b9c8c6f`; operation `0xba29…df5e` done. Read back 2026-10-30: `bindingOf(1)` and `bindingOf(4)` = karwan-check `0080cdf7…0126` (tag `c570ccbaae`), `bindingOf(2)` = karwan-record `006ebc31…a2ae` (`14e006f9b7`), `bindingOf(3)` = karwan-risk `000dde74…2b35` (`3954def827`); each tag is the first 10 hex of sha256(name). `hub.isIssuer(adapter)` true. Pre-flight: both GitHub tokens on node-services answer 200 on karwan-replay and the fixture repo; fixture PR #1 open at `df41b5c1…`; production (image 497aaea) answers 402 for the deal; buyer holds 95.90 USDC, relayer 1 USDC.

## 2026-10-30 · Held-match review (T2, view 21)

- No Arc or Circle code changed. The work is the security match gate's hold (an off-chain record on the deal), the support review routes, the per-party deal response and the deal page copy. No contract call, SDK call or chain read is added or altered; the on-chain guardian hold is not touched by a record-only review.

## 2026-10-30 · Record first for Get paid now (T4, view 18)

- No Arc or Circle code changed. The website reuses the record-step batch the funding path already sends from a person's own wallet (view 27, decision 10, checked 27 Oct above); the family request route adds the reason line to its refusal. No contract call, SDK call or chain read is added or altered.

## 2026-10-30: first live dry run, and the CRE gateway's header rule

- Read-only test (live): the owner's agent run `0xd53368c1…ebdd` on deal `0x1e91…0339` opened on Arc (fee run state 1, 0.25 USDC, readable at the finalized block) and Karwan started karwan-check execution `0xe4f63bb8…506f`. That execution failed: `ConsensusFailed` with 9 node errors `[3]InvalidArgument … blocked request: HTTP header not allowed: User-Agent`. No GitHub replay was dispatched. Replaying each step by hand from node-services with node-services' tokens works (terms read, policy fetch 200, runner blob `b81fbff8…` equal to the policy, fee run held).
- Source: smartcontractkit/chainlink `core/services/gateway/network/httpclient.go` (read 2026-10-30): `defaultBlockedHeaders` = host, content-length, transfer-encoding, user-agent ("gateway controls its own identification"), upgrade, expect, connection, keep-alive, te, trailer, x-forwarded-for, x-forwarded-host, x-forwarded-proto, x-real-ip; allowed methods GET, POST, PUT, PATCH, DELETE. The CRE simulator (CLI v1.38.0 and v1.33.0) does not apply the list, so the 28 Oct simulation passed.
- Docs: https://docs.chain.link/cre/service-quotas (read 2026-10-30): 15 HTTP calls per execution, 250 KB response, 120 KB request, 10 s connect, cache maxAge 10 minutes, 3 min per capability call, 5 min per execution. Our calls fit (cache `600s` is the maximum). The docs do not list blocked headers.
- SDK: `@chainlink/cre-sdk` 1.23.0 in karwan-check and karwan-record.
- Change (uncommitted, not yet tested): `cre/shared/github.ts` builds GitHub headers without User-Agent and lists the gateway's blocked headers; `cre/shared/github.test.ts` fails if a workflow header is on that list; karwan-check and karwan-record use it. Redeploying both changes their workflow ids, so kinds 1, 4 (check) and 2 (record) need a new timelock binding.

## 2026-10-30 · Karwan's test financier follows the ask and competes (T4, view 18)

No Arc or Circle code changed. The test financier's terms (`money/familyFinancing.ts` testFinancierTerms), when it offers (`agents/testFinancier.ts`, a sweep two hours after the ask) and the tie order (`routes/factoringRanking.ts`) are off-chain decisions; the offer still goes through the same createFamilyOffer path and the same KarwanTradeFinance calls checked on 29 Oct. Agree: yes, nothing to re-check.
- 2026-10-30, claims in `cre/CHANGELOG.md` Phase 3 checked read-only on rpc.testnet.arc.io: `KarwanCreAdapter` `0x4eA2…79CD` and `KarwanCreFees` `0x9553…9c7e` have code; `bindingOf(1)` is still the old karwan-check `0080cdf7…` (the redeployed `00fc7a5b553cb839f4dbf5c94d05d8210bcca90a6d8650b2dd59fc59a221eaa3` waits for the new timelock batch); run `0xd533…ebdd` still held (state 1), so the refund claim stands. Execution counts are from the owner's CRE dashboard screenshot (3,151 successful in 7 days). The changelog states that no live run has written to Arc yet.
- 2026-10-30 08:40 UTC: karwan-check redeployed as `00fc7a5b…eaa3`; karwan-record is `008b63ef…00a1` (deploy reported it already registered and unchanged, so the fixed build is live). New batch `contracts/deployments/cre-5042002-2026-10-30.{schedule,execute}.json`, salt `0xa17409bb…9c6a`. Read-only on rpc.testnet.arc.io: `scheduleBatch` as the owner Safe succeeds, from a stranger reverts; `bindWorkflow` 1 and 4 (check), 2 (record), 3 (risk, unchanged id) each succeed as the timelock and revert from the Safe; `setIssuer(adapter, true)` succeeds as the timelock; each exact bind calldata is inside the batch.
- 2026-10-30 08:58 UTC: the owner Safe scheduled the new batch (tx `0x9efe7c65…e6f4`, block 69,814,577, status 1). Operation `0xa0fbec03…4b70` is pending, ready at 1793437025 = 2026-10-31 08:57:05 UTC. Production `.env` now names karwan-check `00fc7a5b…` and karwan-record `008b63ef…`; `karwan-api` restarted 08:54:56 UTC on image `6b32dec`, healthy. The first run's fee (`0xd533…ebdd`) is still held, not yet refunded.

## 2026-10-30 · backend copy of cre/shared/github.ts

- What: `node scripts/cre-shared-sync.mjs` copied `cre/shared/github.ts` (added in 792a1a39, the Chainlink gateway User-Agent fix) into `backend/src/cre/shared/github.ts`, byte for byte plus the sync header.
- No Arc or Circle call, SDK or contract changed: the file has no imports and the workflow source it mirrors was already committed and deployed by its own session. Nothing to check against docs.
- Read-only test: backend suite on node-services, HEAD 79bbc5da plus this file: 3481 pass, 0 fail, including `cre/sharedSync.test.ts`.

## 2026-10-30 · Every seller who fits offers, step one (T1, view 41)

No Arc or Circle code changed. Read `contracts/src/KarwanJobBoard.sol` submitBid (read only): a bid takes any price above zero and any future deadline, so an offer at the seller's lowest above the buyer's budget needs no contract change. The bid's deadline stays the job's deadline, as before. Agree: yes.

## 2026-10-30 · Every seller who fits offers, step two: the shortlist (T1, view 41)

No Arc or Circle code changed. The shortlist order, the marks and the must-link refusal at choosing are off chain. Funding still refuses a seller whose agent is not bound (`deals/sellerBinding.ts` sellerBindingRefusal, unchanged), so a deal's record can never land on the agent. Agree: yes.

## 2026-10-30 · Every seller who fits offers, step three: the seller's days (T1, view 41)

No Arc or Circle code changed. The seller's days ride off chain on the offer event; the on-chain bid deadline stays the request's deadline, which `KarwanJobBoard.acceptBid` only checks as still in the future (read 30 Oct). The deal's delivery date is the off-chain one funding already re-anchors (`reanchoredDealDeadline`). Agree: yes.

## 2026-10-31 · Batch 1, dead ends and words (foundation, view 44)

No Arc or Circle code changed. In `backend/src/money/familyFinancing.ts` only the words of the `guarantee_short` refusal changed ("Put up X USDC more as a deal guarantee" became "Deposit X USDC more into your deal guarantee"); the gap it computes, the guarantee read and every chain call are untouched. `GET /api/features` reads whether the Time escrow ports are bound (`work/workLive.ts`), no chain call. Agree: yes.

## 2026-10-31 · Batch 2, navigation and one Deals list (foundation, view 44)

No Arc or Circle code changed. `/deals` reads the same deal, match and financing lists the Profile open-deals panel already read (`GET /api/deals/direct`, `GET /api/jobs/matches/for`, `GET /api/factoring/mine`, `GET /api/po-financing/mine`); the stage of each deal comes from the existing `stageOf`. The assistant gains a `deals` page link, no new tool and no chain call. Agree: yes.

## 2026-10-31 · First live CRE dry run written to Arc (T2, CRE bounty)

Read only, no code changed. The owner ran `backend/src/scripts/cre-dry-run-agent.ts` against deal 0x1e91da0b…0339 on commit df41b5c1 at 09:45 UTC.
- x402: 402 for 0.25 USDC to KarwanCreFees 0x9553…9c7e, signed ReceiveWithAuthorization, run id 0x9ac0ac75bd46922942f5398e65aa0a6e56289616eff3020033680943b0011eb2, 202 Accepted.
- Arc, pay: tx 0x80f923c978fb3803d94db32f015afb5b888b96b7420e3017a1a4fe2f04b1be44, block 69990140 (fee contract event on the run id).
- Chainlink: karwan-check HTTP execution 22867b60-7d51-4b77-a5fb-0947a014ab4e (09:45:50, SUCCESS); the per-minute execution 46242f03-ed23-467f-9ac6-0b648b3ff53b (09:47:01, SUCCESS, 28 s) called WriteReport (`cre execution events`).
- Arc, answer: tx 0x154576559e6604ed25b7932381bb9bcf6f807da05d15fcaf1e41467dc5d93a83, block 69990335, from 0x8038…5c58 to forwarder 0x76c9…5e62, status 1. Report metadata names workflow 00fc7a5b553cb839… and name tag `c570ccbaae` (the Safe's 31 Oct binding); report kind 4 (DRY), body (fees, run id, resultHash 0x38e4118a…183a70). Adapter 0x4eA2…79CD and KarwanCreFees `Released(runId, resultHash)` both emitted; 0.25 USDC (250000) moved from the fee contract to 0x915e…8d9e. Forwarder ReportProcessed result 1.
- Gap found: `GET /api/x402/cre/dry-run/<runId>` still answers `{"state":"started"}` after the release. The agent reads the release from Arc, so the run completed, but Karwan's own record does not follow it. The report carries only a result hash, so no pass or fail decision is public.
Agree: yes, the hosted workflow, the binding and the fee release match the deployment record.

## 2026-10-31 · DON report verifier: workflow ids without 0x (T2, CRE dry run)

- Docs (docs.chain.link, read 31 Oct): "Submitting Reports via HTTP" says HTTP submissions must have their signatures verified by the receiver, unlike onchain writes where the forwarder verifies; the signer set comes from the Capability Registry on Ethereum mainnet, not the workflow registry. Report metadata carries workflowId as bytes32. Our verifier follows that and is unchanged in what it checks.
- SDK: viem 2.55.11 installed (backend asks ^2.21.0). No Chainlink SDK in the backend; the verifier is our port.
- Read-only test, 31 Oct: ran `verifyDonReport` on the DRY report the forwarder delivered in tx 0x154576…3a83 with production's settings. Registry read for DON 1: f = 3, 10 signers; the report carries 4 signatures. Result `UNKNOWN_WORKFLOW`: the header gives `0x00fc7a5b…`, production's `CRE_CHECK_WORKFLOW_ID` is `00fc7a5b…` as the CRE CLI prints it, and the comparison did not strip `0x`. So every DON-signed post to `/api/cre/dry-run/result` and `/api/cre/risk/alerts` has been refused, and the 31 Oct run stayed "started" at Karwan though it was answered on Arc.
- Fix: compare workflow ids ignoring the 0x prefix, as the route's own check already does. Signature, owner and registry checks are untouched.
Agree: yes, docs and the live report agree; the fault was ours.

## 2026-10-31 · Batch 3, the market (T1, view 44)

No Arc or Circle code changed. Listings gain an off-chain `category` (picked by the seller or read from the words) and a public seller summary read from the existing passport and record level; `GET /api/listings/fits` reads the saved request shortlists. No chain call, no contract, no money path. Agree: yes.

## 2026-10-31 · Batch 4, the order flow (T1 and T5, view 44)

No new Arc or Circle call. The order page moves money only with calls that already run on the deal page: `POST /api/activation/fund-agent` (an email or passkey account's balance to its buying agent, Circle-signed as today), `GET /api/deals/direct/:jobId/funding-quote` and `POST /api/deals/direct/:jobId/fund` (paid in on the escrow `fundingEscrowFor` already picks). A wallet account adds money with the existing `FundAgentFromWallet` transfer. `GET /api/listings/:id/quote` reads the fee the same way the funding quote does (suite limits, else the v3 escrow, else the older escrow) and builds the total with `buildDirectDealFundingQuote`. The seller's agent accepting an order is the existing off-chain seller approval (`approveSellerAgreement`); nothing is written on chain until the buyer pays in. Agree: yes.

## 2026-10-31 · Batch 5, the deal page for every kind (T2 and T1.2, view 44)

No Arc or Circle code changed. The deal page reads the same deal fields as before (the chain read `onChain` for released parts and the seller's net); release and claim call the existing routes through a new confirm sheet. The one backend change is the rating read (`GET /api/deals/:id/rating` adds the rating received), which touches no chain. Agree: yes.

## 2026-10-31 · Batch 6, request and offers (T1, view 44)

No Arc or Circle code changed. The request page reads the existing shortlist; Accept calls the existing choose route; the kind picker only routes to forms that already exist. The words "Nothing is paid until you accept an offer" were checked against `agents/buyer.ts`: a match is proposed for the buyer's approval and the escrow is paid in only on approve or choose. Agree: yes.

## 2026-10-31 · Answered dry runs kept being collected (T2, CRE dry run)

- Read only: karwan-check failed 72 times between 13:01 and 18:39 UTC on 31 Oct (`cre execution list --status FAILURE`), all `ConsensusFailed ... AGGREGATION_TYPE_IDENTICAL; Values received: [200,409,409,409,200,200,409,409,409,200]` on the step that posts the dry-run answer to Karwan. Production runs 10132d2 since about 12:50 UTC, which carries the verifier fix, and `/api/x402/cre/dry-run/0x9ac0…11eb2` now returns the signed report.
- Cause, ours: in `cre/karwan-check/check.ts` a dry item's outcome `dry-run` is not in `CLOSE_ON`, so Karwan's pending index keeps it and every schedule pass writes and posts it again. Each node of the DON sends the post; the first get 200, the rest 409 from the one-use report guard, so identical consensus fails. Before the verifier fix every node got the same 401, so the loop ran quietly.
- Fix in the backend, no workflow change (a workflow change means a new id and a 24-hour timelock binding): `/api/cre/dry-run/result` answers every node the same for one signed report, and closes the item once the payload says Arc shows the fee released. Signature, workflow and payload checks are unchanged.
Agree: yes; no Arc or Circle call changed.

## 2026-10-31 · Batch 7, money (T5 and T4, view 44)

No Arc or Circle code changed. "Held in your deals" is added up on the page from the deals list the person can already read. Withdraw's first screen only hands the amount and address to the existing out rail (`RailPanel` with `prefillAmount` and `prefillRecipient`), which keeps its own limits, World ID checks and confirm. The guarantee page reads the same `GET /api/guarantee`. Agree: yes.

## 2026-10-31 · Batch 8, profile and problems (T3 and T2, view 44)

No Arc or Circle code changed. Profile reads its own counts from the existing `GET /api/r/:tag`; the public record drops the score and counts it showed. Something is wrong only routes to the existing appeal (`POST /api/deals/direct/:jobId/appeal`) and Messages. The open problem reads `deal.dispute` and `deal.disputedBy`, both already in the deal response, and no money moves without the reviewer step in `backend/src/deals/disputeJudge.ts`. Agree: yes.

## 2026-10-31 · Batch 9 part A, desktop and removals (foundation, view 44)

No Arc or Circle code changed. The removed money page read the same balances the money page reads; the bridge, its rails and the money switch it uses are untouched. Agree: yes.

## 2026-11-01 · Profile and money tidy, one balance on Arc (T5 and T3, view 44)

- Change: the balance every surface counts (`backend/src/money/ownedBalanceModel.ts`, `ownedBalance.ts`, frontend `features/money/ownedBalance.ts`, `useOwnedBalance.ts`) no longer reads or adds USDC on the seven other CCTP testnet chains. It is the Arc wallet plus its confirmed Gateway balance plus the two agents, stake beside it as before. The money page drops its per-network list and shows the Gateway balance as one line (owner's ruling, 1 Nov).
- No call was added or changed. The calls that remain are the ones already in use: `readUsdcBalance` on Arc (USDC at `0x3600000000000000000000000000000000000000`, 6 decimals) and `readPooledBalance` (Gateway `/v1/balances`, `confirmed`). Removed: `readSourceUsdcBalance` for the other chains in this read only; the bridge and add-money flows still read them.
- Circle docs, 1 Nov 2026 (circle MCP): Gateway technical guide says `/v1/balances` returns the latest balance recorded by Gateway, the amount available to transfer; the Arc Testnet GatewayWallet is `0x0077777d7EBA4688BDeF3E311b846F25870A19B9` (domain 26). Matches `backend/src/gateway`.
- Installed: `@circle-fin/app-kit` 1.15.2, `@circle-fin/developer-controlled-wallets` ^10.8.0, viem ^2.21.0 (backend/package.json); unchanged.
- Read-only test: `ownedBalanceModel.test.ts` (wallet 710.97 + Gateway 121.35 + agents 697.40 = 1529.72, stake 7050 beside it, partial when the Gateway read fails), run on node-services 1 Nov, 36/36 with the guide tests.
- `backend/src/cre/wiring.ts` is another session's change, not part of this entry.

Agree: yes.

## 2026-11-01 · Released dry runs still collected (T2, CRE dry run)

- Read only: since the repeat-post fix went live (19:11 UTC 31 Oct) karwan-check and karwan-risk failed 37 times up to 00:17 UTC 1 Nov, none after. Every one is `context deadline exceeded` from the DON nodes to `api.karwan.site` (GET pending, POST dry-run answer) and once to `api.github.com`; Caddy logged five `connection reset by peer` 502s on `/api/cre/dry-run/result`, and the API logged two Arc `chain-probe-timeout`s in the same window. No logic error.
- Why it kept posting: production `cre_check_items_v1` still holds `dry-9ac0…11eb2` as pending, and the stored answer says `released: false`. `KarwanCreFees.runs(0x9ac0…11eb2)` on Arc Testnet at `0x9553ff79B13f27D767B2A94BB8428a8e6A7D9c7e` returns state 2 (Released) (viem `readContract`, `rpc.testnet.arc.io`, 1 Nov). `check.ts` sets `released` only when its own DRY write lands, and a second write to a released run never does, so every pass writes to Arc and posts again, which doubles the calls exposed to those timeouts.
- Fix in the backend, no workflow change: `/api/cre/dry-run/result` reads `runs(runId)` on Arc and closes the item when the state is Released (2) or Refunded (3), from `contracts/src/suite/KarwanCreFees.sol` `State { None, Open, Released, Refunded }`. An Arc read that fails leaves the item as it is.
- Workflow follow-up for the next redeploy: read the fee run before writing and close released runs in `CLOSE_ON`.

Agree: yes.

## 2026-11-01 · Batch 9 part B, the old deal page goes (T2, view 44)

No Arc or Circle call was added or changed. The deal page now calls routes the old page already used: `POST /api/deals/direct/:jobId/cancel/propose` with `refund-from-dispute` or `release-from-dispute`, `cancel/accept`, `delay-appeal`, `delay-appeal-respond`, and `payouts/:reference/reconcile`, which re-checks the same Arc movement before any new payout. A deal on an older escrow now shows only a link to Earlier deals, where its existing steps live. The buyer's trade-record confirmation (`BuyerPodPanel`, `acceptPoD` on the deployed registry) moved into the Delivery row unchanged. Agree: yes.

## 2026-11-03 · Data gate for paid record reads (T1 with T3, view 48 step 1)

- Docs: circle MCP, read 3 Nov 2026. `gateway/nanopayments/howtos/x402-buyer` and `quickstarts/buyer`: a buyer deposits USDC into the Gateway Wallet once, then pays x402 sellers with offchain signatures through `BatchEvmScheme` / `GatewayClient` (`chain: "arcTestnet"`); `getBalances()` reports the Gateway balance. Matches `backend/src/x402/buyerClient.ts` (`payX402`, `ensureGatewayFunding`, `gatewayAvailableUsd`).
- Installed SDK: `@circle-fin/x402-batching` 3.0.4 (`node_modules/@circle-fin/x402-batching/package.json`), the version in backend/package-lock.json. Unchanged.
- Read-only test: `POST https://gateway-api-testnet.circle.com/v1/balances` `{"token":"USDC","sources":[{"domain":26,"depositor":"0x369f09cd56c7aa87c1e89aaadfb088150b47620e"}]}` (Cotton Co's agent x402 signer) → `balance 0.440000`, `pendingBatch 0`.
- What changes: no Arc or Circle call is added or changed. The gate decides whether `paidRecordRead` is called at all (reuse of a kept read for the same reader, subject and request) and records an `agent.paid` event after a payment.

Agree: yes.

## 2026-11-03 · Record read price 0.005 USDC, and outside research on the agent stack (T1 with T3, view 48 step 1)

- Price: the in-market record read `GET /api/x402/record/:subject` moves from 0.01 to 0.005 USDC (owner, 3 Nov), set once as `RECORD_READ_PRICE_USDC` in `backend/src/x402/recordReadGate.ts` for both the 402 the route sends and the Gateway top-up the paying agent makes. No call changes; x402 nanopayments take any amount (docs, entry above).
- Outside research on Circle's agent stack: the installed circle `pay-via-agent-wallet` skill (circle-skills 1.0.0) and the Gateway contract table (circle MCP, read 3 Nov) say the services marketplace is paid with `circle services search / inspect / pay`, a cost preview with `--estimate`, and chains `BASE`, `MATIC`, `ETH`, `ARB`, `OP`, `AVAX`, `UNI`, all mainnet with real USDC. No Arc Testnet sellers are listed.
- Agree: no, for outside research on testnet. People's agents on Karwan hold test USDC on Arc Testnet and cannot pay mainnet sellers. Stopped before code; owner decision asked.

## 2026-11-03 · `backend/src/routes/x402.ts` record price constant (T1 with T3, view 48)

- Change: `PRICES.record` in `backend/src/routes/x402.ts` now reads `RECORD_READ_PRICE_USDC` (0.005) from `backend/src/x402/recordReadGate.ts`, the same constant `buyerClient.ts` tops the Gateway up by. The 402 requirements, `chargeRead` and the facilitator call are unchanged.
- Docs: circle MCP `gateway/nanopayments/howtos/x402-buyer` and `x402-integration`, read 3 Nov 2026: the seller states the amount in its 402, the buyer signs it from its Gateway balance; no minimum amount is stated.
- Installed SDK: `@circle-fin/x402-batching` 3.0.4.
- Read-only test: Gateway `POST /v1/balances` (domain 26, Cotton Co's x402 signer) → `{"token":"USDC","balances":[{"domain":26,"depositor":"0x369f09Cd56C7aa87C1E89AAADfb088150b47620e","balance":"0.440000","pendingBatch":"0"}]}`.
- Agree: yes.

## 2026-11-03 · Research as a paid read on Arc, verify then serve then settle (T1, view 48 decision 2)

- Docs: circle MCP, read 3 Nov 2026. `gateway/nanopayments/concepts/batched-settlement`: the seller submits the signed authorization to Gateway, which verifies it, locks the buyer's funds and credits the seller; the seller serves at once. `quickstarts/seller` and `howtos/facilitator-integration`: `BatchFacilitatorClient` exposes `verify()` and `settle()`; the note says `settle()` "is optimized for low latency and guarantees settlement. Use settle() directly rather than calling verify() followed by settle() in production flows."
- Installed SDK: `@circle-fin/x402-batching` 3.0.4; `backend/src/x402/sellerFacilitator.ts` already calls `verify()` then `settle()`.
- What changes: a new `requirePaymentAround` runs `verify()`, then the paid work (the outside search Karwan pays for), then `settle()`. A search that fails is never settled, so the person's agent pays nothing for it. Existing paid reads keep `requirePayment` unchanged.
- Difference from the docs' recommendation: `verify()` does not lock funds, so a payer could spend the balance between verify and settle and Karwan would carry the search cost (at most 0.028 USDC). The research read therefore serves only Karwan's own in-market agents (the `x-karwan-payer-agent` header with its x402 signer, the same check as record reads), whose wallets Karwan runs, so that gap cannot be used. Outside agents are not offered it; on mainnet the person's agent pays marketplace sellers directly.
- Read-only test: Gateway `POST /v1/balances` for Cotton Co's x402 signer, earlier entry today (0.44 USDC, pending 0).
- Agree: yes, with the scoped use above.

## 2026-11-03 · Research credit refund script (T1, view 48 decision 2)

- What it does: `backend/src/scripts/refund-research-credit.ts` returns prepaid research credit with a plain ERC-20 `transfer` of Arc USDC (`0x3600000000000000000000000000000000000000`, 6 decimals) from the treasury EOA to each person's buying agent (or own wallet), signed with a key the owner passes at run time and checked against `KARWAN_TREASURY_ADDR`. Report-only by default.
- Docs: arc-docs, read 18 Oct 2026 (entry above): USDC at that address with 6 decimals, gas paid in USDC. An EOA transfer, so the receipt status is the real result (the ERC-4337 inner-revert caveat applies to agent smart accounts, not this signer).
- Installed: viem ^2.21.0 (backend/package.json), `erc20Abi`, `writeContract`, `waitForTransactionReceipt`.
- Read-only test: `eth_call balanceOf(0x178f583CFEfC814f5A81F350081b8F29f5B4c649)` on `https://rpc.testnet.arc.io`, 3 Nov 2026 → `0x416a52c` = 68.593964 USDC, enough for the 54.681 USDC of credit held by 23 accounts (testnet DB read the same day).
- Agree: yes.

## 2026-11-03 · `backend/src/x402/researchAccount.ts` deleted (T1, view 48 decision 2)

- Change: the research credit module is removed. It held a profile credit and its activation fee, paid with a Circle wallet `transfer` from the buying agent to the treasury (`routes/research.ts` `/activate`, also removed). No Arc or Circle call is added; one is removed. Agents now pay for research over x402 nanopayments (entries above today).
- Docs: circle MCP `gateway/nanopayments/howtos/x402-buyer`, read 3 Nov 2026 (entry above).
- Installed SDK: `@circle-fin/x402-batching` 3.0.4, `@circle-fin/developer-controlled-wallets` ^10.8.0; unchanged.
- Read-only test: treasury `balanceOf` on Arc Testnet, 3 Nov 2026 (refund entry above): 68.593964 USDC.
- Agree: yes.

## 2026-11-03 · Research reads kept, web price bands (`backend/src/x402/externalClient.ts`, view 48 step 4)

- Change: a fresh research read is also written to `market_reads_v1` and loaded back at boot within the 6-hour window; `webPriceBands` reads the cache per market category. The paid Exa calls over x402 (`payExternal`), their amounts and the Base payer are unchanged.
- Docs: circle MCP `gateway/nanopayments/howtos/x402-buyer`, read 3 Nov 2026 (entries above). Nothing here reaches Gateway or a wallet.
- Installed SDK: `@circle-fin/x402-batching` 3.0.4, unchanged.
- Read-only test: Gateway `POST /v1/balances` for Cotton Co's x402 signer, 3 Nov 2026 (entries above).
- Agree: yes.

## 2026-11-03 · Weekly data budget in the data gate (`backend/src/x402/dataGate.ts`, view 48 step 6)

- Change: before a paid record read or research, the gate checks the owner's agent record (weekly budget, 0.25 USDC by default) and refuses without paying when it would go over; after a payment it adds the amount to the record. `paidRecordRead`, `paidResearch`, the x402 calls and their prices are unchanged.
- Docs, SDK and read-only test: the entries above today (circle MCP nanopayments buyer guide; `@circle-fin/x402-batching` 3.0.4; Gateway balances read for Cotton Co's signer).
- Agree: yes.

## 2026-11-03 · Add money and Withdraw in the new look (T5, view 48 batch 9a)

- Change: look and words only on `/bridge` (PlainChooser, DepositCard, BridgeCard, BridgeOutCard, GatewayBalanceCard, SolanaConnectCard, BridgeActivityStrip, TransferProgress, WithdrawStart). Every App Kit, CCTP, Gateway and Circle wallet call, its arguments and its route are unchanged. Two flow fixes on the way out: the out card now receives the amount and address typed on Withdraw's first screen (it dropped them), and a review sheet asks once before the same `startCircleOut` / `startWeb3Out` / `startArcSend` call runs.
- Docs: circle MCP, 3 Nov 2026: Bridge Kit is part of Arc App Kit (docs moved to docs.arc.network/app-kit/bridge, release note 2026.03.17); the Gateway Forwarding Service how-to still covers Arc Testnet to Base Sepolia. Nothing here changes which of these the app uses.
- Installed SDK: `@circle-fin/app-kit` 1.15.2 (frontend and backend), `@circle-fin/adapter-viem-v2` 1.18.0, `@circle-fin/adapter-solana-kit` 1.6.3, viem 2.55.11 (frontend); unchanged.
- Read-only test: `https://rpc.testnet.arc.io` on 3 Nov 2026, `eth_chainId` → `0x4cef52` (5042002, Arc Testnet), `eth_blockNumber` → `0x4345207`.
- Agree: yes.

## 2026-11-05 · Agent data balance shown as a move, record checks capped per request (T1, view 48)

- Change: the balance watcher labels an agent wallet's USDC Transfer to the Gateway Wallet contract as a move into the agent's data balance instead of a cash out; the data gate caps paid record reads per request (seller 1, buyer 5 at 0.005 USDC); the weekly line and `get_my_agent` add the Gateway balance of the person's x402 payer. No Gateway, Circle wallet or contract call changes; `ensureGatewayFunding` (`approve` + `depositFor`) and `X402_GATEWAY_DEPOSIT_USD` stay as they are.
- Docs: circle MCP nanopayments buyer guide (entries of 3 Nov 2026 above): `depositFor` moves USDC into the Gateway Wallet contract and credits the beneficiary's Gateway balance.
- Installed SDK: `@circle-fin/x402-batching` 3.0.4, `@circle-fin/developer-controlled-wallets` ^10.8.0; unchanged.
- Read-only test, 5 Nov 2026: testnet movement `KWN-DF5N-9D5A-NHPW` is a Transfer of 100000 micro-USDC from selling agent `0x9ec570…8c39` to `0x0077777d…19B9`, the Gateway Wallet in `backend/src/chain/networks.ts`; Gateway `POST /v1/balances` (domain 26) for that person's x402 payer `0xa2bb44…d72c` returns 0.084000 USDC.
- Agree: yes.


## 2026-11-05 · Karwan MCP for outside agents, paid tools and job escrow wiring (T1, views 15 and 40 part C)

- Change: `POST /mcp` (MCP Streamable HTTP, stateless) with seven tools. `find_counterparty` (0.10 USDC) and `check_person` (0.005 USDC) are paid with x402 through Circle Gateway's batched facilitator into the treasury; the five deal tools hand the outside agent the exact job escrow calls (`createJobWithTerms`, `setBudget`, `approve`, `fund`, `claimRefund`). Karwan's reviewer key completes or rejects only after the paired person answers with World ID; `release` and `confirmRejection` are sent once their windows pass.
- Docs: circle MCP `gateway/nanopayments/howtos/x402-seller` and `x402-integration`, read 5 Nov 2026: `new x402ResourceServer([new BatchFacilitatorClient()])` with `register('eip155:*', new GatewayEvmScheme())` from `@circle-fin/x402-batching/server`. `@x402/mcp` 2.30.0 README and dist: `createPaymentWrapper(resourceServer, { accepts, resource, hooks })`, payment in `_meta["x402/payment"]`, and settlement only after the handler answers without `isError`, so a refusal is never charged. `@modelcontextprotocol/sdk` 1.32.2 `WebStandardStreamableHTTPServerTransport` with `sessionIdGenerator: undefined`. Job escrow access read from `contracts/src/suite/jobs/JobLib.sol`: `setBudget` client or provider, `fund(id, expected)` client only and reverts unless the budget equals `expected`, `submit` provider before `expiredAt`, `complete` evaluator only, `release` anyone after the review window, `reject` evaluator on a submitted job, `disputeRejection` provider within 3 days, `confirmRejection` anyone after them, `claimRefund` client after `expiredAt`.
- Installed SDK: `@modelcontextprotocol/sdk` 1.32.2 and `@x402/mcp` 2.30.0 added; `@x402/core` and `@x402/evm` raised from 2.14.0 to 2.30.0 so one core serves `@x402/mcp` and `@circle-fin/x402-batching` 3.0.4 (4.0.0 also works, not taken). The x402 record-read and side-door tests pass on 2.30.0.
- Read-only test, 5 Nov 2026 on node-services: `BatchFacilitatorClient({ url: 'https://gateway-api-testnet.circle.com' }).getSupported()` returns for `eip155:5042002` the `exact` scheme with `GatewayWalletBatched` v1, verifying contract `0x0077777d7eba4688bdef3e311b846f25870a19b9`, USDC `0x3600000000000000000000000000000000000000`; `buildPaymentRequirements` for `$0.10` gives amount `100000`, `maxTimeoutSeconds` 604900. Same with batching 3.0.4 and 4.0.0.
- Agree: yes. Arc's ERC-8183 tutorial funds with the job number only; ours takes the expected budget, which is why the MCP hands the exact calls (view 40).

## 2026-11-05 · Top up in one tap, and the Transfer balance on Money (T5, view 51, proposed)

- Change: none yet. View 51 proposes an Add money sheet on Money (wallet rows by network through the existing CCTP Fast route, the Transfer balance spent with the browser wallet, the deposit address) and two actions on the Transfer balance row (Move to balance, Add to it through `unifiedBalance.deposit`). The calls are the ones already in `features/gateway/lib.ts` and `useBridge`.
- Docs: circle MCP, 5 Nov 2026. `gateway/nanopayments/howtos/x402-buyer`, step 5: Gateway deposit time is about 0.5 s on Arc Testnet, about 8 s on Avalanche Fuji and Polygon Amoy, about 5 s on HyperEVM and Sei, and 13 to 19 min on Arbitrum, Base, Ethereum, Optimism, Unichain and World Chain Sepolia. `cctp/concepts/finality-and-block-confirmations`: Fast Transfer attestations take about 8 s from Base, Arbitrum, OP, Solana and Unichain, and about 20 s from Ethereum. `gateway/references/technical-guide`: Gateway front-loads finality, so spends after a finalised deposit are instant. `gateway/howtos/create-unified-usdc-balance`: deposit must use the Gateway Wallet `deposit()`, and a plain ERC-20 transfer to it is lost.
- Installed SDK: `@circle-fin/app-kit` 1.15.2 (frontend and backend); unchanged.
- Read-only test, 5 Nov 2026: `https://rpc.testnet.arc.io` `eth_chainId` → `0x4cef52` (5042002), `eth_blockNumber` → `0x438abc7`; Gateway testnet `POST /v1/balances` (domain 26, a zero-balance depositor) returns `balance` and `pendingBatch` per domain.
- Agree: yes. The docs explain why view 51 sends a top-up straight to Arc by default: a Gateway deposit from Base waits for finality, and CCTP Fast does not.

## 2026-11-05 · USDC rates for "Show amounts in" (T5, view 51 task 1)

- Change: `backend/src/rates/usdcRates.ts` and `GET /api/money/rates`. These are display-only rates. No Arc or Circle call changes, and money stays in USDC.
- Sources: CoinGecko `GET https://api.coingecko.com/api/v3/simple/price?ids=usd-coin&vs_currencies=ngn,usd,eur,gbp,cny,inr,aed,kes,xof&include_last_updated_at=true` (public, no key, updates about every minute) is the main source. open.er-api.com `GET /v6/latest/USD` (public, daily) is the fallback. Each is read at most once per 60 s, and a figure is never shown more than 15 min after it was true.
- Read-only test, 5 Nov 2026: CoinGecko gave `usd-coin` usd 0.999778, ngn 1346.11, eur 0.889118, gbp 0.741927, cny 6.67, inr 94.4, aed 3.67, kes 129.91, xof 583.22. open.er-api (`result: success`, updated Thu 05 Nov 2026 00:02:31 UTC) gave NGN 1346.47, EUR 0.8899, GBP 0.7423, CNY 6.6854, INR 94.62, AED 3.6725, KES 129.87, XOF 583.75.
- Agree: yes. The two sources agree to within 0.4% on every currency.

## 2026-11-05 · View 51 built: Add money sheet and Transfer balance moves (T5)

- Change: `frontend/features/money/components/AddMoneySheet.tsx` calls the existing `startAppKitBridge` (CCTP to the person's Arc address, as `CrossChainFlow.submit` does), `gatewayEstimateSpend` then `gatewaySpend` with `topUpWithFees` (as `CrossChainFlow.askPool` does), and `gatewayDeposit` (as `GatewayBalanceCard` does). No arguments, routes or SDK calls changed.
- Docs: the entries of 5 Nov 2026 above (Gateway deposit times, CCTP Fast times).
- Installed SDK: `@circle-fin/app-kit` 1.15.2, unchanged. No new package: the network logos are inlined from `@web3icons/core` 4.0.58 (MIT).
- Read-only test: the same Arc Testnet and Gateway reads as the entry of 5 Nov 2026 above.
- Agree: yes.

## 2026-11-05 · One balance, agents draw what a check or deal needs (T5, view 51 third round, proposed)

- Change: none yet. The third round of view 51 proposes that agents keep no money of their own on screen. An email or passkey account's agent is filled from the sign-in wallet by Karwan, as `routes/activation.ts` already does for agent top-ups (Circle contract execution, `transfer(address,uint256)` from `circleIdentityWalletId`). A wallet account approves its buying wallet once, capped at the weekly limit, and the buying wallet takes exactly what a check needs with `transferFrom`.
- Docs: arc-docs, 5 Nov 2026. `arc/references/contract-addresses#usdc` and `integrate/defi/amm-and-pools`: USDC on Arc has a built-in ERC-20 interface at `0x3600000000000000000000000000000000000000` that implements `transfer`, `approve` and `transferFrom` over the native balance, 6 decimals. `integrate/wallets/add-arc-to-a-wallet` 5.2: an allowance bounds only the `transferFrom` path, and native sends bypass it; do not treat an allowance as a cap on a smart account's total spending.
- Installed SDK: unchanged (`@circle-fin/app-kit` 1.15.2; viem in the frontend).
- Read-only test, 5 Nov 2026: `https://rpc.testnet.arc.io` `eth_call` to `0x3600…0000` `allowance(0x…dead, 0x…beef)` → `0`, `decimals()` → `6`.
- Agree: yes, with one limit stated. The allowance is safe as the cap here because the person's own wallet (an EOA they sign with) grants it and only `transferFrom` can use it; the buying wallet's own money still needs Karwan's mandate check in code (view 52). Still to prove before code: a buying wallet (Circle SCA) calling `transferFrom` on Arc Testnet for 0.01 USDC, and the weekly limit refreshing the allowance only with the person's signature.

## 2026-11-05 · /mcp asks agents to sign their own sentence (T6, view 15)

- Change: `backend/src/agentkit/agentKitChallenge.ts` takes an optional `statement`; `/mcp` passes "Verify this agent is backed by a person before it uses Karwan", research keeps its report sentence. No Arc or Circle call, address, chain id or SDK use changes. The challenge still names Arc Testnet (`eip155:5042002`) for eip191 and eip1271 signing.
- Docs: World AgentKit only; the statement is free text in the signed SIWE-style message, and Karwan's verifier never compares it to a fixed value (`agentKitVerification.ts`).
- Installed SDK: `@worldcoin/agentkit` 0.2.1, unchanged. No Arc or Circle SDK touched.
- Read-only test, 5 Nov 2026: `POST https://api.karwan.site/mcp` with no header → 401 with the challenge, `supportedChains` `eip155:5042002` eip191 and eip1271, `Cache-Control: no-store`; `GET` → 405.
- Agree: yes. Nothing on Arc or Circle to reconcile.

## 2026-11-05 · Walk accounts funded from the Circle testnet faucet (foundation, fix plan item 2)

- Change: none yet. The internal test bed on node-services will create its own Circle wallet set and developer-controlled wallets on Arc Testnet and fund them with `POST /v1/faucet/drips` (`blockchain: ARC-TESTNET`, `usdc: true`), using the testnet API key copied to `~/.karwan-walk/testnet.env`.
- Docs: Circle, 5 Nov 2026, `w3s/developer-console-faucet`: the Console faucet gives 20 USDC per request, ten requests per developer account every 24 hours, Arc Testnet listed; the page also notes that calling `/v1/faucet/drips` "requires upgrading to mainnet". arc-docs, 5 Nov 2026: testnet USDC comes from the Circle Faucet (faucet.circle.com, 10 USDC per address per 24 hours).
- Installed SDK: `@circle-fin/developer-controlled-wallets` as in `backend/package.json`, unchanged; the faucet call is plain HTTPS.
- Read-only test, 5 Nov 2026: `POST https://api.circle.com/v1/faucet/drips` with an empty body from node-services → 400 `code -1` "Something went wrong". Not conclusive: it neither accepts nor refuses the account.
- Agree: not proven. The first drip to the walk buyer's own wallet settles it. If the account is refused, the owner tops up the walk wallets from the Console faucet while signed in, and the seed script reads balances instead of dripping.
- Update, 5 Nov 2026: the owner confirms the Circle Console account is upgraded, which the drips page names as the condition for `/v1/faucet/drips`. Still settled by the first drip, logged here when it runs.
- Settled, 5 Nov 2026: `POST /v1/faucet/drips` `{blockchain: ARC-TESTNET, usdc: true}` to the walk bank `0x536a56c0262b01cabbd3e6b1f0859ceb43c21930` answered 204, and `balanceOf` on `0x3600…0000` read 20 USDC right after. Agree: yes for this upgraded account. Note: `backend/src/circle/wallets.ts` still lists ARC-TESTNET in `WEB_FAUCET_ONLY` from an older 403, so the app's own refuel skips Arc; that is now stale for this account.

## 2026-11-05 · Money typed in your own currency (T5, view 55)

- Change: `money/model.ts`, `money/bridge.ts`, `money/cashout.ts`, `routes/bridge.ts` and `routes/cashout.ts` gain an optional `quote` on the request and an optional `local { currency, amount, rate, at }` kept on the Karwan money movement record. The USDC amount, recipient, chain, contract calls, Circle transfers and App Kit use are unchanged; the quote only decides which figure the record keeps beside the USDC, and is kept only when it moves exactly that USDC.
- Docs: arc-docs, 5 Nov 2026, `arc/references/contract-addresses#usdc`: USDC on Arc keeps its ERC-20 interface at `0x3600000000000000000000000000000000000000` with 6 decimals, so a quote rounds down to the micro (6 places).
- Installed SDK: unchanged (`@circle-fin/app-kit` 1.15.2).
- Read-only test, 5 Nov 2026: `https://rpc.testnet.arc.io` `eth_call` `decimals()` on `0x3600…0000` → `6`.
- Agree: yes. Nothing on Arc or Circle changes behaviour.

## 2026-11-06 · A token that is not USDC is recorded, never credited (T5, view 59, audit M-04)

- Change: `circle/depositWatcher.ts` keeps rejecting anything that is not the allowlisted USDC, and now writes one Activity row (no USDC amount) and an admin-visible record for a non-native token landing on a deposit or payment link address. It reads `symbol` from the same `getToken` call it already makes. Nothing is moved, swapped or swept.
- Docs: Circle developers, 6 Nov 2026, `w3s/programmable-wallets-primitives` (Monitor tokens): a token's attributes include name, standard, blockchain, decimals, symbol and token address.
- Installed SDK: `@circle-fin/developer-controlled-wallets` 10.8.0, `Token` type: `isNative: boolean`, `symbol?: string`, `decimals?: number`, `tokenAddress?: string`, `blockchain`.
- Read-only test, 6 Nov 2026, from node-services with the walk TEST key: `GET /v1/w3s/wallets/{walk bank}/balances` → two tokens, `{symbol: USDC, decimals: 18, isNative: true, blockchain: ARC-TESTNET}` and `{symbol: USDC, decimals: 6, isNative: false, standard: ERC20}`. Note: on Arc, USDC is also the native coin, so the "network coins stay in the log" rule never records Arc's own USDC.
- Agree: yes. `symbol` is optional in the type, so the row falls back to "a token".

## 2026-11-06 · App Kit bridges finish after a restart (T5, view 60, audit M-05 and RT-13)

- Change (proposed): App Kit bridges with the Forwarding Service (`useForwarder: true`) keep the burn hash on the bridge row as soon as App Kit reports it, and a reconciler reads Circle's attestation API for every App Kit row that has a burn hash and is not minted: on boot, on `/recheck` and on `/resume`, and every minute while any are open. `forwardState` CONFIRMED or COMPLETE with a `forwardTxHash` marks the row minted with that hash; FAILED marks it for attention and the mint is retried with `kit.retry`.
- Docs: Arc docs, 6 Nov 2026, `app-kit/references/bridge-error-recovery`: `kit.retry(result, { from, to })` resumes a failed `BridgeResult` from its last good step. Circle docs, 6 Nov 2026, `cctp/concepts/forwarding-service` (Circle broadcasts the destination mint) and `cctp/howtos/resolve-stuck-attestation` (`GET /v2/messages` statuses).
- Installed SDK: `@circle-fin/app-kit` 1.15.2, `@circle-fin/bridge-kit` 1.15.1, `@circle-fin/provider-cctp-v2` 1.14.0. The provider's own forwarder wait (index.mjs, around line 12451) polls `GET /v2/messages` and accepts `forwardState` CONFIRMED or COMPLETE with a non-empty `forwardTxHash`, and throws on FAILED; its `retry` also accepts a result whose step is still pending and waits for it.
- Read-only test, 6 Nov 2026, Circle sandbox attestation API, burns taken read-only from the testnet bridges table: Base Sepolia `0xaaac…d469` on domain 6 → `{status: complete, forwardState: COMPLETE, forwardTxHash: 0x187b…5037}`, destination domain 26 (Arc); Solana devnet `4Qj7…AhX7` on domain 5 → `{status: complete, forwardState: COMPLETE, forwardTxHash: 0x3d91…c496}`.
- Agree: yes. The attestation API alone is enough to finish a forwarded bridge's record from its burn hash, the same signal App Kit itself waits on.
- Finding, 6 Nov 2026, same provider source (index.mjs around line 12481): on `forwardState: FAILED` the forwarder wait throws `RELAYER_FORWARD_FAILED` with the advice to check the recipient's balance and, if the mint did not happen, submit it by hand from the attestation in the error cause. `kit.retry` with `useForwarder: true` re-enters that same wait, so it cannot recover a FAILED forward. Built accordingly: a FAILED forward is held for support, not retried.

## 2026-11-06 · One runner per background job (foundation for T2 and T5, view 61, audit M-06)

- Scope: `circle/appKitFinish.ts` and `money/familyFinancingRunner.ts` only change how often their pass runs and in which process (it now runs under a Postgres lease). No Arc or Circle call, argument or response handling changed.
- Docs: Circle docs, 6 Nov 2026, `cctp/howtos/resolve-stuck-attestation` (`GET /v2/messages` may be read any number of times, so a pass repeated by a second process is harmless). Nothing in the Arc docs bears on how often a job reads.
- Installed SDK, 6 Nov 2026: `@circle-fin/app-kit` 1.15.2, `@circle-fin/provider-cctp-v2` 1.14.0, `@circle-fin/developer-controlled-wallets` 10.8.0, the same as view 60.
- Read-only test: the two attestation reads recorded under view 60 today (Base Sepolia and Solana devnet, both COMPLETE). The lease adds no new call to test.
- Agree: yes.

## 2026-11-06 · Deal guarantee hooks that failed are retried or held (T2, view 62, audit CR-02)

- Scope: the Agreement escrow's stake hooks. A vault that refuses `release`, `slash` or `extend` only emits `StakeHookFailed(dealId, hook)` (0 release, 1 slash, 2 keep). Only the keep step has an on-chain retry (`KarwanAgreementEscrow.keepStake(dealId)`, anyone, Accepted or Disputed). An expired reservation can be freed by anyone with `KarwanStakeVault.releaseStale(family, ref)`. A failed slash has no retry.
- Docs: Arc docs, 6 Nov 2026, `arc/references/rpc-endpoints` (`eth_getLogs` block range limit 10,000 blocks, error -32012 above it, page in 9,999-block chunks) and `integrate/infrastructure/indexing-events` (backfill with `eth_getLogs` ranges, persist the last block).
- Source read, 6 Nov 2026: `contracts/src/suite/agreement/AgreementCommon.sol` (hooks), `AgreementDisputeLib.sol` (slash per ruled tranche, release on the last), `KarwanStakeVault.sol` (`extend` refuses after expiry, `releaseStale` after expiry, `expiryOf` 0 when nothing is reserved). No SDK is involved: plain viem reads and writes on Arc.
- Read-only test, 6 Nov 2026, Arc Testnet public RPC: head 71,009,686. `getLogs` for `StakeHookFailed` (topic `0xba6d5b43…d169`) on the Agreement escrow `0x5546…F43C` over 9,999 blocks returned 0 logs; a 10,002-block window was refused. Escrow hub `0xB874…38a6` names the vault `0xF5FD…07ed5`; `expiryOf(escrow, 0x0)` read 0.
- Agree: yes.

## 2026-11-06 · A held delivery link is held on chain too (T2, view 63, audit RT-09)

- Scope: on a family deal whose delivery link is held, the buyer's agent wallet (a Circle developer-controlled wallet Karwan holds) calls `requestMoreTime(bytes32)` once, then `dispute(bytes32,bytes32)` if the link is still held. These are the existing `chain/agreementEscrow.ts` writes, through Circle contract execution. No new SDK call.
- Docs: Circle docs, 6 Nov 2026, `contracts/scp-interact-smart-contract` (`createContractExecutionTransaction` with `walletId`, `contractAddress`, `abiFunctionSignature`, `abiParameters`; the write is asynchronous and needs gas). Contract source, 6 Nov 2026: `AgreementDeliveryLib.claimBar` refuses `claim` while the deal is not Accepted (a dispute makes it Disputed). `moreTime` needs a started review, before the review end, with an extension left. `reviewEndOf` includes held time.
- Installed SDK: `@circle-fin/developer-controlled-wallets` 10.8.0.
- Read-only test, 6 Nov 2026, Arc Testnet public RPC, Agreement escrow `0x5546…F43C`: deal ids taken from the escrow's own logs. `getDeal`, `getTerms` and `reviewEndOf` read back `reviewWindow` 3,600, `maxExtensions` 1, `extensionSecs` 3,600, `silentLongstop` 612,000, `reviewStarts` 0 (review starts on delivery), `extUsed` 0.
- Agree: yes.
