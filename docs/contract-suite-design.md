# Karwan contract suite: mainnet architecture

Status: engineering design dated 23 September 2026. This is not a deployment or
availability record. As of 25 September, the mainnet release includes the wallet
and two registries, not the full escrow suite. See [README](../README.md) for
the release boundaries and [escrow-design.md](./escrow-design.md) for deal terms,
clocks, disputes and delivery checks. Yield and agent-binding sections describe
design requirements, not available customer features or promised returns.

## 1. Security requirements

The implementation and audit must verify these requirements:

1. **Contract-held funds.** Deal money, stake and yield sit in contracts. No function sends
   them to a Karwan wallet or to any address that is not a party to the deal, a financier the
   seller chose, or the fee treasury.
2. **The terms decide.** Every payout follows terms both sides signed on-chain.
3. **Every deal can end without Karwan.** Parties and time alone reach a final state.
4. **Admins are bounded.** Every admin power is listed, capped, timelocked where it changes
   rules, and unable to move deal money except a ruling on an escalated dispute.
5. **Money is conserved.** USDC in equals USDC out, per deal and in total, at every step.

## 2. Contract map

```
                         ┌───────────────────────────┐
     parties ───────────▶│  DealEscrow (versioned)   │──── reads ───▶ EvidenceRegistry (CRE receipts)
     (passkey wallets,   │  terms, clocks, payouts   │
      agent wallets)     └──┬──────────┬──────────┬──┘
                            │          │          │
                deposit /   │ reserve /│ record   │ fees
                withdraw    ▼ release /▼ outcome  ▼
                   ┌──────────────┐ ┌───────────┐ ┌───────────────┐
                   │  YieldPool   │ │ StakeVault│ │  Reputation   │   FeeTreasury
                   │ (long-lived, │ │(long-lived)│ │ (long-lived)  │   (long-lived)
                   │  USYC        │ └─────┬─────┘ └───────────────┘
                   │  whitelisted)│◀──────┘ deposit idle stake
                   └──────┬───────┘
                          │ subscribe / redeem
                          ▼
                    Circle USYC Teller

   Governance:  OwnerSafe ──▶ Timelock (48h) ──▶ config on every contract
                AdminReviewSafe (1 of 4) and SeniorReviewSafe (2 of 4) ──▶ rule() on escalated disputes
                Guardian key ──▶ hold / attest / pause new deals (bounded)
```

**Long-lived contracts** (deployed once, never replaced unless broken): `YieldPool`,
`StakeVault`, `Reputation`, `FeeTreasury`, `EvidenceRegistry`, `BusinessRegistry`.

**Versioned contracts** (a new version can be added without touching the others): `DealEscrow`,
`POFinancing`, `InvoiceRegistry`, `JobBoard`.

### How a new escrow version avoids a cascade

Each long-lived contract keeps an **allowlist of client contracts** instead of one hard-wired
address:

- `YieldPool.isClient(escrowV2)`: may deposit and withdraw its own principal.
- `StakeVault.isConsumer(escrowV2)`: may reserve and release stake for deals the staker accepted.
- `Reputation.isRecorder(escrowV2)`: may record outcomes.

Adding a client is a timelocked owner-Safe action with an event. **Removing a client never strands
money:** a removed escrow can still withdraw its own principal from the pool and release its own
reservations, so old deals finish on the old version while new deals open on the new one. This
replaces today's pattern, where the vault's escrow is one-shot and several contracts hold a single
repointable address. That pattern forces a cascade on every escrow change. It is also why the
USYC whitelist had to be redone after each redeploy.

## 3. YieldPool: yield without custody

Standing decisions (2026-07-02): escrowed money earns USYC yield, the yield belongs to the
protocol treasury, and principal is always returned in full. What changes here is the route. The
built route sends USDC to an operator's own address to be wrapped off-chain. That is custody, and
it goes. The pool subscribes and redeems USYC itself, on-chain.

**Rules the pool enforces:**

- Only allowlisted clients (escrow versions, the stake vault) deposit, and each client can only
  withdraw up to its own recorded principal. `principalOf[client]` is exact USDC.
