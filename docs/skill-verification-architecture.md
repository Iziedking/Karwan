# Skill verification architecture for Karwan

Internal design pass produced by the 5-stream fan-out workflow on 2026-06-05. Not for the repo. Captures the synthesis of how Karwan agents should verify SME skills beyond keyword matching, using social-of-record (GitHub, X, web search) per skill category, with anti-spoof, cost, cold-start, and privacy angles.

## TL;DR

Replace today's keyword-only `topicalMatchScore` with an evidence-blended score that multiplies coverage by a per-skill `EvidenceConfidence` factor (0.5-1.0) sourced from a static category registry. Sellers bind external identities (GitHub first, then X, Substack, Dribbble) via SIWE-signed gist proofs, never OAuth tokens — one primitive covers every platform. The buyer agent runs cheap free-tier checks on every bid, gates paid Circle services x402 calls behind tier + deal-value thresholds, and surfaces a verbatim evidence breakdown in MatchBanner so buyers see *why* a seller ranks where they do. EvidenceTier and ReputationTier remain parallel labels — neither collapses the other — and verification is opt-in, deal-scoped, and recoverable across wallet rotations.

## Design

### 1. The Evidence Registry

Static typed table at `backend/src/agents/evidence/registry.ts`. Keyed by canonical skill category (the same vocabulary `keywords.ts` already produces). Each entry declares platforms, signal fetchers, scoring rubrics, and cost classes.

Per evidence-sources research, the registry covers 10 categories. Shape:

```ts
type CategoryAdapter = {
  category: 'dev' | 'security' | 'writer' | 'designer' | 'content' |
            'marketer' | 'sales' | 'ops' | 'legal' | 'finance';
  sources: SourceSpec[];
};
type SourceSpec = {
  platform: string;
  costClass: 'free' | 'oauth' | 'x402-paid';
  fetcher: (handle: string) => Promise<RawSignals>;
  scorer: (signals: RawSignals, claimedSubSkill?: string) => number; // 0-100
  ttlDays: number;
};
```

Concrete first-wave entries (per evidence-sources, with rubric weights cited inline):

- **dev** → GitHub (free, 24h commits / 7d languages), npm/PyPI/crates.io (free, 7d), Etherscan-family (free, 7d). Smart-contract sub-category leans on Etherscan because the wallet is already wallet-bound by construction.
- **security** → GitHub (free) + Code4rena/Cantina/Sherlock leaderboards (free HTML) + Solodit (free HTML). Per evidence-sources: this is the strongest free corroboration of any non-dev category.
- **writer** → Substack RSS, Medium RSS, Hashnode GraphQL — all free. One LLM sample per source confirms sub-skill match, staying inside the $0.25/deal LLM budget.
- **content** → YouTube Data API (free, 10k units/day), Twitch Helix (free), Apple Podcasts iTunes Search (free). X is paid via Circle services as a corroboration-only layer.
- **designer** → Dribbble v2 (free public read), Figma Community (free), Behance (paid via Circle services — no API since 2019).
- **marketer / sales** → LinkedIn + X + personal domain, all paid via Circle services. Per cost research these are the only categories without a free baseline; gated behind tier + value thresholds.
- **ops** → Calendly + Read.cv (free), LinkedIn (paid fallback).
- **legal** → bar-association registry (paid), LinkedIn (paid), SSRN (paid). Gated at higher rep tier per evidence-sources implications.
- **finance** → CPA Verify + CFA Directory (free HTML, authoritative), LinkedIn (paid fallback).

**Scoring rule** (per evidence-sources recommendation): category score = `max(source_score)`, not sum or average. One strong proof is sufficient; weak proofs don't drag down strong ones.

Registry lives as code (not YAML) so the fetcher/scorer pair stays type-checked. A flat JSON sidecar at `data/skillRegistry.json` overrides per-source enable/disable flags without a deploy — consistent with the listings/briefs flat-file persistence pattern.

