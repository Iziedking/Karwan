# Reputation model

> The reputation score is the golden ticket on Karwan. It gates whose bids the agent prefers, whose briefs the agent trusts, who gets premium pricing, and who clears human review. Every other signal on the platform feeds into or out of it.

This document specifies the model. The current `KarwanReputation.sol` keeps three counters per address (`success`, `disputed`, `failed`) and divides them. That gets us a starting point, not a moat. The model below is what we replace it with: a formula that resists farming, rewards stake, penalises spam, and decays cleanly.

## 1. What reputation means

A single integer in `[0, 1000]` per address. It is **earned** through completed deals, locked stake, and time on the platform. It is **lost** through cancellations, disputes, and detected spam. The score is the input to every match decision in the agent loop.

```
0 ─── 200 ─── 400 ─── 600 ─── 800 ─── 1000
  NEW     COLD    ESTABLISHED  STRONG  ELITE
```

Tiers map to:
- **NEW (0–199).** Fresh address. Agents route their bids and briefs to human review. Buyer agents counter aggressively on price.
- **COLD (200–399).** Some history. Agents accept inside profile bounds without escalation.
- **ESTABLISHED (400–599).** Earned baseline. Agents grant a small price premium and resolve ties in this user's favour.
- **STRONG (600–799).** Preferred counterparty. Agents accept marginal overshoots, fast-track matches.
- **ELITE (800–1000).** Top tier. Agents accept first-look without auction if the price is within profile.

Tier breakpoints are **fixed** at 200 / 400 / 600 / 800 (not env-tuned). The
*score* is the lever; a tier label means the same on testnet and mainnet.

## 2. The composite score

> The score is **additive**: every factor earns points on its own. An earlier
> multiplicative design multiplied its terms, so any zero factor (for example,
> zero completed deals) zeroed the whole score, and staking and time could not
> move a fresh account. The additive structure fixes that. Implementation:
> `backend/src/reputation/{engine,config,signals,stake}.ts`.

```
score = round( 1000 · base · (1 − penalty) · decay )

base  = wStake·stake + wCompletion·completion + wVolume·volume
      + wTenure·tenure + wActivity·activity + wReferral·referral      // each ∈ [0,1]
```

Default weights (env `REP_W_*`, sum to 1) are **stake-forward**, because staking grows
TVL and buys trust regardless of tier:

| Factor | Weight | Sub-score (concave → diminishing returns) |
|---|---|---|
| `stake` | 0.30 | `√(min(1, stakeUsdc / STAKE_CAP)) · (FLOOR + (1−FLOOR)·min(1, stakeDays / STAKE_FULL_DAYS))` |
| `completion` | 0.25 | `satLog(completedDeals, DEALS_CAP) · (0.5 + 0.5·successRate)` |
| `volume` | 0.13 | `√(min(1, lifetimeVolumeUsdc / VOLUME_CAP))` |
| `tenure` | 0.12 | `min(1, daysRegistered / TENURE_FULL_DAYS)` |
| `activity` | 0.12 | `satLog(activeDays, ACTIVE_CAP)` |
| `referral` | 0.08 | `satLog(referredUsers, REFERRAL_CAP)` (**input is 0 today; attribution rail ships with mainnet**) |

where `satLog(n, cap) = log10(1+n) / log10(1+cap)`, `successRate = (completed+1)/(started+2)`,
and `FLOOR = REP_STAKE_FLOOR_CREDIT` (default 0.4, so staking is worth 40% the day you
deposit, ramping to full over `STAKE_FULL_DAYS`).

**Penalty is a capped multiplier**, never a subtraction that can drive the score
negative: `penalty = min(REP_PENALTY_CAP, wDispute·disputeRate + wCancel·cancelRate
+ wSpam·spam + wAbandon·abandon)`, cap 0.6. A penalised wallet drops hard but always
keeps a path back. `decay = exp(−idleDays / REP_DECAY_HALFLIFE_DAYS)`.

**Diminishing returns as tier rises** are intrinsic: every sub-score is concave (your
first stake, deal, or day is worth far more than your hundredth), and the additive
structure means climbing STRONG to ELITE needs *several* factors high at once, not one
maxed. So early points come fast in NEW and the last 200 are the hardest.

**Earning factors (how points grow today):** lock more USDC and keep it staked longer
(`stake`); settle more deals cleanly (`completion`); move more value through escrow
(`volume`); stay registered (`tenure`); show up on more distinct days (`activity`).
Each is concave and weighted as above. A sixth signal, `referral`, is wired in the
config but its input is hardcoded to 0 today and ships as a mainnet marketing rail
once attribution is in place.

**Testnet vs mainnet is the caps, not the breakpoints.** Testnet defaults reach tiers
in days (`DEALS_CAP=10, STAKE_CAP=100, *_FULL_DAYS=14`). Mainnet raises them so tiers
are earned over months.

