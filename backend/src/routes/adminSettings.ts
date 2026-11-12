import { Hono } from 'hono';
import { z } from 'zod';
import { deskPrincipal, requireAdmin } from '../middleware/adminAuth.js';
import { twoPeople } from '../middleware/twoPeople.js';
import { invalidBodyMessage } from './invalidBody.js';

/// Settings (view 79): GET /api/admin/settings answers every switch on or off
/// and never a value, and the deal rules switch: turning it on is one person,
/// turning it off (POST /deal-rules/off) waits for a second teammate.
export const adminSettingsRoutes = new Hono();

adminSettingsRoutes.use('/settings', requireAdmin);
adminSettingsRoutes.use('/deal-rules', requireAdmin);
adminSettingsRoutes.use('/deal-rules/*', requireAdmin);

/// The server flags Settings names, read from config. Only whether each is set
/// leaves this file.
interface ServerFlags {
  AGENT_SEED_PRIVATE_KEY?: string;
  X402_PAID_SIGNALS_ENABLED?: boolean;
  X402_BASE_PRIVATE_KEY?: string;
  KARWAN_TREASURY_USYC_ADDR?: string;
  USYC_OPERATOR_PRIVATE_KEY?: string;
  VERIFIED_REPUTATION_ENFORCED?: boolean;
  BUSINESS_AUTO_APPROVE?: boolean;
}

interface SettingsSource {
  dealRules: () => Promise<{ on: boolean }>;
  setDealRules: (on: boolean, by: string) => Promise<{ on: boolean }>;
  formLimits: () => Promise<{ on: boolean }>;
  env: ServerFlags;
}

async function liveSource(): Promise<SettingsSource> {
  const [{ dealRulesState, setDealRules }, { formLimitsState }, { config }] = await Promise.all([
    import('../db/dealRulesSwitch.js'),
    import('../db/formLimits.js'),
    import('../config.js'),
  ]);
  return { dealRules: dealRulesState, setDealRules, formLimits: formLimitsState, env: config as unknown as ServerFlags };
}

let source: SettingsSource | null = null;

async function src(): Promise<SettingsSource> {
  source ??= await liveSource();
  return source;
}

export function useSettingsForTests(s: SettingsSource): void {
  source = s;
}

export function serverSwitches(env: ServerFlags): Array<{ name: string; on: boolean }> {
  return [
    { name: 'Agent gas seed', on: Boolean(env.AGENT_SEED_PRIVATE_KEY) },
    { name: 'Paid signals', on: env.X402_PAID_SIGNALS_ENABLED === true },
    { name: 'Outside research', on: Boolean(env.X402_BASE_PRIVATE_KEY) },
    { name: 'Treasury yield', on: Boolean(env.KARWAN_TREASURY_USYC_ADDR && env.USYC_OPERATOR_PRIVATE_KEY) },
    { name: 'Reputation check', on: env.VERIFIED_REPUTATION_ENFORCED === true },
    { name: 'Approve businesses automatically', on: env.BUSINESS_AUTO_APPROVE === true },
  ];
}

adminSettingsRoutes.get('/settings', async (c) => {
  const s = await src();
  const [deal, form] = await Promise.all([s.dealRules(), s.formLimits()]);
  return c.json({
    switches: [
      { key: 'deal_rules', on: deal.on, secondPerson: true },
      { key: 'form_limits', on: form.on, secondPerson: false },
    ],
    server: serverSwitches(s.env),
  });
});

adminSettingsRoutes.get('/deal-rules', async (c) => c.json(await (await src()).dealRules()));

const byOf = (c: Parameters<typeof deskPrincipal>[0]) => {
  const p = deskPrincipal(c);
  return p?.email ?? p?.name ?? 'admin';
};

adminSettingsRoutes.post('/deal-rules', async (c) => {
  let body;
  try {
    body = z.object({ on: z.boolean() }).parse(await c.req.json());
  } catch (err) {
    return c.json({ error: invalidBodyMessage(err) }, 400);
  }
  if (!body.on) return c.json({ error: 'Turning deal rules off needs a second teammate. Ask on Settings.' }, 400);
  return c.json(await (await src()).setDealRules(true, byOf(c)));
});

adminSettingsRoutes.post(
  '/deal-rules/off',
  twoPeople({ key: 'deal-rules-off', label: 'Turn deal rules off', snapshot: async () => ({ on: (await (await src()).dealRules()).on }) }),
  async (c) => c.json(await (await src()).setDealRules(false, byOf(c))),
);