- The pool keeps a **liquid buffer** in USDC: `max(bufferFloor, bufferBps * totalPrincipal)`.
  Only money above the buffer is subscribed to USYC, and only in a keeper-triggered `rebalance()`
  that anyone can call (no privileged keeper).
- A client withdrawal is paid from the buffer first, then by redeeming USYC in the same
  transaction. **A client always receives exactly the principal it asks for, or the call reverts
  with nothing moved.**
- **Yield** is `poolValue - totalPrincipal`, valued conservatively (USYC at the lower of oracle
  price and 1.0 par, with a staleness guard). Only yield above a safety margin can be swept, and
  only to `FeeTreasury`. There is no other outbound path.
- **Principal guarantee:** if the value ever falls below `totalPrincipal` (a NAV drop), the pool
  stops sweeping, and `FeeTreasury` tops it up through `backstop()`. The shortfall is visible
  on-chain as `deficit()`.
- **When USYC is unavailable** (not entitled on mainnet yet, Teller paused, redemption limit), the
  pool simply holds USDC. `rebalance()` becomes a no-op. Yield is optional; liveness is not.

**How escrow exits stay live:** the escrow keeps its own liquid float for deals that are about to
pay out (anything delivered or within `payoutHorizon` of a clock), and only deposits longer-lived
principal into the pool. If a pool withdrawal reverts (Teller paused and buffer spent), the exit
still completes: the party's amount is credited to `owed[party]` in the escrow and becomes
withdrawable the moment liquidity returns (`withdrawOwed`). No deal ever stalls on yield.

**Threshold (decided 2026-07-02):** only principal expected to sit longer than `minYieldAge`
(proposed 3 days) and above `minYieldSize` (proposed 500 USDC per deal) is routed. Short deals
never touch USYC.

**Mainnet note:** USYC on Arc mainnet is limited to eligible non-US institutions with a $100,000
minimum. Until Karwan's pool address is entitled, it runs in USDC-only mode. Whitelisting happens
once, for the pool address, and survives every escrow version.

## 4. StakeVault: slashing without an extra user step

Today a seller who trades through an agent wallet must first call `approveAgent`, a separate
transaction, so the agent's deals can reserve the seller's stake. It exists because without it
anyone could claim to be your agent and have your stake slashed (the July P0). The consent stays.
The step goes away:

1. **Passkey wallets trade as themselves.** On mainnet an email user's passkey smart wallet is the
   deal party and the staker. Nothing needs binding. Reserving stake is part of accepting the deal
   (one signature the user already gives).
2. **Agent wallets bind with a signature collected at signup.** When the user creates an agent,
   the app asks the passkey wallet to sign one EIP-712 message: "Agent `0x…` may commit my stake to
   deals it accepts, up to `cap` USDC, until `expiry`." The backend submits it with
   `bindAgentWithSig(owner, agent, cap, expiry, nonce, signature)`. The vault checks it with
   OpenZeppelin `SignatureChecker`, which accepts both plain keys and smart-wallet (ERC-1271)
   signatures. No separate transaction, no gas for the user, and the cap and expiry bound what a
   compromised agent could commit.
3. **Slashing stays tied to a deal.** A reservation is created only by an allowlisted consumer (an
   escrow version or PO financing), only when the staker or their bound agent accepts that deal,
   and only up to the amount in the signed terms. The beneficiary is fixed at reservation: the
   deal's buyer, or the financier the seller chose.

**What goes (audit V-01 to V-03):**

- No instant `setConsumer`: consumers are added through the timelock.
- No `withdrawForYield` to an operator: idle stake goes to `YieldPool` like escrow money, with the
  same principal guarantee. Yield on stake is distributed by the existing yield distributor.
- `adminRelease` only works on a reservation whose consumer has marked the deal final, which
  stays the stranded-reservation escape hatch, never a way to strip live insurance.

## 5. Deal shapes the suite must survive

Internet deals vary a lot. The contract has one state machine; shapes differ only in their terms.
This table is the checklist the design is tested against.