**Tier-up** crossing emits `reputation.tier-up`, opens a 48h congrats card on the
profile (`TierCelebration`), and Telegrams the user if linked. Tracked once per
crossing via `db/tierState.ts`.

### Worked example: one address to a tier

Take a seller forty days into the platform, on the testnet caps
(`DEALS_CAP=10`, `STAKE_CAP=100`, `STAKE_FULL_DAYS = TENURE_FULL_DAYS =
ACTIVE_DAYS_CAP = 14`, `VOLUME_CAP=500`, `FLOOR=0.4`). Their on-chain and
off-chain inputs:

| Input | Value |
|---|---|
| Staked | 60 USDC, held 18 days |
| Deals | 6 settled clean, 8 started |
| Volume | 300 USDC through escrow |
| Registered | 30 days ago |
| Active days | 8 distinct days |
| Referrals | 0 |
| Disputes / cancels / spam | none |

Each sub-score, with `satLog(n, cap) = log10(1+n) / log10(1+cap)`:

```
stake      = √(min(1, 60/100)) · (0.4 + 0.6·min(1, 18/14))
           = √0.6 · 1.0                               = 0.775
completion = satLog(6, 10) · (0.5 + 0.5·successRate)
             successRate = (6+1)/(8+2) = 0.70
           = 0.811 · (0.5 + 0.35)                     = 0.690
volume     = √(min(1, 300/500)) = √0.6                = 0.775
tenure     = min(1, 30/14)                            = 1.000
activity   = satLog(8, 14)                            = 0.811
referral   = satLog(0, 5)                             = 0.000
```

Weight and sum into the additive base:

```
base = 0.30·0.775 + 0.25·0.690 + 0.13·0.775
     + 0.12·1.000 + 0.12·0.811 + 0.08·0.000
     = 0.723

score = round(1000 · 0.723 · (1 − 0) · 1)            = 723   → STRONG
```

No penalty and recent activity leave the multipliers at 1, so the seller lands
at **723, STRONG**. Now suppose they lose one dispute, a 20% dispute rate over
their settled deals. The penalty term is `min(0.6, 0.5·0.20) = 0.10`, and the
score becomes `round(723 · 0.90) = 651`, still STRONG but 72 points lighter.
Climbing the rest of the way to ELITE takes several factors near full at once,
which is the concavity doing its job: the first stake and the first deals are
cheap, the last 200 points are not.

## 3. KarwanVault: staking for reputation

A new contract `KarwanVault.sol` separate from `KarwanEscrow`. It is a **flexible** vault. No forced lock periods. Users deposit any amount and request to withdraw any time. The reputation score they earn is a function of how long the deposit has sat continuously. Longer hold means more reputation, with diminishing returns past one year.

```solidity
function deposit(uint256 amount) external returns (uint256 positionId);
function requestWithdraw(uint256 positionId) external;   // starts 3-day cool-down
function cancelWithdraw(uint256 positionId) external;    // resume Active, keep tenure
function claim(uint256 positionId) external;             // pay out after cool-down

function isActive(uint256 positionId) external view returns (bool);
function activePrincipal(uint256 positionId) external view returns (uint256);
function tenureSeconds(uint256 positionId) external view returns (uint256);
```

A `Position` is `{owner, principal, depositedAt, cooldownStartedAt, claimableAt, state}` where `state ∈ {Active, Cooling, Withdrawn}`. The contract exposes view helpers so the backend reputation engine can compute `tenureWeightedStakeUsdc` per address by summing across that user's Active positions.

### 3.0 The 3-day cool-down

A withdrawal request transitions the position from `Active` to `Cooling` and freezes a `claimableAt = now + 3 days`. While in Cooling:
- The position contributes **zero** to the stake signal (`activePrincipal` and `tenureSeconds` return 0).
- The USDC remains in the vault. The user cannot rug it.
- The backend has a 3-day window to run fraud detection over burst deposits, suspicious counterparty patterns, and match-and-cancel correlation. If a flag fires, the backend can pause the user's score or surface a human review prompt.
- The user can `cancelWithdraw` to restore `Active`. Their `depositedAt` is preserved, so all accrued tenure carries forward. Honest users who change their mind lose nothing.

After 3 days the user calls `claim` and the principal is returned. The position becomes `Withdrawn`.

This is the platform's commitment device. A user cannot deposit, spike their reputation, take a deal, then withdraw the same day. They lose three days of stake signal during cool-down, and the backend sees the request before any funds move. The production contract runs the cool-down at 3 days to keep honest users mobile while still gating the rug-and-run attack.

### 3.1 Mainnet path: USYC integration

On Arc Testnet, `KarwanVault` simply holds USDC idle. The stake signal works regardless.

