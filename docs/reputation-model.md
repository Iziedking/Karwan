# Reputation model

> The reputation score is the golden ticket on Karwan. It gates whose bids the agent prefers, whose briefs the agent trusts, who gets premium pricing, and who clears human review. Every other signal on the platform feeds into or out of it.

This document specifies the model. The current `KarwanReputation.sol` keeps three counters per address (`success`, `disputed`, `failed`) and divides them. That gets us a starting point, not a moat. The model below is what we replace it with — a formula that resists farming, rewards stake, penalises spam, and decays cleanly.

## 1. What reputation means

A single integer in `[0, 1000]` per address. It is **earned** through completed deals + locked stake + time on the platform. It is **lost** through cancellations, disputes, and detected spam. The score is the input to every match decision in the agent loop.

```
0 ─── 200 ─── 400 ─── 600 ─── 800 ─── 1000
  NEW     COLD    ESTABLISHED  STRONG  ELITE
```

Tiers map to:
- **NEW (0–199)** — fresh address. Agents route their bids/briefs to human review. Buyer agents counter aggressively on price.
- **COLD (200–399)** — some history. Agents accept inside profile bounds without escalation.
- **ESTABLISHED (400–599)** — earned baseline. Agents grant a small price premium and resolve ties in this user's favour.
- **STRONG (600–799)** — preferred counterparty. Agents accept marginal overshoots, fast-track matches.
- **ELITE (800–1000)** — top-tier. Agents accept first-look without auction if the price is within profile.

These thresholds are configurable; the formula is the load-bearing piece.

## 2. The formula

```
R(addr) = clamp(0, 1000, round(
    1000 ·
    tanh( 0.85 ·
        activityTerm(addr) ·
        completionTerm(addr) ·
        stakeTerm(addr) ·
        timeTerm(addr)
    )
    − 1000 · penaltyTerm(addr)
))
```

Each term is dimensionless in `[0, 1.0]` (penalty term in `[0, 1.0]` as well). The `tanh` envelope caps the upside and makes early gains feel fast; penalties subtract linearly so bad behaviour can drop you from ELITE in a few weeks.

### 2.1 activityTerm

```
activityTerm = log10(1 + completedDeals) / log10(51)
```

| completed | activityTerm |
|----------:|-------------:|
| 0  | 0.00 |
| 1  | 0.18 |
| 5  | 0.46 |
| 10 | 0.61 |
| 25 | 0.82 |
| 50 | 1.00 |
| 100 | 1.18 (capped by `tanh`) |

Logarithmic so the 51st deal doesn't matter much more than the 50th. Stops volume farming.

### 2.2 completionTerm

```
completionTerm = (completedDeals + 1) / (totalStarted + 2)
```

Laplace-smoothed success rate. The `+1/+2` keeps fresh accounts from being penalised on a single bad deal and prevents a 0/0 div.

| started | completed | term |
|--------:|----------:|-----:|
| 0  | 0  | 0.50 |
| 5  | 5  | 0.86 |
| 10 | 9  | 0.83 |
| 20 | 18 | 0.86 |
| 20 | 12 | 0.59 |
| 20 | 5  | 0.27 |

A 90% completion rate over 20 deals comfortably out-scores a 100% rate over 1 deal — exactly what we want.

### 2.3 stakeTerm

```
stakeTerm = 1.0 + min(1.0, sqrt(tenureWeightedStakeUsdc / 1000))
```

Range: `[1.0, 2.0]`. A 1000 USDC stake held for a year doubles the stake term. The square root kills linear gaming — a 10,000 USDC stake is the same as a 1,000 USDC stake (both capped).

| tenure-weighted stake | stakeTerm |
|----------------------:|----------:|
| 0      | 1.00 |
| 100    | 1.32 |
| 500    | 1.71 |
| 1000   | 2.00 (cap) |
| 10000  | 2.00 |

The term is `> 1.0` always, so staking never hurts. It is **weighted by deposit tenure** so age beats freshness:

```
tenureWeightedStakeUsdc = sum over Active vault positions of:
    principal × min(1.0, tenureDays / 365)
```

A position that's been open for a year counts at full weight. A two-week-old position counts at `14/365 ≈ 0.038`. This is what gives the score real skin-in-the-game without forcing arbitrary lock periods.

### 2.4 timeTerm

```
timeTerm = min(1.0, daysSinceFirstOnChainAction / 90)
```

A new wallet ramps from 0 to 1 over its first 90 days. Stops one-day-old wallets from instantly reaching ELITE with stake alone.

### 2.5 penaltyTerm

```
penaltyTerm = clamp(0, 1,
    0.30 · disputesLostRate
  + 0.15 · cancelRate
  + 0.40 · spamScore
  + 0.10 · counterAbandonRate
)
```

Each component is the rolling 90-day rate, normalised in `[0, 1]`. Penalties subtract directly from the score outside the `tanh`, so a clean record makes them inert and a dirty record cuts hard.

- **disputesLostRate** — `disputesLostLast90d / dealsLast90d`. Filing a dispute and losing is a strong negative.
- **cancelRate** — `cancelsLast90d / startedLast90d`. Match-then-cancel is the canonical churn pattern.
- **spamScore** — see §4.
- **counterAbandonRate** — `countersReceivedButNotAcceptedLast90d / countersReceivedLast90d`. A user who haggles forever and never closes burns the system's attention.

## 3. KarwanVault — staking for reputation

A new contract `KarwanVault.sol` separate from `KarwanEscrow`. It is a **flexible** vault — no forced lock periods. Users deposit any amount and request to withdraw any time. The reputation score they earn is purely a function of how long the deposit has sat continuously. Longer hold = more reputation, with diminishing returns past one year.

```solidity
function deposit(uint256 amount) external returns (uint256 positionId);
function requestWithdraw(uint256 positionId) external;   // starts 7-day cool-down
function cancelWithdraw(uint256 positionId) external;    // resume Active, keep tenure
function claim(uint256 positionId) external;             // pay out after cool-down

function isActive(uint256 positionId) external view returns (bool);
function activePrincipal(uint256 positionId) external view returns (uint256);
function tenureSeconds(uint256 positionId) external view returns (uint256);
```

A `Position` is `{owner, principal, depositedAt, cooldownStartedAt, claimableAt, state}` where `state ∈ {Active, Cooling, Withdrawn}`. The contract exposes view helpers so the backend reputation engine can compute `tenureWeightedStakeUsdc` per address by summing across that user's Active positions.

### 3.0 The 7-day cool-down

A withdrawal request transitions the position from `Active` to `Cooling` and freezes a `claimableAt = now + 7 days`. While in Cooling:
- The position contributes **zero** to the stake signal (`activePrincipal` and `tenureSeconds` return 0).
- The USDC remains in the vault. The user cannot rug it.
- The backend has a 7-day window to run fraud detection — burst deposits, suspicious counterparty patterns, match-and-cancel correlation. If a flag fires, the backend can pause the user's score or surface a human review prompt.
- The user can `cancelWithdraw` to restore `Active`. Their `depositedAt` is preserved, so all accrued tenure carries forward — honest users who change their mind lose nothing.

After 7 days the user calls `claim` and the principal is returned. The position becomes `Withdrawn`.

This is the platform's commitment device. A user cannot deposit, spike their reputation, take a deal, then withdraw the same day. They lose a week of stake signal during cool-down, and the backend sees the request before any funds move.

### 3.1 Mainnet path: USYC integration

On Arc Testnet, `KarwanVault` simply holds USDC idle. The stake signal works regardless.

On mainnet, `KarwanVault.deposit` instead routes deposits into Hashnote's USYC via the standard mint/redeem interface. The vault holds USYC shares; on withdraw it redeems back to USDC. The yield accrues to the depositor (less a small platform spread that funds the treasury). The reputation signal is unchanged — the only difference is the deposit is also earning ~5% APY for the user.