| Shape | Examples | Main risk | How the terms handle it | Supported |
| --- | --- | --- | --- | --- |
| One-off service | logo, article, bug fix | buyer silence, vague scope | review time, delivery check, silence longstop | Yes |
| Milestone project | app build, audit | partial delivery, scope creep | up to 5 milestones, per-milestone review, split by agreement | Yes |
| Software with a repository | GitHub PR delivery | fake "done", broken build | CRE sandbox check, `ON_CHECK_PASS` | Yes (GitHub) |
| Digital goods, instant | files, templates, licences | "never received", resale of copies | delivery check on hashes, short review | Yes |
| Accounts, credentials, keys | domain, social account, API key | seller reclaims after sale | long review plus arrival-style confirmation, high-risk category rules | Restricted |
| Physical goods | electronics, fabric | transit time, damage, "not arrived" | `ON_ARRIVAL` review, arrival longstop, evidence | Yes |
| Cross-border business order | Net 30/60/90 | payment term length, fraud | net term as review time, business verification, stake | Yes |
| Financed order | PO or invoice financing | seller or financier fraud | seller offer required, assignment, stake | Yes |
| Refundable deposit | rental deposit, security deposit | who gets it by default | `silenceOutcome = REFUND_BUYER`: money returns unless a claim is proven | Yes |
| Retainer or subscription | monthly work | many small periods | a series of deals, one per period, from a template | App-level |
| Bounty or contest | many submitters, one winner | many sellers | not in v3 (one seller per deal) | No |
| Crypto or OTC swaps | "buy 11 USDC" | wash trading, sanctions | excluded category | No |

**Risks every shape shares, and the control for each:**

| Risk | Control |
| --- | --- |
| Buyer disappears | silence longstop pays the seller |
| Seller disappears | delivery deadline plus grace; buyer reclaims |
| Buyer disputes to avoid paying | automatic ruling from evidence, appeal, admin review; one dispute per side per milestone |
| Seller fakes delivery | delivery check before the buyer's review; mismatch does not start the clock |
| Collusion to farm reputation | breadth only from creditable, non-failed deals; stake; pair diminishing returns |
| Agent key stolen | agent binding cap and expiry; the human's own wallet can always act on the deal; arbiter can hold |
| Platform offline | every exit callable by parties from their own wallets |
| Arbiter offline | dispute lapses after the timeout; delivery kept |
| Checker offline | `checkLongstop`; buyer can review it themselves |
| Recipient blocklisted by USDC | payout credited to `owed`, rest of the deal completes |
| USYC paused or NAV drop | USDC-only mode, `owed` credits, treasury backstop |
| Arc halt or reorg | clocks are timestamps with margins in days, not seconds; confirmations before the app shows final |

## 6. Exploit catalogue (the test suite's attack list)

Each row becomes at least one exploit-first Foundry test that must fail against a naive version
and pass against the design. Rows marked * were real findings in the 2026-09-23 internal audit.

**Escrow**

| # | Attack | Must hold |
| --- | --- | --- |
| E1* | Buyer disputes late, waits out the timeout, lapses, reclaims an on-time delivery | on-time delivery survives lapse |
| E2 | Late seller marks inside grace, buyer disputes, lapse, re-mark, repeat | late mark wiped, no deadline credit |
| E3* | Seller claims on-chain before the agreed terms allow | terms stored on-chain, clocks read them |
| E4 | Buyer disputes over and over to stall payment | one dispute per side per milestone |
| E5 | Seller's payout to a blocklisted address freezes a split | credit to `owed` |
| E6 | Front-run `fund` with the same deal ID | deal ID derived from buyer and nonce |
| E7 | Buyer funds with terms the seller never saw | seller accepts the terms hash |
| E8 | Rounding leaves dust or overpays across milestones | last milestone pays the remainder; conservation invariant |
| E9 | Re-entrancy through a payout recipient | CEI plus nonReentrant; USDC has no hooks, test with a hook token anyway |
| E10 | Guardian holds forever | hold budget, auto-expiry |
| E11 | Automatic ruling applied before the appeal window | appeal window enforced |
| E12 | One admin reviewer rules on a large deal alone | 2 of 4 at or above `highValue` |
| E13 | Pause used to trap existing deals | pause blocks funding only |
| E14 | Timestamp manipulation at the edges | inclusive and exclusive bounds tested at t-1, t, t+1 |

