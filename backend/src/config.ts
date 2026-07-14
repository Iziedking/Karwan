import 'dotenv/config';
import { z } from 'zod';

const blankToUndefined = (v: unknown) => (v === '' ? undefined : v);
const optionalAddr = z.preprocess(blankToUndefined, z.string().startsWith('0x').optional());
const optionalString = z.preprocess(blankToUndefined, z.string().optional());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(8787),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),

  ARC_TESTNET_RPC_URL: z.string().url().default('https://rpc.testnet.arc.network'),
  /// Optional comma-separated list of fallback RPC URLs. viem's fallback
  /// transport rotates to the next URL when one returns an error (e.g.
  /// daily quota exhausted on the primary). Leave unset to use only the
  /// primary URL above. Example:
  ///   ARC_TESTNET_RPC_URLS=https://primary.example,https://backup.example
  ARC_TESTNET_RPC_URLS: z.string().optional(),
  ARC_TESTNET_WSS_URL: z.string().default('wss://rpc.testnet.arc.network'),
  ARC_TESTNET_EXPLORER_URL: z.string().url().default('https://testnet.arcscan.app'),

  IDENTITY_REGISTRY_ADDR: z
    .string()
    .startsWith('0x')
    .default('0x8004A818BFB912233c491871b3d84c89A494BD9e'),
  REPUTATION_REGISTRY_ADDR: z
    .string()
    .startsWith('0x')
    .default('0x8004B663056A597Dffe9eCcC1965A193B7388713'),
  VALIDATION_REGISTRY_ADDR: z
    .string()
    .startsWith('0x')
    .default('0x8004Cb1BF31DAf7788923b405b754f57acEB4272'),
  ERC8183_REF_ADDR: z
    .string()
    .startsWith('0x')
    .default('0x0747EEf0706327138c69792bF28Cd525089e4583'),
  USDC_ADDR: z
    .string()
    .startsWith('0x')
    .default('0x3600000000000000000000000000000000000000'),

  KARWAN_JOBBOARD_ADDR: optionalAddr,
  KARWAN_ESCROW_ADDR: optionalAddr,
  /// SME trade-finance bundle (deployed 2026-06-09). Document anchors +
  /// factoring payee redirect + PoD acceptance live in the registry;
  /// single-funder PO financing custody lives in the PO contract. Both
  /// optional so the backend boots without them set; SME routes return
  /// 503 with a clear message when unset.
  KARWAN_INVOICE_REGISTRY_ADDR: optionalAddr,
  KARWAN_PO_FINANCING_ADDR: optionalAddr,
  /// KarwanBusinessRegistry: verified-business account gate. Applicants
  /// anchor a registration/tax-doc hash via submitRegistration; the reviewer
  /// signer approves or rejects. Optional so the backend boots without it;
  /// business routes return 503 when unset. Deploy lands in the final bundle.
  KARWAN_BUSINESS_REGISTRY_ADDR: optionalAddr,
  /// Circle DCW that signs registry.approve / registry.reject. A dedicated
  /// Karwan reviewer wallet, never the deployer. Unset = admin review can't
  /// reach chain (the route returns 503).
  BUSINESS_REVIEWER_WALLET_ID: optionalString,
  /// USYC yield cron: the operator EOA private key that signs vault
  /// withdrawForYield + Teller subscribe (the vault is NotPermissioned, only
  /// this entitled EOA can subscribe) and the treasury keeper sweep. Same raw-
  /// key pattern as X402_BASE_PRIVATE_KEY. Testnet only; unset = cron is a
  /// no-op. On mainnet, move to a dedicated entitled+operator wallet.
  USYC_OPERATOR_PRIVATE_KEY: z.preprocess(
    blankToUndefined,
    z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
  ),
  /// Agent seed: a dedicated operator EOA private key that funds newly-activated
  /// buyer + seller agents with a small USDC float (native Arc gas asset) so a
  /// user lands ready to trade without the public faucet (rate-limited on
  /// testnet, absent on mainnet). Same raw-key shape as USYC_OPERATOR_PRIVATE_KEY.
  /// Unset = seeding is a no-op (agents activate empty). Fund this EOA with USDC
  /// on Arc.
  AGENT_SEED_PRIVATE_KEY: z.preprocess(
    blankToUndefined,
    z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
  ),
  /// USDC seeded to EACH agent on activation (native Arc units). 0.5 covers gas
  /// plus a first deal's working float.
  AGENT_SEED_USDC: z.coerce.number().nonnegative().default(0.5),
  /// Liquid USDC (6dp units, e.g. 100) the vault keeps unwrapped to cover
  /// slashable reservations + soon-to-claim cooling positions. The cron wraps
  /// everything above this; tune it down to minimise yield drag.
  USYC_VAULT_BUFFER_USDC: z.coerce.number().nonnegative().default(0),
  /// Minimum fee-EOA USDC balance before the treasury sweep cron bothers.
  USYC_TREASURY_SWEEP_MIN_USDC: z.coerce.number().nonnegative().default(1),
  /// Don't churn the vault for deltas smaller than this (USDC).
  USYC_REBALANCE_MARGIN_USDC: z.coerce.number().nonnegative().default(5),
  /// Buyer agents pay Karwan's own x402 credit-passport endpoint during bid
  /// scoring (real USDC, agent Gateway deposit -> platform treasury). On by
  /// default; set to 'false' to skip the paid pull entirely. Failures never
  /// block a bid either way.
  X402_PAID_SIGNALS_ENABLED: z.preprocess(
    (v) => v !== 'false' && v !== '0',
    z.boolean(),
  ),
  /// USDC amount the buyer agent SCA moves into the x402 EOA's Gateway
  /// deposit when the available balance can't cover the next paid call.
  /// 0.50 covers 50 credit-passport pulls at $0.01.
  X402_GATEWAY_DEPOSIT_USD: z.coerce.number().positive().default(0.5),
  /// Private key of the Base MAINNET payer EOA for external x402 calls
  /// (counterparty sanctions screening via GlobalAPI, $0.01/check). The
  /// key only signs EIP-3009 authorizations; the seller's facilitator
  /// submits on chain and pays gas, so the wallet holds USDC and zero
  /// ETH. Unset = external paid signals are skipped.
  X402_BASE_PRIVATE_KEY: z.preprocess(
    blankToUndefined,
    z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
  ),
  /// Base mainnet RPC, used ONLY to read the x402 external payer's USDC balance
  /// for the admin health probe (x402PayerHealth). Settlement never touches this
  /// — the facilitator submits on chain — so a public endpoint is fine. Defaults
  /// to Base's public RPC when unset.
  BASE_RPC_URL: z.preprocess(blankToUndefined, z.string().url().default('https://mainnet.base.org')),
  /// Bypass the 24h per-address cache on external screens / market lookups.
  /// Off by default (caching avoids re-spending on a counterparty whose
  /// sanctions status doesn't move bid to bid). Set 'true' for a live demo so
  /// every match visibly re-pays on chain and the payer wallet's BaseScan
  /// activity proves the spend instead of a stale cached verdict.
  X402_SCREEN_CACHE_DISABLED: z.preprocess(
    (v) => v === 'true' || v === '1',
    z.boolean(),
  ),
  /// Pre-v2.D KarwanEscrow. Read-only during the 30-day recovery window so
  /// users with funds still locked on the legacy contract (Funded or
  /// pre-v2.D "accepted" but never delivered) can refund / cancel from
  /// the dedicated /legacy page. Unset = recovery surface disabled.
  KARWAN_ESCROW_LEGACY_ADDR: optionalAddr,
  /// Second-generation legacy escrow. Set during a redeploy that promotes the
  /// previous production escrow into a legacy slot. Each generation runs its
  /// own 30-day recovery window via LEGACY_WINDOW_CLOSES_AT_2.
  KARWAN_ESCROW_LEGACY_ADDR_2: optionalAddr,
  /// Third-generation legacy escrow. The v2.D escrow that v2.E displaces.
  /// Same recovery semantics; window cuts off via LEGACY_WINDOW_CLOSES_AT_3.
  KARWAN_ESCROW_LEGACY_ADDR_3: optionalAddr,
  /// Hard cutoff for the legacy recovery surface. Any time after this
  /// instant: home banner hides, /legacy returns 410, /api/legacy/* routes
  /// return 410. Reads still answer for transparency but writes refuse.
  /// ISO 8601 UTC timestamp. Unset = legacy surface disabled entirely
  /// (post-window state).
  LEGACY_WINDOW_CLOSES_AT: z.preprocess(
    blankToUndefined,
    z.string().datetime({ offset: true }).optional(),
  ),
  /// Hard cutoff for the second-generation legacy recovery (Gen 2). Independent
  /// from the Gen 1 cutoff so each retired contract gets a fresh 30-day claim
  /// window from the day it was retired. Unset = Gen 2 surface disabled.
  LEGACY_WINDOW_CLOSES_AT_2: z.preprocess(
    blankToUndefined,
    z.string().datetime({ offset: true }).optional(),
  ),
  /// Hard cutoff for the v2.D legacy recovery (Gen 3). Set this to today+30d
  /// when v2.E goes live so v2.D holders get a clean unwind window.
  LEGACY_WINDOW_CLOSES_AT_3: z.preprocess(
    blankToUndefined,
    z.string().datetime({ offset: true }).optional(),
  ),
  KARWAN_REPUTATION_ADDR: optionalAddr,
  // KarwanVault. Optional because pre-deploy the reputation engine cleanly
  // degrades stakeTerm to its base value (1.0). Once set, stake.ts indexes
  // Deposited events for the address to compute tenure-weighted active stake.
  KARWAN_VAULT_ADDR: optionalAddr,
  /// Legacy KarwanVault from the pre-v2.D deployment. Read-only during the
  /// migration window so existing stakers keep their tenure on positions
  /// staked before the redeploy. Optional, leave blank in fresh
  /// environments or after the legacy vault drains.
  KARWAN_VAULT_LEGACY_ADDR: optionalAddr,
  /// Second-generation legacy vault. Holds stake from the previous production
  /// vault that just got retired. Read in addition to (not instead of) the
  /// original legacy slot so users with positions on either contract can claim.
  KARWAN_VAULT_LEGACY_ADDR_2: optionalAddr,
  /// Third-generation legacy vault. The v2.D vault that v2.E displaces.
  KARWAN_VAULT_LEGACY_ADDR_3: optionalAddr,
  /// Deploy block for the legacy vault. Only consulted when reading from
  /// the legacy vault; otherwise ignored. Same shape as the active
  /// KARWAN_VAULT_DEPLOY_BLOCK.
  KARWAN_VAULT_LEGACY_DEPLOY_BLOCK: z.preprocess(
    blankToUndefined,
    z.string().regex(/^\d+$/).transform(BigInt).optional(),
  ),
  KARWAN_VAULT_LEGACY_DEPLOY_BLOCK_2: z.preprocess(
    blankToUndefined,
    z.string().regex(/^\d+$/).transform(BigInt).optional(),
  ),
  KARWAN_VAULT_LEGACY_DEPLOY_BLOCK_3: z.preprocess(
    blankToUndefined,
    z.string().regex(/^\d+$/).transform(BigInt).optional(),
  ),
  /// Third-generation legacy reputation contract (the v2.D reputation that
  /// v2.E displaces). The off-chain composite reads all generations so a
  /// seller's tier doesn't appear to reset when v2.E launches.
  KARWAN_REPUTATION_LEGACY_ADDR_3: optionalAddr,
  // Block at which KarwanVault was deployed. When set, the paginated event
  // reader starts here instead of `latest - 9500` (which only covered ~5h of
  // Arc testnet history at 2s blocks and made older positions disappear).
  // Unset is acceptable for fresh testnet sessions; the reader walks back a
  // larger default window in that case.
  KARWAN_VAULT_DEPLOY_BLOCK: z.preprocess(
    blankToUndefined,
    z.string().regex(/^\d+$/).transform(BigInt).optional(),
  ),
  // Treasury that collects the platform fee. Must match the address the escrow
  // was deployed with; surfaced here for display and reconciliation.
  KARWAN_TREASURY_ADDR: optionalAddr,
  // KarwanTreasury CONTRACT (distinct from KARWAN_TREASURY_ADDR, the EOA that
  // collects the escrow fee). Parks idle USDC reserves in USYC for yield.
  // Optional: when unset, GET /api/admin/treasury reports not-configured.
  // Populated after `forge script DeployTreasury`.
  KARWAN_TREASURY_CONTRACT_ADDR: optionalAddr,
  // KarwanTreasury wired to real Hashnote USYC on Arc Testnet. The legacy
  // KARWAN_TREASURY_CONTRACT_ADDR stays as the live fee sink until escrow is
  // repointed; this contract is what the admin console drains INTO and what
  // holds USYC after Circle whitelisting landed 2026-06-06.
  // Renamed 2026-06-06 from KARWAN_TREASURY_V3_ADDR. The old name is still
  // accepted as a fallback in the routes that consume this value, so a
  // VPS still on the old key keeps working until the env swap.
  KARWAN_TREASURY_USYC_ADDR: optionalAddr,
  // Deprecated alias. Kept temporarily so the existing VPS .env keeps
  // resolving while you swap the key name. Remove after the rename ships
  // to production env files.
  KARWAN_TREASURY_V3_ADDR: optionalAddr,
  // KarwanYieldDistributor, per-address USDC claim contract that the daily
  // yield-distribute cron credits via bulkCredit. Stakers pull from here via
  // claim(). Read-only here; the cron operator key is set on the contract via
  // setOperator, NOT loaded into the backend.
  KARWAN_YIELD_DISTRIBUTOR_ADDR: optionalAddr,
  // Block the YieldDistributor was deployed at. Bounds the YieldCredited /
  // YieldClaimed event scans in routes/yield.ts. When unset the route falls back
  // to a sliding 14-day window, which truncates older credits/claims and makes
  // the per-staker lifetime totals drift between reads. Set it (gen-4 deploy:
  // 45476130) so the scans cover full history deterministically. Kept as a
  // string because the route parses it itself.
  KARWAN_YIELD_DISTRIBUTOR_DEPLOY_BLOCK: z.preprocess(
    blankToUndefined,
    z.string().regex(/^\d+$/).optional(),
  ),
  // Direct-deal review window in milliseconds. Used for two timers: the buyer
  // has this long to release the first milestone after the seller delivers, and
  // again to release the final milestone. When it expires the agent
  // auto-releases. Default 5 min for demos; raise to hours for mainnet.
  DEAL_REVIEW_WINDOW_MS: z.coerce.number().int().positive().default(300_000),
  // Each "still reviewing" tip adds this much time to the final-release window.
  // Default 10 min for demos.
  DEAL_REVIEW_EXTENSION_MS: z.coerce.number().int().positive().default(600_000),
  // Most times the buyer can extend the final-release window.
  DEAL_MAX_REVIEW_EXTENSIONS: z.coerce.number().int().positive().default(3),
  // Shareable invite-link TTL. The recipient has this long to claim the link
  // before it expires. 7 days default matches a normal "I'll get to it" cadence.
  DEAL_INVITE_TTL_MS: z.coerce.number().int().positive().default(7 * 86_400_000),
  // Current Terms and Conditions version. Bumping this re-prompts every user
  // on next protected action; their previous acceptance row stays for audit.
  // Bump the integer when docs/terms-and-conditions.md changes materially.
  TERMS_CURRENT_VERSION: z.coerce.number().int().positive().default(1),
  // Delay-appeal grace: how long after the first milestone is released before
  // the seller can raise a delay appeal. Gives the buyer a normal review
  // window before any pressure. 1 hour default; longer on mainnet.
  DEAL_DELAY_APPEAL_GRACE_MS: z.coerce.number().int().positive().default(3_600_000),
  // Delay-appeal response window: once the seller raises a delay appeal, the
  // buyer has this long to respond with a reason. Silence triggers final
  // auto-release. 5 min demo default.
  DEAL_DELAY_APPEAL_RESPONSE_MS: z.coerce.number().int().positive().default(300_000),
  // After a delivery deadline passes with no delivery, the buyer is alerted at
  // once that they can reclaim. If they take no action AND the seller still has
  // not delivered after this grace window, the watcher auto-reclaims the escrow
  // to the buyer (refund + seller reputation hit). The grace protects a seller
  // who delivers slightly late and gives the buyer room to grant an extension.
  // 24h default; lower it for demos via env.
  DEAL_DEADLINE_RECLAIM_GRACE_MS: z.coerce.number().int().positive().default(86_400_000),

  // Financier application eligibility. Anyone can apply to fund factoring / PO
  // lines in the SME rail, but must meet a real bar: minimum account tenure on
  // Karwan, a non-zero stake, and reputation at least COLD. AUTO_APPROVE grants
  // the desk immediately on an eligible apply (the admin review route is the
  // hook for tightening this later).
  FINANCIER_MIN_TENURE_DAYS: z.coerce.number().int().nonnegative().default(7),
  FINANCIER_AUTO_APPROVE: z.preprocess((v) => v !== 'false' && v !== '0', z.boolean()),

  // Verify a business the moment it submits, skipping the manual admin review.
  // OFF by default (verification is sensitive). Turn on for pilots and internal
  // testing so a registration reaches 'verified' without the on-chain reviewer
  // wallet being wired. Mirrors FINANCIER_AUTO_APPROVE.
  BUSINESS_AUTO_APPROVE: z.preprocess((v) => v === 'true' || v === '1', z.boolean()),

  CIRCLE_API_KEY: optionalString,
  CIRCLE_ENTITY_SECRET: optionalString,
  CIRCLE_WALLET_SET_ID: optionalString,
  // Set true once a Circle Gas Station policy is configured in the console for
  // the wallet set, so DCW transactions (bridge approve / burn / mint) are
  // sponsored and bridge wallets no longer need native gas. When true the bridge
  // skips its out-of-gas precheck. The sponsorship is the console policy; this
  // flag just tells the code to trust it. See todo #181.
  CIRCLE_GAS_STATION_ENABLED: z.preprocess((v) => v === 'true' || v === '1', z.boolean()),
  // Comma-separated CCTP source-chain keys that the Gas Station policy actually
  // sponsors. The Console policy is per-chain (task #181 sponsored baseSepolia
  // + sepolia only), but the ENABLED flag above is a single bool. Without this
  // whitelist, ENABLED=true skipped the gas precheck for all 5 chains and
  // bridges from arbitrumSepolia / optimismSepolia / polygonAmoy hung forever
  // in "APPROVING USDC" because the SCA had no native gas and no Console
  // sponsorship to cover the userOp.
  //
  // Empty (default) = back-compat: ENABLED=true sponsors every chain (the old
  // behavior). Operators should set this to match the Console policy
  // explicitly, e.g. CIRCLE_GAS_STATION_SPONSORED_CHAINS=baseSepolia,sepolia.
  CIRCLE_GAS_STATION_SPONSORED_CHAINS: z.preprocess(
    (v) => {
      if (typeof v !== 'string' || !v.trim()) return [];
      return v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    },
    z.array(z.string()),
  ),
  // Circle webhook subscription ID for the dev-controlled-wallets event stream.
  // Created in the Circle Developer Console (Webhooks tab) once per environment.
  // When unset, POST /api/circle/webhook returns 503 "not configured" and the
  // polling path in chain/txs.ts is the only completion signal. When set, the
  // backend additionally receives signed event push notifications for faster
  // terminal-state propagation (the polling stays as fallback).
  CIRCLE_WEBHOOK_SUBSCRIPTION_ID: optionalString,
  // Feature flag for the App Kit migration. When false, IN-direction Circle
  // bridges run through the hand-rolled startSourcePipeline (the proven path
  // with the resumable approve/burn state machine). When true, they run
  // through `kit.bridge()` with the Forwarding Service handling attestation +
  // destination mint. The two paths coexist behind this flag so the App Kit
  // path can be exercised in isolation and rolled back to the hand-rolled
  // pipeline at any time. Default: false (no behavior change until opt-in).
  BRIDGE_USE_APP_KIT: z.preprocess((v) => v === 'true' || v === '1', z.boolean()),

  /// CCTP relay wallet. The backend signs `receiveMessage(message, attestation)`
  /// on Arc with this Circle DCW to land the mint step of every cross-chain
  /// bridge. Needs Arc USDC for gas (Arc uses USDC as native gas, ~0.005 USDC
  /// per mint). Unset = bridge mints fail; set the matching ADDRESS too.
  CCTP_RELAY_WALLET_ID: optionalString,
  CCTP_RELAY_ADDRESS: optionalAddr,

  /// DEPRECATED aliases for the CCTP relay wallet. Pre-v2.D Karwan ran a
  /// single buyer agent that doubled as the CCTP relay, so the env keys were
  /// named after that role. Per-user buyer agents now live in the DB; the
  /// only remaining job for these vars is the CCTP relay. New deploys should
  /// use CCTP_RELAY_WALLET_ID / CCTP_RELAY_ADDRESS instead. Kept for one
  /// release window so existing production deploys don't break mid-flight.
  BUYER_AGENT_WALLET_ID: optionalString,
  // Circle wallet id for the security guardian (the escrow/vault/treasury/PO
  // Guardable `guardian`). Signs on-chain hold / releaseHold / attestDelivery
  // when the delivery scanner flags a proof. Optional: when unset (or the v2
  // escrow isn't live), the security agent stays off-chain-only.
  GUARDIAN_WALLET_ID: optionalString,
  // Circle wallet id for the escrow arbiter (the security council). Signs the
  // on-chain resolve() that splits a post-accept dispute between the parties.
  // Must match the address set via escrow.setArbiter. Optional until v2 live.
  SECURITY_COUNCIL_WALLET_ID: optionalString,
  BUYER_AGENT_ADDRESS: optionalAddr,
  /// Genuinely legacy. Nothing in production code reads these. Safe to drop.
  SELLER_AGENT_WALLET_ID: optionalString,
  SELLER_AGENT_ADDRESS: optionalAddr,

  OPENROUTER_API_KEY: optionalString,
  LLM_MODEL: z.string().default('google/gemini-2.5-flash-lite'),
  // Model for release-gating checks where structured-output reliability matters
  // more than cost (the deliverable-meets-requirement verdict). Native Anthropic
  // id (not the OpenRouter `anthropic/...` form) since it runs through the
  // Anthropic provider on ANTHROPIC_API_KEY. Haiku follows the JSON schema far
  // more reliably than Flash Lite, at a tiny per-call cost (one check per
  // delivery). Falls back to the OpenRouter model when no Anthropic key is set.
  VERIFIER_LLM_MODEL: z.string().default('claude-haiku-4-5'),
  // Model for the agent-to-agent negotiation loop (bid scoring + counter
  // suggestion, accept/decline/counter evaluation, near-miss reasoning) on both
  // the buyer and seller sides. The whole automation premise rests on these
  // structured calls returning valid objects; Flash Lite via OpenRouter drops
  // them often enough ("No object generated") to derail a negotiation, so this
  // runs natively on Haiku for reliable JSON. Falls back to the OpenRouter model
  // when no Anthropic key is set. Market research stays on the cheaper model.
  NEGOTIATION_LLM_MODEL: z.string().default('claude-haiku-4-5'),
  // Model for paid market research synthesis (per-deal market read + demand
  // score). Native Anthropic Haiku for a sharper read that feeds negotiation.
  // Falls back to the OpenRouter model when no Anthropic key is set.
  RESEARCH_LLM_MODEL: z.string().default('claude-haiku-4-5'),

  // In-app support assistant. Uses Anthropic directly (not OpenRouter) on a
  // low-cost model. Assistant is disabled gracefully if the key is absent.
  ANTHROPIC_API_KEY: optionalString,
  ASSISTANT_MODEL: z.string().default('claude-haiku-4-5-20251001'),
  // Conduit LLM gateway, Anthropic-compatible at its root. When set, the
  // assistant prefers it (Claude Sonnet) and falls back to the direct
  // ANTHROPIC_API_KEY. Auth is a Bearer token (sk-cdt-...). Same /v1/messages
  // request + response shape as Anthropic, so one code path serves both.
  // Up to three Conduit keys (free-tier accounts) are tried in order before
  // Anthropic, so a rate limit on one rolls to the next. Any of these may also
  // be a comma-separated list of keys. See conduitApiKeys() below.
  CONDUIT_API_KEY: optionalString,
  CONDUIT_API_KEY_2: optionalString,
  CONDUIT_API_KEY_3: optionalString,
  CONDUIT_BASE_URL: z.string().default('https://conduit.ozdoev.net'),
  CONDUIT_MODEL: z.string().default('claude-sonnet-4-6'),

  // CCTP V2: Arc's MessageTransmitterV2 (where receiveMessage is called to mint).
  CCTP_MESSAGE_TRANSMITTER_ADDR: z
    .string()
    .startsWith('0x')
    .default('0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275'),
  // Circle's CCTP V2 attestation API. Sandbox covers all V2 testnets.
  IRIS_API_BASE: z.string().url().default('https://iris-api-sandbox.circle.com'),

  DATABASE_URL: optionalString,

  // Telegram bot for deal alerts and chat notifications. When unset, the bot
  // module no-ops gracefully and the /telegram routes report "not configured".
  TELEGRAM_BOT_TOKEN: optionalString,
  TELEGRAM_BOT_USERNAME: optionalString,

  // Reputation chain-mirror reconciler. OFF by default. It replays the legacy
  // recordCompletion(jobId, ...) directly from the buyer agent wallet for
  // DB-settled deals the chain has not recorded. That path only works against a
  // pre-v2.D reputation contract: from v2.D on, recordCompletion is onlyEscrow
  // and rejects the agent wallet, so every tick re-fails the same jobIds, burns
  // real Arc gas, and spams agent.error. The escrow records reputation
  // atomically on settle now, so there is nothing for this to reconcile on the
  // live contract. Enable it ONLY when KARWAN_REPUTATION_ADDR points at a legacy
  // (non-onlyEscrow) deploy.
  REPUTATION_RECONCILER_ENABLED: z.preprocess(
    (v) => v === 'true' || v === '1',
    z.boolean(),
  ),

  // Escrow v2b settlement lifecycle. OFF by default so the backend keeps its
  // v2.E behaviour (dispute+refund auto-reclaim, refund-based cancel, 5-arg
  // fundEscrow with no on-chain clock). Flip to true ONLY after the v2b escrow
  // is deployed and KARWAN_ESCROW_ADDR points at it, in lockstep with swapping
  // abis/escrow.ts to the v2b shape. When on: fundEscrow threads the per-deal
  // clock, auto-reclaim uses reclaimAfterDeadline, and post-accept cancels run
  // the mutual-cancel handshake instead of the (now pre-accept-only) refund.
  ESCROW_V2B_ENABLED: z.preprocess(
    (v) => v === 'true' || v === '1',
    z.boolean(),
  ),

  // --- Paytag (@handle counterparties) ---
  // Lets a P2P buyer name their counterparty by Paytag handle instead of an
  // email or a raw address. P2P ONLY: the finance lane (SME) still requires a
  // verified-business counterparty, and a handle is not a verification.
  // Defaults OFF; flip after the P2P rollout is judged.
  PAYTAG_ENABLED: z.preprocess((v) => v === 'true' || v === '1', z.boolean()),
  // Paytag's ERC-721 registry on Arc. Read permissionlessly via our own Arc
  // client, so no API key and no account with them is required.
  PAYTAG_REGISTRY_ADDR: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .optional(),
  // Keyless REST fallback for handles that exist in their database but are not
  // minted on the chain we run on. Resolution is a public GET (no auth).
  PAYTAG_API_BASE: z.string().url().optional(),

  // --- Agentic-workflow rollout flags (audit/AGENTIC_WORKFLOW_REVIEW.md) ---
  // Each gates one behavior change in the "live market intelligence reaches the
  // decision" work and DEFAULTS OFF, so the agent path is byte-for-byte its
  // current self until the flag is flipped. Flip per-behavior after the eval
  // harness confirms the flags-on scoring is an improvement, never a regression.

  // The seller agent AWAITS its market research (bounded by an 8s deadline)
  // before pricing the opening bid, instead of firing it non-blocking. On
  // timeout it proceeds exactly as today (prices on whatever is already warm).
  // Off = current non-blocking behavior; the opening bid never waits.
  RESEARCH_AWAIT_ENABLED: z.preprocess(
    (v) => v === 'true' || v === '1',
    z.boolean(),
  ),
  // The security agent evaluates a proposed match (deterministic checks + an
  // optional paid counterparty overview) and may hold it for human review
  // BEFORE the deal is persisted. Off = matches persist with no gate (today).
  SECURITY_MATCH_GATE_ENABLED: z.preprocess(
    (v) => v === 'true' || v === '1',
    z.boolean(),
  ),
  // The daily trend scout nudges sellers when a trending category overlaps
  // their history. Off = no trend nudges emitted (today).
  TREND_NUDGES_ENABLED: z.preprocess(
    (v) => v === 'true' || v === '1',
    z.boolean(),
  ),
  // The user-triggered market scout endpoint (/api/research/scout) is live.
  // Off = the route responds 404/disabled (today).
  SCOUT_ENABLED: z.preprocess(
    (v) => v === 'true' || v === '1',
    z.boolean(),
  ),

  // Public origin of the frontend, used to embed deal links in Telegram
  // messages so users can jump straight to the deal page from a notification.
  FRONTEND_BASE_URL: z.preprocess(blankToUndefined, z.string().url().optional()),

  // X OAuth 2.0 PKCE credentials. When unset, the /api/x routes report "not
  // configured" and the frontend falls back to a manual handle entry. Set up
  // an X dev app, allowlist the redirect, and paste the values here to enable.
  X_CLIENT_ID: optionalString,
  X_CLIENT_SECRET: optionalString,
  X_REDIRECT_URI: z.preprocess(blankToUndefined, z.string().url().optional()),

  // WebAuthn / passkey login. SESSION_SECRET signs session cookies; rotate to
  // invalidate every session at once. RP_ID must match the hostname the user
  // visits (no scheme, no port). ORIGIN is the full https origin allowed to
  // hold credentials. Localhost-friendly defaults work for dev.
  SESSION_SECRET: optionalString,
  WEBAUTHN_RP_ID: optionalString,
  WEBAUTHN_RP_NAME: optionalString,
  WEBAUTHN_ORIGIN: optionalString,

  // Resend transactional email. When RESEND_API_KEY is unset the OTP route
  // falls back to logging the code to the server console (dev convenience).
  // RESEND_FROM is the sender address. Use `onboarding@resend.dev` for the
  // hackathon-grade sandbox path, or a verified-domain address in prod.
  RESEND_API_KEY: optionalString,
  RESEND_FROM: z.preprocess(blankToUndefined, z.string().default('Karwan <onboarding@resend.dev>')),
  // Resend Audience that mirrors our verified-email list for product-update
  // broadcasts. When set, a verified email is upserted as a contact on verify
  // and removed on email-remove, so the list stays current with no manual
  // export. The actual sends (newsletter / product updates) are composed and
  // fired from the Resend dashboard against this audience. Unset = the sync is
  // a no-op and verified emails live only in our own DB. Keep newsletter sends
  // on a separate sending subdomain from transactional OTP mail so a marketing
  // spam complaint can't poison verification-code deliverability.
  RESEND_AUDIENCE_ID: optionalString,

  // Tester feedback delivery. When set, POST /api/feedback forwards each
  // submission (text plus any screenshots) to this Telegram chat so the
  // operator sees it immediately. Find the id by messaging @userinfobot, or by
  // reading the chatId the bot logs when you link your wallet. Unset = store
  // only; read it back via GET /api/feedback.
  FEEDBACK_TELEGRAM_CHAT_ID: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().optional(),
  ),
  // Live support handoff. When a user asks for a human in the assistant widget,
  // the conversation (with its AI transcript) is pushed to this Telegram chat;
  // the operator replies there and the reply relays back into the widget. Falls
  // back to FEEDBACK_TELEGRAM_CHAT_ID when unset so a solo operator needs only
  // one chat. Unset (and no feedback chat) = the handoff button is hidden.
  SUPPORT_TELEGRAM_CHAT_ID: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().optional(),
  ),
  // Durable archive recipient for closed support conversations. Every closed
  // conversation is emailed here (and to the user when their email is known) so
  // the record lives in an inbox, not a growing Postgres table. Make this a
  // Google Group to fan every transcript out to the whole support team.
  SUPPORT_EMAIL: z.preprocess(blankToUndefined, z.string().default('support@karwan.site')),
  // Team alert recipient. When set (e.g. a Google Group), a short "new ticket"
  // alert email fires the moment a live chat opens, so the team can pick it up
  // immediately instead of waiting for the close-out transcript. Falls back to
  // SUPPORT_EMAIL when unset.
  SUPPORT_TEAM_EMAIL: optionalString,
  // Inbound email -> ticket. Secret in the webhook URL path
  // (/api/support/inbound/:secret) so only the configured mail provider can
  // post. Unset = the inbound route is disabled (404).
  INBOUND_EMAIL_SECRET: optionalString,
  // Address mail to this domain is received on (e.g. tickets@inbound.karwan.site),
  // set as Reply-To on outbound support mail so replies thread back to the
  // inbound webhook. Falls back to SUPPORT_EMAIL when unset.
  SUPPORT_REPLY_TO: optionalString,
  // This backend's own public origin, e.g. https://api.karwan.site. Used to
  // build absolute screenshot URLs so Telegram can fetch them and the feedback
  // viewer can link them. Unset = screenshots are stored but not pushed to
  // Telegram (the alert still names how many were attached).
  PUBLIC_API_BASE_URL: z.preprocess(blankToUndefined, z.string().url().optional()),

  // Shared secret gating the admin surface (/api/admin/* and the feedback
  // list/status endpoints). Callers send it as the `X-Admin-Token` header.
  // Fail-closed: when unset, the admin surface is DISABLED, not open. Set a
  // long random value in production.
  ADMIN_API_TOKEN: optionalString,
  // Support-team token. Grants access to the support tickets ONLY (read +
  // reply + close), never the rest of the admin surface (deals, profiles,
  // management, events). Give this to support staff so they can answer
  // tickets without the power to touch deals or accounts. Unset = no support-
  // only access (only the full admin token works).
  SUPPORT_API_TOKEN: optionalString,
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

