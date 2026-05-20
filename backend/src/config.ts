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
  KARWAN_REPUTATION_ADDR: optionalAddr,
  // KarwanVault. Optional because pre-deploy the reputation engine cleanly
  // degrades stakeTerm to its base value (1.0). Once set, stake.ts indexes
  // Deposited events for the address to compute tenure-weighted active stake.
  KARWAN_VAULT_ADDR: optionalAddr,
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

  CIRCLE_API_KEY: optionalString,
  CIRCLE_ENTITY_SECRET: optionalString,
  CIRCLE_WALLET_SET_ID: optionalString,

  BUYER_AGENT_WALLET_ID: optionalString,
  BUYER_AGENT_ADDRESS: optionalAddr,
  SELLER_AGENT_WALLET_ID: optionalString,
  SELLER_AGENT_ADDRESS: optionalAddr,

  OPENROUTER_API_KEY: optionalString,
  LLM_MODEL: z.string().default('google/gemini-2.5-flash-lite'),

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
  // RESEND_FROM is the sender address — use `onboarding@resend.dev` for the
  // hackathon-grade sandbox path, or a verified-domain address in prod.
  RESEND_API_KEY: optionalString,
  RESEND_FROM: z.preprocess(blankToUndefined, z.string().default('Karwan <onboarding@resend.dev>')),

  // Tester feedback delivery. When set, POST /api/feedback forwards each
  // submission (text plus any screenshots) to this Telegram chat so the
  // operator sees it immediately. Find the id by messaging @userinfobot, or by
  // reading the chatId the bot logs when you link your wallet. Unset = store
  // only; read it back via GET /api/feedback.
  FEEDBACK_TELEGRAM_CHAT_ID: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().optional(),
  ),
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
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