On mainnet, `KarwanVault.deposit` instead routes deposits into Hashnote's USYC via the standard mint/redeem interface. The vault holds USYC shares; on withdraw it redeems back to USDC. The yield accrues to the depositor (less a small platform spread that funds the treasury). The reputation signal is unchanged. The only difference is the deposit is also earning ~5% APY for the user.

This is the one paragraph in the README. The vault interface stays the same. On testnet, locked USDC sits idle. On mainnet, locked USDC earns. The reputation model doesn't notice.

### 3.2 Idle escrow takes the same path

The same wiring applies to **escrow** float. On testnet escrow funds sit idle in `KarwanEscrow`. On mainnet, the escrow holds USYC. Yield on the escrowed amount accrues over the deal window; on milestone release, the seller receives USDC (auto-redeemed) and the buyer's earned yield is credited back to them on settlement.

We do not implement that wiring this pass. The vault and reputation model arrive first; escrow USYC routing is a follow-up that reuses the same Hashnote interface.

### 3.3 What we ship today

- Solidity: `KarwanVault.sol` deployed to Arc Testnet. Flexible balance, 3-day cool-down on withdrawal, plain USDC holding.
- Backend: indexer that reads `Deposited`, `WithdrawalRequested`, `WithdrawalCancelled`, `Claimed`. Maintains per-address `tenureWeightedStakeUsdc` in the DB, feeds into reputation computation. Hooks the cool-down window into the fraud detection pipeline.
- Frontend: a "Stake to grow reputation" panel on `/profile` showing each open position with its tenure, current contribution to the score, and a "Request withdraw" button. After a request, the row shows the 3-day countdown and a "Cancel withdrawal" affordance.
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

A user whose spam score is non-zero sees a banner on `/profile` explaining which signal tripped and how to reduce it (cool off, diversify counterparties, complete the next match). The score self-heals as the 7-day window rolls forward. No permanent ban from a single bad week.

## 5. Decay

Reputation that isn't refreshed decays slowly:

```
decayMultiplier = exp(-daysSinceLastDeal / 180)
finalScore = floor(R(addr) × decayMultiplier)
```

A wallet inactive for 6 months sees its score halve. This prevents a once-strong account from coasting forever. The "completedDeals" and "totalStarted" counts themselves do not decay, only the displayed score does. A returning user re-earns trust by completing one or two deals.

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

The existing `KarwanReputation.sol` (`success / disputed / failed` counters) is now a **read-only legacy signal** that feeds `completedDeals` and `disputesLostRate`. We do not replace the contract. We read it as ground truth for on-chain history and add the new components in our DB.

Concretely:
- `completedDeals = chain.successCount`
- `disputesLost = chain.failedCount` (approximation; we tighten with our richer dispute outcomes table later)
- `totalStarted = deals_db.count_where(buyer = addr OR seller = addr)`
- `activeStakeUsdc = sum of vault locks indexed off `KarwanVault`
- `spam, cancelRate, counterAbandon, time` → backend tables

The composite score is computed server-side and published via `GET /api/reputation?address=0x…`. The on-chain contract stays the canonical source of completion outcomes.

## 8. Surface

- **ReputationBadge** keeps its current dot-and-number format, now sourced from the composite score.
- **/profile** gains a new band: **"Reputation"** showing the score, the tier, the four input terms broken out (activity, completion, stake, time), and the penalty bar if any.
- **Stake card** on `/profile`: deposit amount field, "Reputation lift +N" preview, and a list of open positions. Each position shows tenure, current contribution to the score, and a "Request withdraw" button that opens the 3-day cool-down with a countdown and a "Cancel withdrawal" affordance.
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

- Vouching / web-of-trust (high-rep users staking reputation on low-rep users they trust). A reasonable later addition.
- Sybil resistance via Worldcoin / passport. Tracked but not integrated.
- Cross-chain reputation portability. Arc-only this pass.
- Slashing locked stake on dispute loss. The vault is honest collateral, not a bond. We add slashing only if disputes become common enough to need it.

---

**One-paragraph framing for README / pitch:**
On Karwan, reputation is the platform's golden ticket. It is a composite score in [0, 1000] across five terms: activity, completion, stake, time, and a negative penalty term for spam, cancellations, abandoned negotiations, and lost disputes. Users grow reputation by completing deals and locking USDC in the KarwanVault, with no forced lock period and a 3-day cool-down on withdrawal. On Arc Testnet the vault holds plain USDC. On mainnet the same vault routes deposits through Hashnote USYC so the same stake also earns ~5% APY. The agent loop reads reputation directly. ELITE counterparties get first-look pricing, NEW counterparties get countered hard and routed to human review. Spam and griefing patterns are detected on rolling windows and shrink the score in days, not months. The score is a number you can grow, lose, and rebuild, which is the only way trust on a marketplace ever works.
