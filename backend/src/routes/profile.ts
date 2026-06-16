import { Hono } from 'hono';
import { z } from 'zod';
import { formatUnits } from 'viem';
import { createHash, timingSafeEqual } from 'node:crypto';
import {
  getProfile,
  upsertProfile,
  findProfileByXHandle,
  setProfileEmail,
  deleteProfile,
} from '../db/profiles.js';
import { getAgentWallets } from '../db/agentWallets.js';
import { deleteUser, getUserByAddress } from '../db/users.js';
import { removeTelegramLink } from '../db/telegramLinks.js';
import { readUsdcBalance } from '../chain/contracts.js';
import { readSession, clearSessionCookie } from '../auth/session.js';
import { extractKeywords } from '../llm/keywords.js';
import { resendClient } from '../emails/resend.js';
import { brandedEmailHtml } from '../emails/brand.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

const USDC_DECIMALS = 6;

const addrSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'expected 0x-prefixed 20-byte hex address');

const profileSchema = z.object({
  address: addrSchema,
  role: z.enum(['buyer', 'seller', 'both']),
  displayName: z.string().min(1).max(80),
  /// Onboarding account kind (individual vs business). User-chosen, drives UI
  /// surfaces only. The verification-bound accountType stays separate.
  accountKind: z.enum(['person', 'business']).optional(),
  seller: z
    .object({
      skills: z.array(z.string().min(1)).min(1).max(20),
      bio: z.string().max(400).default(''),
      minBudgetUsdc: z.number().nonnegative(),
      maxBudgetUsdc: z.number().positive(),
      minDeadlineDays: z.number().int().min(0).max(90),
      maxDeadlineDays: z.number().int().min(1).max(180),
    })
    .optional(),
  buyer: z
    .object({
      maxBudgetUsdc: z.number().positive(),
      minDeadlineDays: z.number().int().min(0).max(90),
      maxDeadlineDays: z.number().int().min(1).max(180),
      bidCollectionSeconds: z.number().int().min(5).max(600),
      milestonePcts: z.array(z.number().int().min(1).max(100)).min(1).max(4),
    })
    .optional(),
});

export const profileRoutes = new Hono();

profileRoutes.get('/', async (c) => {
  const address = c.req.query('address');
  if (!address) return c.json({ error: 'address query param required' }, 400);
  const parsed = addrSchema.safeParse(address);
  if (!parsed.success) return c.json({ error: 'invalid address' }, 400);
  let profile = await getProfile(parsed.data);
  // Self-heal email for email-login users whose profile predates email
  // auto-capture. When the owner loads their own profile and it has no email,
  // backfill it from their verified signup email so financier offers and other
  // alerts can reach them. One-time write: once `email` is set this is skipped,
  // and web3 users have no user record so `getUserByAddress` returns nothing.
  if (profile && !profile.email) {
    const caller = callerFor(c, parsed.data);
    if (caller) {
      const user = getUserByAddress(caller);
      if (user?.email) {
        profile = (await setProfileEmail(caller, user.email, true)) ?? profile;
      }
    }
  }
  return c.json({ profile });
});

