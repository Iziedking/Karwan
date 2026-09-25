# Reputation model

Reviewed against the implementation on 25 September 2026. Model version: 2.

Karwan reputation summarizes trade history, stake, activity and negative outcomes. It is not proof of identity, a safety guarantee or a financing approval. Trading and staking remain testnet features; a deployed mainnet reputation registry does not make the full trading service available on mainnet.

## Score and tiers

The backend computes a score from 0 to 1,000. Personal and business workspaces share the customer identity; adding a workspace does not create a separate reputation history.

| Tier | Score range | Minimum settled deals, default |
| --- | --- | --- |
| NEW | 0–199 | 0 |
| COLD | 200–399 | 1 |
| ESTABLISHED | 400–599 | 3 |
| STRONG | 600–799 | 8 |
| ELITE | 800–1,000 | 15 |

The held tier is the lowest of the score tier, the settled-deal ceiling and the counterparty-concentration ceiling. Concentration of at least 60% with one counterparty caps the tier at ESTABLISHED; at least 80% caps it at COLD. A high score alone cannot bypass these ceilings.

The response includes `scoreTier`, `tierCappedBy` and `dealsToNextTier` to explain the result. Tier thresholds are fixed; minimum deal counts are configurable.

## Calculation

Implementation: [engine.ts](../backend/src/reputation/engine.ts). Defaults: [config.ts](../backend/src/reputation/config.ts).

```text
base = clamp01(sum(weight × factor))
score = clamp(0, 1000, round(1000 × base × (1 − penalty) × decay))
```

Each factor is clamped to the range 0–1. Defaults are designed for testnet validation and are not a promise of production settings.

| Factor | Default weight | Calculation |
| --- | --- | --- |
| Stake | 0.30 | Square-root amount score, multiplied by a duration factor |
| Completion | 0.25 | Logarithmic completed-deal count, adjusted by smoothed success rate |
| Volume | 0.13 | Square-root settled-volume score |
| Tenure | 0.12 | Days since registration, capped at the configured duration |
| Activity | 0.12 | Logarithmic count of distinct active days |
| Referral | 0.08 | Logarithmic referral count supplied by the signal layer |

The logarithmic factor is `log10(1 + count) / log10(1 + cap)`. The square-root factor is `sqrt(amount / cap)`, clamped to 0–1. Stake duration starts at 40% credit by default and reaches full credit after 14 days. Completion uses `(completedDeals + 1) / (totalStarted + 2)` as its smoothed success rate.

Default saturation values are 10 completed deals, 100 USDC staked, 500 USDC settled, 14 days for stake duration and tenure, 14 active days and 5 referrals. An available formula does not establish that every input has a live attribution source. See [signals.ts](../backend/src/reputation/signals.ts) for how each input is collected.

## Penalties and inactivity

The penalty combines dispute losses, cancellations, spam, abandoned counters and flagged-link offenses. Default weights are 0.50, 0.12, 0.20, 0.08 and 0.50 respectively; the combined penalty is capped at 0.60. These signals can be incomplete and do not establish that an account is safe or fraudulent.

Inactivity reduces the displayed score using a half-life:

```text
decay = exp(−ln(2) × idleDays / configuredHalfLifeDays)
```

The default half-life is 180 days. Missing or future last-action timestamps do not apply a decay penalty. Historical completion counts themselves do not decay.

## Staking and withdrawals

The testnet staking flow uses `KarwanVault`. Active positions contribute to the stake signal. A withdrawal request starts the contract's cooldown; a cooling position no longer contributes active stake. The interface must show the applicable claim time and transaction status.

Staking is not currently a mainnet yield product. This model does not promise a fixed return, automatic USYC conversion, or yield on escrow funds. Any future treasury or yield integration requires separate eligibility, contract, liquidity and release checks. See [Circle integration](./circle-integration.md).

## Data and product boundaries

The backend combines chain outcomes with application records and exposes the computed result through `/api/reputation`. Contract history and the composite score are different records: the score includes off-chain inputs and can change as those inputs or the evaluation time change.

Reputation can inform matching, but it does not authorize a payment or replace approval of deal terms. Financing, referrals, cross-chain portability and future staking designs must be assessed against their own release status, not inferred from a reputation tier.

For changes to scoring, compare the implementation and its tests before publishing examples. A deployment's configured values, chain and contract version take precedence over the defaults in this document.