This is the one paragraph in the README. The vault interface stays the same. On testnet, locked USDC sits idle. On mainnet, locked USDC earns. The reputation model doesn't notice.

### 3.2 Idle escrow + the same path

The same wiring applies to **escrow** float. On testnet escrow funds sit idle in `KarwanEscrow`. On mainnet, the escrow holds USYC. Yield on the escrowed amount accrues over the deal window; on milestone release, the seller receives USDC (auto-redeemed) and the buyer's earned yield is credited back to them on settlement.

We do not implement that wiring this pass. The vault and reputation model arrive first; escrow USYC routing is a follow-up that reuses the same Hashnote interface.

### 3.3 What we ship today

- Solidity: `KarwanVault.sol` deployed to Arc Testnet. Flexible balance, 7-day cool-down on withdrawal, plain USDC holding.
- Backend: indexer that reads `Deposited`, `WithdrawalRequested`, `WithdrawalCancelled`, `Claimed`. Maintains per-address `tenureWeightedStakeUsdc` in the DB, feeds into reputation computation. Hooks the cool-down window into the fraud detection pipeline.
- Frontend: a "Stake to grow reputation" panel on `/profile` showing each open position with its tenure, current contribution to the score, and a "Request withdraw" button. After a request, the row shows the 7-day countdown and a "Cancel withdrawal" affordance.
- Copy: each surface that mentions stake also notes "On mainnet this deposit routes through USYC for ~5% APY."

## 4. Spam detection

Reputation drops on detected spam. Three signals feed `spamScore` (each rolling 7 days):

### 4.1 Burst rate

More than **5 deals or 5 listings posted in 24h** is flagged. Each extra post past the limit adds `0.05` to `spamScore` up to a cap of `0.40`. Real users don't post 8 listings in an hour.

### 4.2 Counterparty diversity

`uniqueCounterparties / totalDealsLast7d`. A user opening 10 deals all with the same other address gets ratio `0.1` → adds `0.30 × (1 - ratio)` to `spamScore`. Wash-trading the score by deal-pinging an alt account costs more reputation than it gains.

### 4.3 Match-and-cancel

`cancelsWithinFirstHour / totalMatchesLast7d`. A user matching and bailing in under 60 minutes more than `20%` of the time gets `0.30 × cancelRate` added. This is the canonical griefing pattern.

The components are summed and capped at `1.0` before going into `penaltyTerm`. Spam alone can drop your score by `400` points.

### 4.4 Appeal path

A user whose spam score is non-zero sees a banner on `/profile` explaining which signal tripped and how to reduce it (cool off, diversify counterparties, complete the next match). The score self-heals as the 7-day window rolls forward — there's no permanent ban from a single bad week.

## 5. Decay

Reputation that isn't refreshed decays slowly:

```
decayMultiplier = exp(-daysSinceLastDeal / 180)
finalScore = floor(R(addr) × decayMultiplier)
```

A wallet inactive for 6 months sees its score halve. This prevents a once-strong account from coasting forever. The "completedDeals" and "totalStarted" counts themselves do not decay — only the displayed score does. A returning user re-earns trust by completing one or two deals.

## 6. Agent integration

The buyer and seller agent loops already read `repTier`. Under the new model:

- **Buyer agent** (deciding which bid to accept):
  - Lead bidder is `ELITE` → accept at any price within profile, skip the auction window.
  - Lead bidder is `STRONG` → accept inside `+5%` of the next-best bid.
  - Lead bidder is `ESTABLISHED` → standard auction window.
  - Lead bidder is `COLD` → counter once at `−5%` even if price is in range.
  - Lead bidder is `NEW` → counter twice; route final accept to human if price is in the bottom decile of all bids on similar briefs.

- **Seller agent** (deciding whether to bid a brief):
  - Buyer is `ELITE` → bid at floor (good clients earn discounts).
  - Buyer is `STRONG` → bid at standard price.
  - Buyer is `ESTABLISHED` → bid at standard price.
  - Buyer is `COLD` → bid at `+10%` of standard.
  - Buyer is `NEW` → bid at `+15%` of standard AND flag the proposal for human approval.

