import { Hono } from 'hono';
import { z } from 'zod';
import { readSession } from '../auth/session.js';
import { accountKindOf } from '../profile/accountType.js';
import { getProfile, upsertProfile, listProfiles } from '../db/profiles.js';
import { getUserByAddress } from '../db/users.js';
import { executeContractCall } from '../chain/txs.js';
import { requireAdmin } from '../middleware/adminAuth.js';
import { config } from '../config.js';
import { bus } from '../events.js';
import { logger } from '../logger.js';

/// Verified-business accounts. A wallet registers as a business by anchoring a
/// registration or tax-doc hash on KarwanBusinessRegistry (web3 users sign
/// submitRegistration themselves; Circle users get the -circle sister route).
/// Karwan reviews and approves; approval flips the profile to accountType
/// 'business'. Company details ("what the business does") live on the profile's
/// smeProfile and can be updated freely; sensitive changes (legal name, the
/// anchored document) require a fresh registration that re-enters review.
///
/// On-chain writes follow the trade.ts pattern: the wallet that owns the action
/// signs, the backend mirrors after a confirmed tx. The reviewer's approve /
/// reject is signed by a dedicated Karwan reviewer DCW.

const addrSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'expected 0x-prefixed 20-byte hex address');
const hashSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/, 'expected 0x-prefixed 32-byte hex hash');

const sectorSchema = z.enum([
  'agriculture',
  'textiles',
  'electronics',
  'logistics',
  'manufacturing',
  'services',
  'other',
]);
const employeeBandSchema = z.enum(['micro', 'small', 'medium']);
const docKindSchema = z.enum(['registration', 'tax', 'other']);

/// Company details captured at registration. Mirror of the smeProfile shape.
const companySchema = z.object({
  companyName: z.string().min(1).max(120),
  sector: sectorSchema.optional(),
  region: z.string().min(2).max(80).optional(),
  yearFounded: z.number().int().min(1800).max(2100).optional(),
  employeeBand: employeeBandSchema.optional(),
  websiteUrl: z.string().url().max(200).optional(),
});

/// Soft profile fields a verified business may change without re-review. The
/// legal companyName is included but rate-limited (see NAME_EDIT_* below): a
/// misentry can be fixed, but the verification-bound name can't be churned.
const softUpdateSchema = z.object({
  address: addrSchema,
  companyName: z.string().min(1).max(120).optional(),
  sector: sectorSchema.optional(),
  region: z.string().min(2).max(80).optional(),
  yearFounded: z.number().int().min(1800).max(2100).optional(),
  employeeBand: employeeBandSchema.optional(),
  websiteUrl: z.string().url().max(200).optional(),
});

/// Legal-name edits are capped: once every 30 days, 5 over the account lifetime.
/// Enough to fix a misentry, tight enough to deny churn / impersonation games.
const NAME_EDIT_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
const NAME_EDIT_LIFETIME_MAX = 5;

const registerBodySchema = z.object({
  address: addrSchema,
  company: companySchema,
  docHash: hashSchema,
  docKind: docKindSchema.default('registration'),
  label: z.string().max(120).optional(),
  /// Present when a web3 user has already signed submitRegistration locally.
  txHash: hashSchema.optional(),
});

const reviewBodySchema = z.object({
  applicant: addrSchema,
  decision: z.enum(['approve', 'reject']),
  /// sha256 of the human-readable rejection reason; required on reject.
  reasonHash: hashSchema.optional(),
});

export const businessRoutes = new Hono();