### 2. Connection flow (per platform)

Per gameability research: **no OAuth**. Single primitive `verifySignedHandle(platform, handle, address) → { ok, signedMessage, sigHash }` works uniformly across GitHub, X, Substack, Dribbble.

Step-by-step (GitHub example):

1. Seller hits `/settings/evidence` → "Connect GitHub".
2. Frontend asks the connected wallet to sign a SIWE-flavored payload: `karwan-verify:github:${handle}:${address}:${nonce}:${issuedAt}` with a 7-day acceptance window (per gameability research open question — nonce + expiry close the replay vector).
3. UI displays the signed message and instructs the seller to publish it as a public GitHub gist.
4. Seller pastes the gist URL back into Karwan. Backend fetches the gist via GitHub's public REST API (free, $0 cost), parses the payload, recovers the signing address with viem, compares to the connected wallet.
5. On match, backend writes `Verification { platform, handle, address, signedMessage, sigHash, verifiedAt, lastReverifiedAt }` to a `verifications` table with `(platform, handle) UNIQUE`.
6. A second `bindings` row links wallet → verification, with `boundSince` and `lockoutUntil = boundSince + 30d` per gameability research (closes the rep-pre-build attack: bind to A, build rep, resell to B as "verified, fresh rep").
7. Re-binding to a new wallet requires re-signing the gist from the new wallet. An on-chain `VerificationMoved(handle, from, to)` event fires; recent moves apply an `evidenceMultiplier` haircut (0.6 within 14d, 0.8 within 30d, 1.0 after).

**What the wallet signs**: the gist payload only. **What's stored**: the signed message, sig hash, the platform/handle/wallet tuple, and a salted hash of the handle for sybil detection (per privacy research — agent-only access, never surfaced to buyers).

For platforms without an open public read (Behance, LinkedIn, X), the gist proof is fetched via Circle services x402 search — the primitive is identical, only the fetch cost changes.

### 3. Per-bid query flow

When a bid lands on a brief, the buyer agent runs this sequence:

```
1. Cache check: evidence_cache[(walletAddress, categoryId)] within TTL?
   YES → use cached score, skip to step 6
   NO → continue

2. Determine deal tier (per cost research):
   < $50 USDC      → Tier 1: cached-only, skip fresh fetches
   $50 - $1000     → Tier 2: free sources + 1 x402 web search
   ≥ $1000         → Tier 3: full battery including paid sources

3. Free-source pass (always runs at Tier 2+):
   For each source in registry[category].sources where costClass='free':
     RawSignals = fetcher(handle)
     score = scorer(RawSignals, claimedSubSkill)
   categoryScore = max(scores)

4. Aggregate gate: if categoryScore is between 30 and 70 (ambiguous),
   AND (sellerTier < ESTABLISHED OR dealUsdc > accountThreshold),
   run paid Circle services search corroboration (Tier 2-3 only).

5. Corroboration multiplier (downside-only, per evidence-sources):
   Start at 1.0. Apply -0.3 if zero handle reuse across claimed platforms,
   -0.5 if conflicting identity flag found.
   Cannot lift the score, only drag.

6. Re-binding decay haircut: multiplier *= recentMoveFactor (0.6/0.8/1.0).

7. LLM step (last, smallest): if a written/content seller, sample
   one post per source for sub-skill match confirmation. ~3k input,
   ~300 output tokens via Gemini 2.5 Flash Lite — $0.00042/check.

8. Persist: evidence_cache[(wallet, category)] = {
     score, perSourceSignals, corroborationFactor, fetchedAt, TTL
   }
```

**Caching TTLs** (per cost research, source-specific, skewed long): GitHub commits 24h, GitHub repos/languages 7d, RSS lists 24h, X user lookup 30d, Dribbble/Figma 7d, web-search corroboration 14d, final blended LLM score 7d. Persisted in Postgres alongside deals — survives backend restarts, consistent with the storage-persistence doctrine.