profileRoutes.post('/', async (c) => {
  let body;
  try {
    body = profileSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  if ((body.role === 'seller' || body.role === 'both') && !body.seller) {
    return c.json({ error: 'seller profile required when role includes seller' }, 400);
  }
  if ((body.role === 'buyer' || body.role === 'both') && !body.buyer) {
    return c.json({ error: 'buyer profile required when role includes buyer' }, 400);
  }
  if (body.seller && body.seller.minBudgetUsdc > body.seller.maxBudgetUsdc) {
    return c.json({ error: 'seller minBudgetUsdc cannot exceed maxBudgetUsdc' }, 400);
  }
  if (body.buyer && body.buyer.milestonePcts.reduce((s, n) => s + n, 0) !== 100) {
    return c.json({ error: 'buyer milestonePcts must sum to 100' }, 400);
  }

  // Extract canonical match keywords from the seller profile (skills+bio) so
  // future buyer briefs can be filtered/ranked against this seller. Fails open:
  // an empty keywords array on LLM error still saves the profile.
  const sellerWithKeywords: (typeof body.seller & { keywords: string[] }) | undefined =
    body.seller
      ? {
          ...body.seller,
          keywords: await extractKeywords(
            [body.seller.skills.join(', '), body.seller.bio].filter(Boolean).join('. '),
            `seller-profile:${body.address}`,
          ),
        }
      : undefined;
  if (sellerWithKeywords) {
    logger.info(
      { address: body.address, keywords: sellerWithKeywords.keywords },
      'seller profile keywords extracted',
    );
  }

  const profile = await upsertProfile({ ...body, seller: sellerWithKeywords });

  // Email-login (Circle) users proved their email at sign-in, so auto-fill it
  // as a verified contact email the first time they save a profile. Web3 users
  // have no login email; they add and verify one from the profile email band.
  if (!profile.email) {
    const emailUser = getUserByAddress(profile.address);
    if (emailUser?.email) {
      const withEmail = await setProfileEmail(profile.address, emailUser.email, true);
      if (withEmail) return c.json({ profile: withEmail }, 200);
    }
  }
  return c.json({ profile }, 200);
});

// ---------- CONTACT EMAIL (add + verify for wallet users) ----------
// A wallet user adds a contact email and confirms it with a 6-digit code. Same
// hashed-code + TTL pattern as the sign-in OTP in routes/auth.ts. The code is
// the proof of ownership; the request route is also session-gated so a code can
// only ever be requested for the caller's own wallet. Business accounts surface
// the same field as the business email; the relabelling is purely frontend.
interface PendingEmailCode {
  email: string;
  codeHash: string;
  expiresAt: number;
  attempts: number;
}
const emailCodes = new Map<string, PendingEmailCode>();
const EMAIL_CODE_TTL_MS = 10 * 60 * 1000;
const EMAIL_CODE_MAX_ATTEMPTS = 5;

const emailSchema = z.string().trim().toLowerCase().email().max(200);

function hashEmailCode(code: string, email: string): string {
  return createHash('sha256').update(`${code}:${email}`).digest('hex');
}

/// Caller must own the wallet they are attaching an email to. A SIWE session
/// (web3) or an email-login session both carry the address, so this holds for
/// every signed-in path. Returns the lowercased address or null.
function callerFor(c: Parameters<typeof readSession>[0], claimed: string): string | null {
  const session = readSession(c);
  if (!session) return null;
  return session.address.toLowerCase() === claimed.toLowerCase() ? session.address.toLowerCase() : null;
}

function verifyEmailHtml(code: string): string {
  const inner = `
          <tr>
            <td style="padding:36px 28px 12px 28px;text-align:center;">
              <div style="font-size:12px;letter-spacing:0.18em;color:#8a8478;text-transform:uppercase;font-family:'SFMono-Regular',Menlo,Consolas,monospace;margin-bottom:14px;">Your code</div>
              <div style="display:inline-block;padding:18px 28px;background:#f6f3ea;border:1px solid #e6e2d8;border-radius:14px 14px 14px 4px;">
                <div style="font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-variant-numeric:tabular-nums;font-size:36px;font-weight:800;letter-spacing:0.32em;color:#0e0e0e;line-height:1;padding-right:0.32em;">${code}</div>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px 8px 28px;text-align:center;">
              <p style="margin:0;font-size:14px;line-height:1.55;color:#3a352c;">
                Enter this code in Karwan to confirm this email for your account.
              </p>
              <p style="margin:10px 0 0 0;font-size:13px;line-height:1.55;color:#7a7466;">
                Expires in 10 minutes. Five wrong tries voids it.
              </p>
            </td>
          </tr>
  `;
  return brandedEmailHtml({ eyebrow: 'CONFIRM EMAIL', title: 'Confirm your Karwan email', inner });
}

async function sendVerifyEmail(email: string, code: string): Promise<boolean> {
  const client = resendClient();
  if (!client) {
    logger.info({ email, code }, '[EMAIL-VERIFY] code (no RESEND_API_KEY, log-only)');
    return false;
  }
  try {
    const { error } = await client.emails.send({
      from: config.RESEND_FROM,
      replyTo: 'support@karwan.site',
      to: email,
      subject: `Confirm your Karwan email: ${code}`,
      html: verifyEmailHtml(code),
      text:
        `Your Karwan email confirmation code is ${code}\n\n` +
        `It expires in 10 minutes. Five wrong tries voids it.\n\n` +
        `If you didn't request this, ignore the email.`,
    });
    if (error) {
      logger.warn({ err: error.message, email }, 'resend rejected verify-email send');
      logger.info({ email, code }, '[EMAIL-VERIFY] code (resend rejected, log fallback)');
      return false;
    }
    return true;
  } catch (err) {
    logger.warn({ err: (err as Error).message, email }, 'resend threw on verify-email');
    logger.info({ email, code }, '[EMAIL-VERIFY] code (resend threw, log fallback)');
    return false;
  }
}

const emailRequestSchema = z.object({ address: addrSchema, email: emailSchema });

profileRoutes.post('/email/request', async (c) => {
  let body;
  try {
    body = emailRequestSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  const caller = callerFor(c, body.address);
  if (!caller) return c.json({ error: 'sign in to add an email to this wallet' }, 401);
  const profile = await getProfile(caller);
  if (!profile) return c.json({ error: 'set up your profile first' }, 404);

  // Deterministic-free 6-digit code. Math.random is fine for a short-lived OTP.
  const code = String(Math.floor(100000 + Math.random() * 900000));
  emailCodes.set(caller, {
    email: body.email,
    codeHash: hashEmailCode(code, body.email),
    expiresAt: Date.now() + EMAIL_CODE_TTL_MS,
    attempts: 0,
  });
  const delivered = await sendVerifyEmail(body.email, code);
  return c.json({
    sent: true,
    delivered,
    ...(config.NODE_ENV !== 'production' && !delivered ? { devCode: code } : {}),
  });
});

const emailVerifySchema = z.object({
  address: addrSchema,
  code: z.string().trim().regex(/^\d{6}$/, 'code must be 6 digits'),
});

profileRoutes.post('/email/verify', async (c) => {
  let body;
  try {
    body = emailVerifySchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  const caller = callerFor(c, body.address);
  if (!caller) return c.json({ error: 'sign in to verify this email' }, 401);
  const entry = emailCodes.get(caller);
  if (!entry) return c.json({ error: 'no code pending. request a fresh one' }, 400);
  if (entry.expiresAt < Date.now()) {
    emailCodes.delete(caller);
    return c.json({ error: 'code expired, request a fresh one' }, 400);
  }
  entry.attempts += 1;
  if (entry.attempts > EMAIL_CODE_MAX_ATTEMPTS) {
    emailCodes.delete(caller);
    return c.json({ error: 'too many wrong attempts, request a fresh code' }, 429);
  }
  const expected = Buffer.from(entry.codeHash, 'hex');
  const got = Buffer.from(hashEmailCode(body.code, entry.email), 'hex');
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) {
    return c.json({ error: 'wrong code' }, 400);
  }
  emailCodes.delete(caller);
  const profile = await setProfileEmail(caller, entry.email, true);
  if (!profile) return c.json({ error: 'profile not found' }, 404);
  // Note: verifying a contact email does NOT subscribe the user to the
  // newsletter. The newsletter is a separate explicit opt-in (footer subscribe
  // box), so an unsubscribe can never strip a verified contact email.
  return c.json({ profile });
});

profileRoutes.post('/email/remove', async (c) => {
  let body;
  try {
    body = z.object({ address: addrSchema }).parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  const caller = callerFor(c, body.address);
  if (!caller) return c.json({ error: 'sign in to remove this email' }, 401);
  emailCodes.delete(caller);
  const profile = await setProfileEmail(caller, null, false);
  if (!profile) return c.json({ error: 'profile not found' }, 404);
  return c.json({ profile });
});

// Bind / unbind an X handle on the profile. Caller is the wallet that owns the
// profile; the handle is validated lightly (X enforces a stricter shape, but
// the surface is informational so the regex is forgiving).
const xHandleSchema = z.object({
  address: addrSchema,
  handle: z
    .string()
    .trim()
    .regex(/^@?[A-Za-z0-9_]{1,15}$/, 'expected an X handle like @karwan or karwan')
    .nullable(),
});

profileRoutes.post('/x-handle', async (c) => {
  let body;
  try {
    body = xHandleSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  const existing = await getProfile(body.address);
  if (!existing) return c.json({ error: 'profile not found' }, 404);
  const normalised = body.handle ? body.handle.replace(/^@/, '') : undefined;
  // One X handle binds to one wallet. Block if another account already owns it.
  if (normalised) {
    const owner = await findProfileByXHandle(normalised);
    if (owner && owner.address.toLowerCase() !== existing.address.toLowerCase()) {
      return c.json(
        {
          error: 'x handle already linked',
          detail: `@${normalised} is already connected to another Karwan account.`,
        },
        409,
      );
    }
  }
  const profile = await upsertProfile({
    address: existing.address,
    role: existing.role,
    displayName: existing.displayName,
    seller: existing.seller,
    buyer: existing.buyer,
    xHandle: normalised,
  });
  logger.info({ address: existing.address, handle: normalised ?? null }, 'x handle updated');
  return c.json({ profile }, 200);
});

/// Delete the account. Purges off-chain data (profile, Telegram link, and the
/// Circle auth row + session). Refuses while either agent wallet still holds
/// USDC, so a delete can't strand funds: the user withdraws first. On-chain
/// reputation is permanent and is not touched.
profileRoutes.delete('/', async (c) => {
  const address = c.req.query('address');
  if (!address || !addrSchema.safeParse(address).success) {
    return c.json({ error: 'address query param required' }, 400);
  }
  const addr = address.toLowerCase();
  const force = c.req.query('force') === 'true';

  // Destructive: a signed-in Circle session may only delete its own account.
  const session = readSession(c);
  if (session && session.address.toLowerCase() !== addr) {
    return c.json({ error: 'address does not match the signed-in account' }, 403);
  }

  // Warn (don't hard-block) when agent wallets still hold funds: deleting does
  // not move them. The client re-calls with ?force=true after the user confirms.
  // Skip the read entirely when forcing.
  if (!force) {
    const wallets = await getAgentWallets(addr);
    if (wallets) {
      try {
        const [buyerBal, sellerBal] = await Promise.all([
          readUsdcBalance(wallets.buyerAddress),
          readUsdcBalance(wallets.sellerAddress),
        ]);
        if (buyerBal + sellerBal > 10_000n) {
          // > 0.01 USDC across the agents (6dp).
          return c.json(
            {
              error: 'agent wallets still hold funds',
              code: 'agent-funds',
              detail: `Your agent wallets hold ${formatUnits(buyerBal, USDC_DECIMALS)} USDC (buyer) and ${formatUnits(sellerBal, USDC_DECIMALS)} USDC (seller). Deleting is permanent and does not move them. Proceed anyway?`,
            },
            409,
          );
        }
      } catch (err) {
        logger.warn({ address: addr, err: (err as Error).message }, 'delete: agent balance read failed');
        return c.json(
          { error: 'could not verify agent balances', detail: 'Try again in a moment.' },
          503,
        );
      }
    }
  }

  await deleteProfile(addr);
  try {
    await removeTelegramLink(addr);
  } catch {
    /* non-fatal */
  }
  const removedUser = deleteUser(addr);
  clearSessionCookie(c);
  logger.info({ address: addr, removedUser }, 'account deleted');
  return c.json({ ok: true });
});