/// Persist the company snapshot and move the business envelope to 'submitted'.
/// Shared by the web3 and Circle register paths.
async function recordSubmission(
  address: string,
  company: z.infer<typeof companySchema>,
  docHash: string,
  docKind: 'registration' | 'tax' | 'other',
  label: string | undefined,
  submitTxHash: string | undefined,
) {
  const existing = await getProfile(address);
  if (!existing) throw new Error('profile not found');
  // For pilots / internal testing, verify on submit so the SME rail unlocks
  // without the on-chain reviewer wallet being wired. Off in production.
  const autoApprove = config.BUSINESS_AUTO_APPROVE;
  const now = Date.now();
  await upsertProfile({
    ...existing,
    ...(autoApprove ? { accountType: 'business' as const } : {}),
    smeProfile: {
      ...(existing.smeProfile ?? {}),
      companyName: company.companyName,
      sector: company.sector ?? existing.smeProfile?.sector,
      region: company.region ?? existing.smeProfile?.region,
      yearFounded: company.yearFounded ?? existing.smeProfile?.yearFounded,
      employeeBand: company.employeeBand ?? existing.smeProfile?.employeeBand,
      websiteUrl: company.websiteUrl ?? existing.smeProfile?.websiteUrl,
      ...(autoApprove ? { verifiedAt: now } : {}),
    },
    business: {
      status: autoApprove ? 'verified' : 'submitted',
      docHash: docHash.toLowerCase(),
      docKind,
      label,
      submitTxHash: submitTxHash?.toLowerCase(),
      submittedAt: now,
      ...(autoApprove ? { reviewedAt: now, verifiedAt: now } : {}),
    },
  });
  bus.emitEvent({
    type: autoApprove ? 'business.verified' : 'business.registration.submitted',
    actor: 'platform',
    payload: { address, docKind, txHash: submitTxHash },
  });
  logger.info({ address, docKind }, 'business: registration submitted');
}

/// POST /api/business/register: web3 path. The caller has signed
/// submitRegistration(docHash) with their own wallet and reports the tx hash.
/// Backend records the company snapshot + the submitted state.
businessRoutes.post('/register', async (c) => {
  if (!config.KARWAN_BUSINESS_REGISTRY_ADDR) {
    return c.json({ error: 'business registry not configured' }, 503);
  }
  const session = readSession(c);
  if (!session) return c.json({ error: 'not authenticated' }, 401);
  if ((await accountKindOf(session.address)) !== 'business') {
    return c.json({ error: 'Business registration is for business accounts.', code: 'sme_rail_only' }, 403);
  }

  let body;
  try {
    body = registerBodySchema.parse(await c.req.json());
  } catch (e) {
    return c.json({ error: 'invalid body', detail: (e as Error).message }, 400);
  }
  if (body.address.toLowerCase() !== session.address.toLowerCase()) {
    return c.json({ error: 'address must match session' }, 403);
  }

  try {
    await recordSubmission(
      body.address.toLowerCase(),
      body.company,
      body.docHash,
      body.docKind,
      body.label,
      body.txHash,
    );
    return c.json({ ok: true, status: 'submitted' });
  } catch (err) {
    return c.json({ error: 'register failed', detail: (err as Error).message }, 502);
  }
});

/// POST /api/business/register-circle: Circle DCW path. Backend signs
/// submitRegistration against the caller's identity wallet, then records the
/// submission. Web3 users use POST /register with their own tx hash.
businessRoutes.post('/register-circle', async (c) => {
  if (!config.KARWAN_BUSINESS_REGISTRY_ADDR) {
    return c.json({ error: 'business registry not configured' }, 503);
  }
  const session = readSession(c);
  if (!session) return c.json({ error: 'not authenticated' }, 401);
  if ((await accountKindOf(session.address)) !== 'business') {
    return c.json({ error: 'Business registration is for business accounts.', code: 'sme_rail_only' }, 403);
  }

  let body;
  try {
    body = registerBodySchema.parse(await c.req.json());
  } catch (e) {
    return c.json({ error: 'invalid body', detail: (e as Error).message }, 400);
  }
  const caller = body.address.toLowerCase();
  if (caller !== session.address.toLowerCase()) {
    return c.json({ error: 'address must match session' }, 403);
  }

  const user = getUserByAddress(caller);
  if (!user?.circleIdentityWalletId) {
    return c.json(
      {
        error: 'no Circle identity wallet for this address',
        detail: 'register-circle is for Circle users; web3 users sign locally and POST /register.',
      },
      409,
    );
  }

  try {
    const result = await executeContractCall(
      {
        walletId: user.circleIdentityWalletId,
        contractAddress: config.KARWAN_BUSINESS_REGISTRY_ADDR,
        abiFunctionSignature: 'submitRegistration(bytes32)',
        abiParameters: [body.docHash],
      },
      `businessRegistry.submitRegistration(${caller})`,
    );
    await recordSubmission(
      caller,
      body.company,
      body.docHash,
      body.docKind,
      body.label,
      result.txHash,
    );
    return c.json({ ok: true, status: 'submitted', txHash: result.txHash });
  } catch (err) {
    logger.error({ address: caller, err: (err as Error).message }, 'business: register-circle failed');
    return c.json({ error: 'register failed', detail: (err as Error).message }, 502);
  }
});