**Where the LLM lives**: only steps 5 (judging conflict flags from raw search results) and 7 (sub-skill content sampling). The deterministic spine handles fetcher + scorer + cache + tier gate. This honors the agent-orchestration doctrine: deterministic for math, LLM for nuance.

### 4. Score blend

Current pipeline: `topicalMatchScore(brief, profile) → 0..100 → MATCH_BAND_SIZE=25 bands`.

New pipeline:

```
finalMatch = topicalMatchScore × evidenceConfidence × repFactor
```

Where:

- `topicalMatchScore` — unchanged, the primary discriminator (per match-ranking rule).
- `evidenceConfidence ∈ [0.5, 1.0]` — derived from the matched skill's `EvidenceLevel`:
  - UNVERIFIED → 0.5
  - SELF_ASSERTED → 0.65
  - SOCIAL_CORROBORATED → 0.85
  - PLATFORM_VERIFIED → 1.0
- `repFactor` — existing tier-based adjuster, untouched.

This honors three invariants: keyword fit stays load-bearing (a verified designer still doesn't win a Solidity brief), evidence is a multiplier never an additive override (per reputation v2 lesson against multiplicative-zeroing — clamped floor at 0.5 prevents an unverified ELITE from collapsing to zero), and the 0-100 + 25-band scale is preserved (a SELF_ASSERTED 90% match lands at 58 — still in the matched band, just trailing comparable verified candidates).

**Aggregation across multi-skill briefs**: per-category scores surface independently to the agent for the brief's matched category. Sidesteps the sum-vs-max question raised in evidence-sources open questions.

### 5. Privacy + opt-in posture

Per privacy research, three disclosure layers controlled per channel:

- **PUBLIC** — chip on profile reads `Verified Developer` only. No handle, no metric.
- **DEAL** — buyer inside an active deal envelope sees the snapshot ("142 Solidity commits / 12mo", "Code4rena top 200 all-time"). Still no handle. Reuses the session-gated deal-privacy plumbing.
- **HANDLE-REVEAL** — opt-in per deal, seller toggle, logged. Buyer sees `github.com/iziedking`.

**Storage minimization** (per gameability and privacy research):
- Store: `{ karwan_attestation_sig, claim_predicate_hash, issued_at, expires_at, revocation_uri, salted_handle_hash }`.
- Never store: profile snapshots, full repo lists, raw search results, follower lists. Snapshots are fetched fresh per buyer view (cached 7d) and discarded.

**Buyer filters** (per privacy research):
- SOFT filter "prefer verified" — weighted bonus only. Unverified sellers still rank.
- HARD filter "require verified" — excludes unverified sellers, but UI shows the buyer `N sellers excluded by your filter` and charges a small stake premium so it isn't free. Excluded sellers see a generic `this buyer requires additional verification`, never the buyer identity.

**Anon-seller case**: stake-as-insurance + reputation tier remain valid trust legs without verification. Per agent-risk-escalation principle, unverified ≠ auto-decline. Match score stays competitive when stake and rep compensate; the HARD filter is the only path that excludes them entirely, and it costs the buyer.

**GDPR posture**: 30-day erasure SLA on attestation revocation, breach scope limited to salted-handle-hash leak surface, retention windows by claim type (90d activity, 365d stable). Surfaced as a public verification policy page.

### 6. Cold-start + UX

Per cold-start research:

**Signup-time**: nothing. No evidence prompt. Keeps activation friction-free.

**First listing creation**: single coachmark on the new listing card via the existing `shared/guide/` system, honoring the one-tour-per-page convention:
> "Buyers verify your work before bidding. Connect GitHub in 60 seconds to rank higher."
One CTA, dismissible, persistent until satisfied.

**First incoming bid (seller-side)**: soft modal before counter:
> "This bid is being ranked SELF_ASSERTED. Connect one evidence source to unlock SOCIAL_CORROBORATED for this and future bids."
Skippable. The evidence cap stays visible on the bid card.

**First-bid-from-unverified (buyer-side)**: MatchBanner surfaces `UNVERIFIED EVIDENCE` chip. Approval modal pre-fills `reservationBps = 5000` (50%) anchored to first-milestone delivery. Soft cap of $200 on the first three deals (overridable with explicit click). The seller's price walk gets a conservative ceiling. None of this requires verification — it makes cold-start safe by default.

**Tier-up moment**: when seller crosses ESTABLISHED, surface "Lock in your tier" prompt to connect evidence. Tier-without-evidence is the weakest legitimate configuration and the right moment to nudge.

**Recovery path** (per cold-start research):
- Verification is wallet-rotation-portable. EvidenceRegistry keys on `sha256(provider:handle)`, not on wallet. New wallet re-runs the gist proof on the same external identity, inherits prior tenure (`Verified GitHub since 2026-04 (wallet B, prior wallet A)`).
- Verification-averse sellers get a paid human-review path: $5 USDC for one skill, $15 for full profile, via x402 from the seller's wallet. Reviewer signs an attestation, surfaces as PLATFORM_VERIFIED. Testnet reviewer is a single Karwan-controlled key; mainnet plan introduces staked third-party reviewers.

### 7. Cost model

Per cost research, at 100 sellers / 500 deals monthly:

| Layer | Per-occurrence | Monthly volume | Monthly cost |
|---|---|---|---|
| Registration verification (one-time/seller) | $0.13 | 100 sellers | $13 |
| GitHub commits refresh (free, shared GitHub App) | $0 | unlimited | $0 |
| RSS / Dribbble / Figma / Code4rena (free) | $0 | unlimited | $0 |
| X user lookup (cached 30d) | $0.10 | ~100/mo | $10 |
| Web search corroboration ($0.015 × 3 surviving bids × 500 deals) | $0.015 | ~1500/mo | $22.50 |
| LLM scoring (Gemini 2.5 Flash Lite) | $0.0042 | 500 deals | $2.10 |
| x402 facilitator (1000 free, then $0.001/tx) | $0.001 | ~500 paid tx | $0-$2 |
| **Total** | | | **~$50/mo** |

Worst case with broader X coverage: ~$100/mo. Headroom budget: $200/mo cap with admin meter alert at 80%.

**Who pays**:
- **Karwan absorbs** the cheap layer (free sources + cached X + LLM). ~$15/mo baseline.
- **Buyer pays** Deep Verify on borderline bids: $0.25 USDC via x402, refunded if the bid is accepted. Converts the most expensive path from platform cost to a product surface aligned with who-eats-the-loss.
- **Seller pays** the optional human-review path ($5-$15 USDC). Funded from existing wallet, gas-abstracted on Arc.
- **No seller registration fee.** Per v1 launch doctrine + agent-risk-escalation principle, friction at signup is the bigger risk than verification cost.

Per cost research recommendation: hardcode three tier breakpoints into the agent orchestrator and surface the tier on MatchBanner (`Verified Light` / `Verified Deep`). Turns cost discipline into a visible trust signal.

### 8. Anti-spoof recap

Per gameability research: defense is layered, not single-point. The gist-proof closes wallet↔handle (no shared message can claim a wallet the signer doesn't control). Per-platform signal modules (`backend/src/signals/<platform>.ts`) close fake-account creation with typed red flags — `FORKED_HEAVY`, `LOW_ENTROPY`, `BOUGHT_FOLLOWERS`, `RECENT_CREATION`, `PLAGIARISM_HIT`. Stake-as-insurance closes economic incentive: an attacker needs aged accounts ($500-$2k bundle per identity) plus real contribution density plus a stake that exceeds the spoof's upside. The 30-day rebinding lockout closes the "build-and-resell verified handle" attack. On-chain reputation on agent addresses closes the long tail.

**Residual attack**: a well-resourced sybil farm buying aged GitHub + aged X, signing real gists, burning small deals to grow rep. **Why tolerable**: by the time the sybil reaches STRONG, it has staked real USDC and shipped real deals — at which point any spoof attempt slashes the stake AND tanks on-chain reputation. The attacker has paid the cost of being a real seller. The economics never close cleanly; that's the design.

## Roadmap

**Wave 1 — Free-tier evidence spine (ships first, 2-3 weeks).** Build `backend/src/agents/evidence/registry.ts`, `backend/src/verification/verifySignedHandle.ts`, and signal modules for GitHub, Substack RSS, Medium RSS, Dribbble, Code4rena/Solodit HTML. Wire `evidenceMultiplier` into the buyer-agent ranker. Ship gist-binding UI at `/settings/evidence` for GitHub only. EvidenceTier chip on MatchBanner and ProfilePeekModal. First-listing coachmark via shared/guide. Postgres `verifications`, `bindings`, `evidence_cache`, `verification_moves` tables. *Unblocks*: 60% of categories (dev, security, writer, content) get evidence-blended ranking at zero per-deal cost. Per evidence-sources research recommendation to ship the four cheapest, highest-trust categories first.

**Wave 2 — Tier-gated paid corroboration + buyer-funded Deep Verify (1.5-2 weeks).** Add X, LinkedIn, web-search adapters via Circle services x402. Implement three-tier depth curve ($50 / $1000 breakpoints). Ship `Deep Verify` button on MatchBanner: $0.25 USDC buyer-initiated, refundable on bid acceptance. Daily re-verification cron alongside the existing yield cron (operator-funded, dedicated cron key). Admin verification-budget meter on `/admin/treasury`. SOFT and HARD buyer filters. *Unblocks*: marketer / sales / founder categories. SME buyers get verified-only briefs. Per cost research, monthly cost stays under $100 at projected volume.

**Wave 3 — Portable evidence + paid human review + GDPR posture (2-3 weeks).** EvidenceRegistry contract keyed on `sha256(provider:handle)` enabling wallet-rotation portability with single-active-binding. Paid human-review path ($5-$15 USDC). Decay state surfaced in MatchBanner ("verified GitHub 240d ago, account went dark 12d ago, weight 0.85 decaying"). Public verification policy page documenting 30-day erasure SLA, retention windows, breach-notification scope. Anti-spoof threat model in `docs/anti-spoof.md`. *Unblocks*: mainnet posture. SME enablement at scale. Cross-account tenure inheritance after wallet loss.

## Decisions the user needs to make

1. **Sub-skill routing: LLM-extracted or seller-declared?** *Option A*: LLM extractor auto-routes "solidity" → smart-contract sub-category checks (zero friction, less honest about which claims trigger which checks). *Option B*: seller explicitly picks categories during activation (more friction, fully transparent about what's being verified). **Recommended: A.** Karwan's existing keyword extraction is already deterministic enough, and the cold-start research argues against signup-time friction.

2. **Single shared GitHub App vs per-seller OAuth?** *Option A*: single Karwan-owned GitHub App (free at 5k req/hr, 10x projected scale, but single point of revocation failure and ToS uncertainty for displaying derived metrics to third parties). *Option B*: per-seller OAuth (adds onboarding friction, defensible posture, isolated revocation). **Recommended: A with a ToS check.** Per cost research recommendation. Pre-confirm with GitHub support before commit; fall back to B if blocked.

3. **Default-on or opt-in evidence for new sellers?** *Option A*: default-on, NEW sellers without evidence get scored at the floor (stronger anti-gaming, raises onboarding cliff). *Option B*: opt-in, no evidence ≠ penalty until first listing nudge (lower friction, matches cold-start doctrine). **Recommended: B.** Per agent-risk-escalation principle and v1 launch doctrine. Nudge at first listing, not signup.

4. **Tier 3 deep verification: require human gate too?** *Option A*: deals $1000+ trigger BOTH buyer-funded Deep Verify AND mandatory human review gate (double-tax, highest safety). *Option B*: Deep Verify alone is sufficient up to a higher threshold ($5000+), human gate stacks above that. **Recommended: B.** The two-human-gate pattern is the existing safety net; stacking a $0.25 micropayment on top feels like friction theater under $5k. Revisit when real $1k+ deals land on testnet.

5. **Slashed stake on spoof: burn or compensate the defrauded buyer?** *Option A*: burn (simpler, matches existing slashing posture, no insurance pool to manage). *Option B*: compensate the buyer directly (better expected-value for buyers engaging NEW sellers, requires insurance pool accounting). **Recommended: B for v2.** Slashed-stake-as-compensation is the cleanest way to make the verification + stake combo decisive in buyer-side risk math. The staking-as-insurance memory direction already supports this.

6. **Sybil deduplication via salted handle hash: agent-only or buyer-queryable?** *Option A*: agent-only, dedupe acts as a silent ranking penalty (anon sellers keep plausible deniability across pseudonyms). *Option B*: buyer-queryable, surfaced as `this seller is also user X` (stronger anti-collusion, kills anon-with-multiple-personas use case). **Recommended: A.** Per privacy research. Karwan's anon-first stance and the agent-risk-escalation principle both point to silent ranking, not public exposure.

## Files we'll need to touch

- `backend/src/llm/keywords.ts` — wrap `topicalMatchScore` callers with `evidenceMultiplier` blend; keep the pure function intact.
- `backend/src/agents/evidence/registry.ts` — NEW. The category-to-source-to-rubric registry.
- `backend/src/agents/evidence/score.ts` — NEW. `categoryScore = max(sources)`, corroboration multiplier, decay haircut.
- `backend/src/verification/verifySignedHandle.ts` — NEW. The one primitive for gist-based binding.
- `backend/src/signals/github.ts`, `x.ts`, `substack.ts`, `medium.ts`, `dribbble.ts`, `figma.ts`, `code4rena.ts`, `solodit.ts` — NEW. Per-platform fetcher + scorer modules.
- `backend/src/routes/profile.ts` — extend with `/profile/evidence/connect` + `/profile/evidence/verify-gist` endpoints; enforce `(platform, handle) UNIQUE`.
- `backend/src/reputation/config.ts` — add `REP_W_EVIDENCE` and evidence-level confidence factors, env-driven.
- `backend/src/config.ts` — verification policy thresholds: tier breakpoints, paid-signal account budget, web-search cache TTLs.
- `backend/src/db/` — NEW tables `verifications`, `bindings`, `evidence_cache`, `verification_moves`.
- `backend/src/cron/reverify.ts` — NEW. Daily cron alongside yield cron, operator-funded, dedicated key.
- `contracts/src/EvidenceRegistry.sol` — NEW (Wave 3). `sha256(provider:handle) → { wallet, verifiedAt, level }` with single-active-binding.
- `frontend/app/settings/evidence/page.tsx` — NEW. Per-platform connect surfaces with gist instructions.
- `frontend/shared/MatchBanner/` — render EvidenceTier chip, surface per-source breakdown, expose `Deep Verify` button (Wave 2).
- `frontend/shared/ProfilePeekModal/` — render PUBLIC disclosure layer (chip + count, no handle).
- `frontend/shared/guide/` — first-listing coachmark + cold-seller approval modal pre-fill.
- `data/skillRegistry.json` — NEW. Per-deploy flat-file override for source enable/disable.
- `frontend/app/admin/treasury/page.tsx` — add verification-budget meter (Wave 2).
- `docs/anti-spoof.md` — NEW (Wave 3). Threat model + layered defense documentation.