**Yield**

| # | Attack | Must hold |
| --- | --- | --- |
| Y1* | Keeper or operator withdraws principal to its own address | no outbound path except client principal and yield to treasury |
| Y2 | Client withdraws more than it deposited | per-client principal accounting |
| Y3 | Yield swept while in deficit | sweep blocked while `deficit() > 0` |
| Y4 | Oracle stale or manipulated to inflate yield | conservative valuation, staleness guard |
| Y5 | Teller paused during payouts | exits complete through `owed` credits |
| Y6 | Donation attack skews accounting | accounting by recorded principal, not balance |

**Stake**

| # | Attack | Must hold |
| --- | --- | --- |
| S1 | Bind yourself as a stranger's agent and slash them | binding needs the owner's signature |
| S2* | Operator authorises a fake consumer and slashes stakers | consumers only through the timelock |
| S3 | Replay an agent-binding signature | nonce plus expiry plus domain separator |
| S4 | Agent commits more stake than the owner allowed | cap enforced per binding |
| S5 | Withdraw stake just before a slash | cooldown plus reservation lock |
| S6 | Admin cancels a live reservation | admin release only after the deal is final |

**Financing and reputation**

| # | Attack | Must hold |
| --- | --- | --- |
| F1* | Stranger finances a deal and takes the payout | seller offer required |
| F2 | Seller double-finances the same receivable | assignment is single and irrevocable |
| F3 | Financier defaults a line early | window enforced |
| R1* | Farm breadth with throwaway sellers or dust deals | creditable, non-failed outcomes only |
| R2 | Non-escrow writes reputation | recorder allowlist |
| R3* | Swap a business document after review | approval names the reviewed hash |

## 7. Stress-test plan

1. **Handler-based invariant suites** for each contract and for the whole suite together, with
   actors buyer, seller, agent, arbiter, guardian, keeper, stranger, and time jumps. Invariants: the
   13 in the escrow design plus pool solvency (`poolValue + backstopped >= totalPrincipal`), stake
   conservation, reservation conservation, and "no transfer to a non-party". At least 1,000,000
   calls per release candidate.
2. **Deal-shape scenario tests:** one end-to-end test per supported shape in section 5, including
   every failure branch (silence, late, dispute, lapse, check unavailable, blocklisted payee,
   Teller paused).
3. **Fuzzing of terms** at every bound.
4. **Differential model:** a TypeScript model of the state machine replays the same random action
   sequences, and the backend uses that same model, so product and contract cannot drift.
5. **Mutation testing** on escrow, pool and vault; surviving mutants must be killed by new tests.
6. **Fork tests** against Arc testnet with the real USDC, the real USYC Teller and the blocklisted
   test address.
7. **Static analysis** (Slither, Aderyn) in CI with a reviewed baseline.
8. **Internal audit round 2** on the frozen commit, then an external audit before caps rise.

## 8. Build order (fits the 30-day plan)

1. `YieldPool` and the new `StakeVault` (long-lived, most reused, most security-critical).
2. `DealEscrow` on top of them, per escrow-design.md.
3. `POFinancing` v3 on the new vault and escrow (seller offer, already fixed in source).
4. Reputation recorder allowlist; registries unchanged apart from fixes already made.
5. Suite invariants, scenario tests, fork tests, audit round 2.

## 9. Design parameters recorded on 23 September 2026

1. Yield route: on-chain `YieldPool`. The operator route is retired.
2. Agent binding: one signature at signup, with a cap and an expiry, submitted by the backend.
   Consent is kept; the separate `approveAgent` transaction goes away.
3. Yield scope: only deals expected to sit at least 3 days and at least 500 USDC; the pool keeps
   10% of principal liquid, at least 5,000 USDC.
4. The refundable-deposit shape (`silenceOutcome = REFUND_BUYER`) is included in this version.