Both sides see the other's score in MatchProposal so a human in the loop can override.

## 7. Migration from the v0 contract

The existing `KarwanReputation.sol` (`success / disputed / failed` counters) is now a **read-only legacy signal** that feeds `completedDeals` and `disputesLostRate`. We do not replace the contract; we read it as ground truth for on-chain history and add the new components in our DB.

Concretely:
- `completedDeals = chain.successCount`
- `disputesLost = chain.failedCount` (approximation; we tighten with our richer dispute outcomes table later)
- `totalStarted = deals_db.count_where(buyer = addr OR seller = addr)`
- `activeStakeUsdc = sum of vault locks indexed off `KarwanVault`
- `spam, cancelRate, counterAbandon, time` → backend tables

The composite score is computed server-side and published via `GET /api/reputation?address=0x…`. The on-chain contract stays the canonical source of completion outcomes.

## 8. Surface

- **ReputationBadge** keeps its current dot+number format, now sourced from the composite score.
- **/profile** gains a new band: **"Reputation"** showing the score, the tier, the four input terms broken out (activity / completion / stake / time), and the penalty bar if any.
- **Stake card** on `/profile`: 30/60/90 day buttons, USDC amount, "Reputation lift +N" preview. Active locks list with countdowns and an early-withdraw button (with the −25% reputation warning).
- **Marketplace cards** show the tier dot next to every party so users can glance at counterparty quality.
- **Mainnet badge** next to the stake card: small mono `// on mainnet this stake routes to USYC for ~5% APY`. No marketing, just the architectural note.

## 9. Configuration

All weights and thresholds live in `backend/src/reputation/config.ts` and are loaded from env:

```
REP_ACTIVITY_HALF = 50              # deals to saturate activityTerm
REP_STAKE_CAP_USDC = 1000           # stake at which stakeTerm caps
REP_TIME_RAMP_DAYS = 90             # days to reach full timeTerm
REP_DECAY_HALFLIFE_DAYS = 180       # decay window
REP_SPAM_BURST_LIMIT = 5            # posts per 24h before burst kicks in
REP_TIER_NEW = 200
REP_TIER_COLD = 400
REP_TIER_ESTABLISHED = 600
REP_TIER_STRONG = 800
REP_PENALTY_DISPUTE_W = 0.30
REP_PENALTY_CANCEL_W = 0.15
REP_PENALTY_SPAM_W = 0.40
REP_PENALTY_ABANDON_W = 0.10
```

Tuning happens via env, no redeploy. The formula itself stays version-pinned (`REP_MODEL_VERSION=1`) so historical scores stay comparable.

## 10. Out of scope (for now)

- Vouching / web-of-trust (high-rep users staking reputation on low-rep users they trust). Reasonable v2.
- Sybil resistance via Worldcoin / passport. Tracked but not integrated.
- Cross-chain reputation portability. Arc-only this pass.
- Slashing locked stake on dispute loss. The vault is honest collateral, not a bond. We add slashing only if disputes become common enough to need it.

---

**One-paragraph framing for README / pitch:**
On Karwan, reputation is the platform's golden ticket. It is a composite score in [0, 1000] across five terms — activity, completion, stake, time, and a negative penalty term for spam, cancellations, abandoned negotiations, and lost disputes. Users grow reputation by completing deals and locking USDC into the KarwanVault for 30 to 90 days. On Arc Testnet the vault holds plain USDC; on mainnet the same vault routes deposits through Hashnote USYC so the same stake also earns ~5% APY. The agent loop reads reputation directly: ELITE counterparties get first-look pricing, NEW counterparties get countered hard and routed to human review. Spam and griefing patterns are detected on rolling windows and shrink the score in days, not months. The score is a number you can grow, lose, and rebuild — which is the only way trust on a marketplace ever works.