// Resolve the CCTP relay wallet identity. New names win; fall back to the
// deprecated BUYER_AGENT_* aliases for one release window so existing prod
// deploys don't break the moment this lands. After a release cycle, drop
// the BUYER_AGENT_* keys from the schema and from .env.
const cctpRelayWalletId =
  parsed.data.CCTP_RELAY_WALLET_ID || parsed.data.BUYER_AGENT_WALLET_ID || undefined;
const cctpRelayAddress =
  parsed.data.CCTP_RELAY_ADDRESS || parsed.data.BUYER_AGENT_ADDRESS || undefined;

if (
  !parsed.data.CCTP_RELAY_WALLET_ID &&
  parsed.data.BUYER_AGENT_WALLET_ID
) {
  // Deprecation notice once at boot. Operator-visible in container logs.
  console.warn(
    '[config] BUYER_AGENT_WALLET_ID is deprecated. Rename to CCTP_RELAY_WALLET_ID (and BUYER_AGENT_ADDRESS to CCTP_RELAY_ADDRESS). The old keys will keep working for one release.',
  );
}

// The external x402 rail (Base) funds every paid market read. When its payer
// key is unset, maybeResearchMarket / maybeSellerResearch silently no-op, so
// the agents negotiate blind on on-platform signals alone — the exact "live
// intelligence never reaches the decision" gap the agentic-workflow work
// closes. Make that state LOUD at boot instead of a silent degradation. The
// payer-EOA-balance-too-low half of the check is async (needs an on-chain read)
// and is surfaced by the admin health probe (x402PayerHealth), not here.
if (parsed.data.X402_PAID_SIGNALS_ENABLED && !parsed.data.X402_BASE_PRIVATE_KEY) {
  console.error(
    '[config] X402_BASE_PRIVATE_KEY is unset while X402_PAID_SIGNALS_ENABLED is on: ' +
      'paid market research is DISABLED and agents will price on on-platform signals only. ' +
      'Set the Base payer EOA key to restore live market reads.',
  );
}

export const config = {
  ...parsed.data,
  /// Resolved CCTP relay wallet. Read this everywhere bridge mints fire.
  /// Equivalent to `CCTP_RELAY_WALLET_ID ?? BUYER_AGENT_WALLET_ID` after the
  /// transitional alias is removed.
  cctpRelayWalletId,
  /// Resolved CCTP relay address, used for status surfaces and balance reads.
  cctpRelayAddress,
};
export type Config = typeof config;

/// All configured Conduit keys, in priority order, tried before Anthropic. Reads
/// CONDUIT_API_KEY, _2, _3; each may itself be a comma-separated list. Trimmed,
/// emptied, and de-duplicated.
export function conduitApiKeys(): string[] {
  const keys = [config.CONDUIT_API_KEY, config.CONDUIT_API_KEY_2, config.CONDUIT_API_KEY_3]
    .flatMap((v) => (v ? v.split(',') : []))
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set(keys)];
}