/// POST /api/business/profile: update soft company fields with no re-review.
/// A change to the legal companyName or the anchored document is sensitive and
/// is rejected here with guidance to re-register, which re-enters Karwan review.
businessRoutes.post('/profile', async (c) => {
  const session = readSession(c);
  if (!session) return c.json({ error: 'not authenticated' }, 401);
  if ((await accountKindOf(session.address)) !== 'business') {
    return c.json({ error: 'This is a business profile.', code: 'sme_rail_only' }, 403);
  }

  let body;
  try {
    body = softUpdateSchema.parse(await c.req.json());
  } catch (e) {
    return c.json({ error: 'invalid body', detail: (e as Error).message }, 400);
  }
  if (body.address.toLowerCase() !== session.address.toLowerCase()) {
    return c.json({ error: 'cannot edit another address profile' }, 403);
  }

  const existing = await getProfile(body.address);
  if (!existing) return c.json({ error: 'profile not found' }, 404);

  const { address: _addr, companyName, ...soft } = body;
  const smeProfile = { ...(existing.smeProfile ?? {}), ...soft };
  let nameEdits = existing.nameEdits;

  // A legal-name change is the one sensitive field here. Apply it only when it
  // actually differs, and gate it on the 30-day / 5-lifetime cap so a typo can
  // be corrected without opening the door to name churn.
  const trimmedName = companyName?.trim();
  if (trimmedName && trimmedName !== (existing.smeProfile?.companyName ?? '')) {
    const ledger = existing.nameEdits ?? { count: 0, lastAt: 0 };
    if (ledger.count >= NAME_EDIT_LIFETIME_MAX) {
      return c.json(
        {
          error: 'You have reached the limit of 5 name changes. Contact support if you need another.',
          code: 'name_edit_capped',
        },
        429,
      );
    }
    const since = Date.now() - ledger.lastAt;
    if (ledger.lastAt && since < NAME_EDIT_COOLDOWN_MS) {
      const days = Math.ceil((NAME_EDIT_COOLDOWN_MS - since) / 86_400_000);
      return c.json(
        {
          error: `Your name can be changed once every 30 days. Try again in ${days} day${days === 1 ? '' : 's'}.`,
          code: 'name_edit_cooldown',
        },
        429,
      );
    }
    smeProfile.companyName = trimmedName;
    nameEdits = { count: ledger.count + 1, lastAt: Date.now() };
  }

  const saved = await upsertProfile({ ...existing, smeProfile, nameEdits });
  logger.info(
    { address: body.address, fields: Object.keys(soft), nameChanged: !!nameEdits && nameEdits !== existing.nameEdits },
    'business: soft profile updated',
  );
  return c.json({ smeProfile: saved.smeProfile });
});

/// GET /api/business/status/:address: public verification status + the public
/// company snapshot. The deal/match surfaces read this for the badge; the full
/// company detail stays on the profile, so deal pages stay lean.
businessRoutes.get('/status/:address', async (c) => {
  const parsed = addrSchema.safeParse(c.req.param('address'));
  if (!parsed.success) return c.json({ error: 'invalid address' }, 400);
  const profile = await getProfile(parsed.data);
  if (!profile) {
    return c.json({ accountType: 'person', status: 'none', company: null });
  }
  const sme = profile.smeProfile;
  return c.json({
    accountType: profile.accountType ?? 'person',
    status: profile.business?.status ?? 'none',
    verifiedAt: profile.business?.verifiedAt,
    company: sme
      ? {
          companyName: sme.companyName,
          sector: sme.sector,
          region: sme.region,
        }
      : null,
  });
});

