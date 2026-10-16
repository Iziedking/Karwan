// Karwan's own CRE routes (backend/src/routes/cre.ts) over https on
// node-services, for `cre workflow simulate` runs. In-memory store, seeded with
// the scenario's policy and delivery documents; every request is logged as
// evidence. Simulation trust only: never a production endpoint.
import { appendFileSync, readFileSync } from 'node:fs';
import { Hono } from 'hono';
import { createCreRoutes } from '../../../backend/src/routes/cre.ts';
import { createMemoryCreStore } from '../../../backend/src/cre/store.ts';
import { verifyDonReport } from '../../../backend/src/cre/reportVerify.ts';

const need = (name: string) => {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required`);
  return v;
};

const token = need('CRE_WORKFLOW_TOKEN');
const logPath = process.env.SIM_LOG ?? 'requests.jsonl';
const workflowIds = (process.env.SIM_WORKFLOW_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const workflowOwner = (process.env.SIM_WORKFLOW_OWNER ?? '').toLowerCase();
const scenario = JSON.parse(readFileSync(need('SIM_SCENARIO'), 'utf8'));

const record = (entry: Record<string, unknown>) => appendFileSync(logPath, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);

const store = createMemoryCreStore();
const policyHash = await store.putDocument('policy', scenario.policy);
const referenceHash = await store.putDocument('reference', scenario.reference);
if (policyHash !== scenario.policyHash || referenceHash !== scenario.proofHash) {
  throw new Error(`scenario fingerprints differ: policy ${policyHash}, reference ${referenceHash}`);
}
if (process.env.SIM_WATCH_FAMILY && process.env.SIM_WATCH_DEAL) {
  await store.watch({ kind: 'agreement', family: process.env.SIM_WATCH_FAMILY, id: process.env.SIM_WATCH_DEAL }, Date.now());
}

const routes = createCreRoutes({
  store,
  token,
  now: () => Date.now(),
  // Shadow mode: nothing posted here is taken as attested on Arc.
  checkApprovedOnChain: async () => false,
  verifyReport: (report) =>
    verifyDonReport(report, {
      readDon: async () => {
        throw new Error('simulation reads no DON registry');
      },
      workflowIds: new Set(workflowIds),
      workflowOwner,
      trust: 'simulation',
    }),
  notify: async (alerts) => record({ kind: 'alerts-acted-on', alerts }),
  workflows: { check: workflowIds, risk: workflowIds },
});

const app = new Hono();
app.use('*', async (c, next) => {
  const body = c.req.method === 'POST' ? await c.req.raw.clone().text() : undefined;
  await next();
  record({ method: c.req.method, path: c.req.path, query: c.req.query(), status: c.res.status, body: body ? JSON.parse(body) : undefined });
});
app.route('/api/cre', routes);

const port = Number(process.env.SIM_PORT ?? 8743);
Bun.serve({
  hostname: '127.0.0.1',
  port,
  tls: { cert: Bun.file('tls/cert.pem'), key: Bun.file('tls/key.pem') },
  fetch: app.fetch,
});
record({ kind: 'started', port, policyHash, referenceHash, workflowIds, workflowOwner });
console.log(`karwan cre simulation api on https://localhost:${port}`);
