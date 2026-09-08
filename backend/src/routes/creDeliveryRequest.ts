import { Hono, type Context } from 'hono';
import { config } from '../config.js';
import { getDeal, listAllDeals, patchDeal } from '../db/deals.js';
import {
  bearerTokenMatches,
  bindCreEvidenceReceipt,
  buildCreDeliveryRequest,
  deliveryRequestInputSchema,
  evidenceReceiptBindingInputSchema,
  publicCreDeliveryRequest,
  selectCurrentCreDeliveryRequest,
} from '../evidence/creDeliveryRequest.js';

export const creDeliveryRequestRoutes = new Hono();

function authorized(c: Context) {
  return bearerTokenMatches(c.req.header('authorization'), config.CRE_DELIVERY_REQUEST_TOKEN);
}

function disabled(c: Context) {
  return c.json({ error: 'CRE delivery request bridge is not configured', code: 'CRE_REQUEST_BRIDGE_DISABLED' }, 503);
}

creDeliveryRequestRoutes.use('*', async (c, next) => {
  if (!config.CRE_DELIVERY_REQUEST_TOKEN) return disabled(c);
  if (!authorized(c)) return c.json({ error: 'invalid CRE delivery request credentials' }, 401);
  await next();
});

creDeliveryRequestRoutes.get('/current', async (c) => {
  const requestedDealId = c.req.query('dealId');
  const selection = selectCurrentCreDeliveryRequest(await listAllDeals(), requestedDealId);
  if (selection.kind === 'ambiguous') {
    return c.json({ error: 'multiple active delivery requests; specify dealId', code: 'CRE_REQUEST_AMBIGUOUS' }, 409);
  }
  if (selection.kind === 'none') {
    return c.json({ error: 'no active delivery request', code: 'CRE_REQUEST_NOT_FOUND' }, 404);
  }
  return c.json(publicCreDeliveryRequest(selection.request));
});

creDeliveryRequestRoutes.get('/:jobId', async (c) => {
  const deal = await getDeal(c.req.param('jobId'));
  if (!deal?.creDeliveryRequest) return c.json({ error: 'delivery request not found', code: 'CRE_REQUEST_NOT_FOUND' }, 404);
  const selection = selectCurrentCreDeliveryRequest([deal], deal.jobId);
  if (selection.kind !== 'ok') return c.json({ error: 'delivery request is stale or expired', code: 'CRE_REQUEST_STALE' }, 409);
  return c.json(publicCreDeliveryRequest(selection.request));
});

creDeliveryRequestRoutes.post('/:jobId', async (c) => {
  let input;
  try {
    input = deliveryRequestInputSchema.parse(await c.req.json());
  } catch {
    return c.json({ error: 'invalid delivery request body', code: 'INVALID_BODY' }, 400);
  }
  const deal = await getDeal(c.req.param('jobId'));
  if (!deal) return c.json({ error: 'deal not found', code: 'DEAL_NOT_FOUND' }, 404);
  const result = buildCreDeliveryRequest(deal, input);
  if (!result.ok) return c.json({ error: result.message, code: result.code }, result.code === 'REQUEST_CONFLICT' ? 409 : 422);
  if (!result.idempotent) {
    const saved = await patchDeal(deal.jobId, { creDeliveryRequest: result.request });
    if (!saved) return c.json({ error: 'deal disappeared while publishing request', code: 'DEAL_NOT_FOUND' }, 404);
  }
  return c.json({ ok: true, idempotent: result.idempotent, request: publicCreDeliveryRequest(result.request) }, result.idempotent ? 200 : 201);
});

creDeliveryRequestRoutes.post('/:jobId/receipt', async (c) => {
  let input;
  try {
    input = evidenceReceiptBindingInputSchema.parse(await c.req.json());
  } catch {
    return c.json({ error: 'invalid evidence receipt binding body', code: 'INVALID_BODY' }, 400);
  }
  const deal = await getDeal(c.req.param('jobId'));
  if (!deal) return c.json({ error: 'deal not found', code: 'DEAL_NOT_FOUND' }, 404);
  const result = bindCreEvidenceReceipt(deal, input);
  if (!result.ok) return c.json({ error: result.message, code: result.code }, result.code.endsWith('CONFLICT') ? 409 : 422);
  if (!result.idempotent) {
    const saved = await patchDeal(deal.jobId, {
      creEvidenceReceipt: result.binding,
      evidenceExpectedCommitment: result.binding.evidenceCommitment,
    });
    if (!saved) return c.json({ error: 'deal disappeared while binding receipt', code: 'DEAL_NOT_FOUND' }, 404);
  }
  return c.json({ ok: true, idempotent: result.idempotent, binding: result.binding }, result.idempotent ? 200 : 201);
});