/// Admin-gated review surface, mounted under /api/admin/business. The
/// requireAdmin middleware gates every route here, matching the other admin
/// surfaces.
export const businessAdminRoutes = new Hono();
businessAdminRoutes.use('*', requireAdmin);

/// GET /api/admin/business/pending: the review queue. Lists every profile whose
/// business registration is awaiting a decision.
businessAdminRoutes.get('/pending', async (c) => {
  const profiles = await listProfiles();
  const pending = profiles
    .filter((p) => p.business?.status === 'submitted')
    .map((p) => ({
      address: p.address,
      docHash: p.business?.docHash,
      docKind: p.business?.docKind,
      label: p.business?.label,
      submittedAt: p.business?.submittedAt,
      submitTxHash: p.business?.submitTxHash,
      company: p.smeProfile
        ? {
            companyName: p.smeProfile.companyName,
            sector: p.smeProfile.sector,
            region: p.smeProfile.region,
          }
        : null,
    }))
    .sort((a, b) => (a.submittedAt ?? 0) - (b.submittedAt ?? 0));
  return c.json({ pending });
});

/// POST /api/admin/business/review: reviewer approves or rejects a submitted
/// registration. Backend signs registry.approve / registry.reject with the
/// reviewer DCW, then mirrors the result: approve flips accountType to
/// 'business'; reject records the reason.
businessAdminRoutes.post('/review', async (c) => {
  if (!config.KARWAN_BUSINESS_REGISTRY_ADDR) {
    return c.json({ error: 'business registry not configured' }, 503);
  }
  if (!config.BUSINESS_REVIEWER_WALLET_ID) {
    return c.json({ error: 'reviewer wallet not configured' }, 503);
  }

  let body;
  try {
    body = reviewBodySchema.parse(await c.req.json());
  } catch (e) {
    return c.json({ error: 'invalid body', detail: (e as Error).message }, 400);
  }
  const applicant = body.applicant.toLowerCase();
  if (body.decision === 'reject' && !body.reasonHash) {
    return c.json({ error: 'reasonHash required on reject' }, 400);
  }

  const profile = await getProfile(applicant);
  if (!profile) return c.json({ error: 'profile not found' }, 404);
  if (profile.business?.status !== 'submitted') {
    return c.json({ error: 'applicant is not awaiting review' }, 409);
  }

  try {
    const call =
      body.decision === 'approve'
        ? {
            abiFunctionSignature: 'approve(address)',
            abiParameters: [applicant],
          }
        : {
            abiFunctionSignature: 'reject(address,bytes32)',
            abiParameters: [applicant, body.reasonHash as string],
          };

    const result = await executeContractCall(
      {
        walletId: config.BUSINESS_REVIEWER_WALLET_ID,
        contractAddress: config.KARWAN_BUSINESS_REGISTRY_ADDR,
        ...call,
      },
      `businessRegistry.${body.decision}(${applicant})`,
    );

    const now = Date.now();
    if (body.decision === 'approve') {
      await upsertProfile({
        ...profile,
        accountType: 'business',
        business: {
          ...(profile.business ?? { status: 'submitted' }),
          status: 'verified',
          reviewedAt: now,
          verifiedAt: now,
        },
      });
      bus.emitEvent({
        type: 'business.verified',
        actor: 'platform',
        payload: { address: applicant, txHash: result.txHash },
      });
      logger.info({ applicant, txHash: result.txHash }, 'business: verified');
    } else {
      await upsertProfile({
        ...profile,
        business: {
          ...(profile.business ?? { status: 'submitted' }),
          status: 'rejected',
          reviewedAt: now,
          rejectReason: body.reasonHash,
        },
      });
      bus.emitEvent({
        type: 'business.rejected',
        actor: 'platform',
        payload: { address: applicant, txHash: result.txHash },
      });
      logger.info({ applicant, txHash: result.txHash }, 'business: rejected');
    }

    return c.json({ ok: true, decision: body.decision, txHash: result.txHash });
  } catch (err) {
    logger.error(
      { applicant, decision: body.decision, err: (err as Error).message },
      'business: review failed',
    );
    return c.json({ error: 'review failed', detail: (err as Error).message }, 502);
  }
});
