import { Hono, type Context } from 'hono';
import { config } from '../config.js';
import { getDeal, listAllDeals, patchDeal } from '../db/deals.js';
import {
  bearerTokenMatches,
  bindCreEvidenceReceipt,
  buildCreDeliveryRequest,
  classifyCreDeliveryRequestForQueue,
  creDeliveryRequestKey,
  deliveryRequestInputSchema,
  evidenceReceiptBindingInputSchema,
  publicCreDeliveryRequest,
  publicCreDeliveryRequestWithLease,
} from '../evidence/creDeliveryRequest.js';
import {
  cancelCreDeliveryRequests,
  adoptLegacyCreDeliveryRequest,
  claimCreDeliveryRequest,
  completeCreDeliveryRequest,
  publishCreDeliveryRequest,
} from '../evidence/creDeliveryRequestQueue.js';

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
  const eligibleKeys: string[] = [];
  for (const deal of await listAllDeals()) {
    if (requestedDealId && deal.jobId.toLowerCase() !== requestedDealId.toLowerCase()) continue;
    const classification = classifyCreDeliveryRequestForQueue(deal);
    if (classification.kind !== 'current') continue;
    const adopted = await adoptLegacyCreDeliveryRequest(classification.request);
    if (!adopted.ok) {
      if (requestedDealId) return c.json({ error: adopted.message, code: adopted.code }, 409);
      continue;
    }
    eligibleKeys.push(adopted.value.requestKey);
  }
  const claimed = await claimCreDeliveryRequest(eligibleKeys);
  if (!claimed) {
    return c.json({ error: 'no active delivery request', code: 'CRE_REQUEST_NOT_FOUND' }, 404);
  }
  const currentDeal = await getDeal(claimed.record.dealId);
  if (!currentDeal?.creDeliveryRequest || creDeliveryRequestKey(currentDeal.creDeliveryRequest) !== claimed.record.requestKey) {
    await cancelCreDeliveryRequests(claimed.record.dealId).catch(() => undefined);
    return c.json({ error: 'delivery request became stale while it was being claimed', code: 'CRE_REQUEST_STALE' }, 409);
  }
  return c.json(publicCreDeliveryRequestWithLease(claimed.record, claimed.record.leaseToken));
});

creDeliveryRequestRoutes.get('/:jobId', async (c) => {
  const deal = await getDeal(c.req.param('jobId'));
  if (!deal) return c.json({ error: 'delivery request not found', code: 'CRE_REQUEST_NOT_FOUND' }, 404);
  const classification = classifyCreDeliveryRequestForQueue(deal);
  if (classification.kind === 'absent') return c.json({ error: 'delivery request not found', code: 'CRE_REQUEST_NOT_FOUND' }, 404);
  if (classification.kind !== 'current') return c.json({ error: 'delivery request is stale, leased or expired', code: 'CRE_REQUEST_STALE' }, 409);
  const adopted = await adoptLegacyCreDeliveryRequest(classification.request);
  if (!adopted.ok) return c.json({ error: adopted.message, code: adopted.code }, 409);
  const claimed = await claimCreDeliveryRequest([adopted.value.requestKey]);
  if (!claimed) return c.json({ error: 'delivery request is stale, leased or expired', code: 'CRE_REQUEST_STALE' }, 409);
  const currentDeal = await getDeal(deal.jobId);
  if (!currentDeal?.creDeliveryRequest || creDeliveryRequestKey(currentDeal.creDeliveryRequest) !== claimed.record.requestKey) {
    await cancelCreDeliveryRequests(deal.jobId).catch(() => undefined);
    return c.json({ error: 'delivery request became stale while it was being claimed', code: 'CRE_REQUEST_STALE' }, 409);
  }
  return c.json(publicCreDeliveryRequestWithLease(claimed.record, claimed.record.leaseToken));
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
  const queued = await publishCreDeliveryRequest(result.request);
  if (!queued.ok) return c.json({ error: queued.message, code: queued.code }, queued.code === 'REQUEST_CONFLICT' ? 409 : 503);
  if (!queued.idempotent || !deal.creDeliveryRequest || creDeliveryRequestKey(deal.creDeliveryRequest) !== queued.value.requestKey) {
    const saved = await patchDeal(deal.jobId, { creDeliveryRequest: result.request });
    if (!saved) {
      await cancelCreDeliveryRequests(deal.jobId).catch(() => undefined);
      return c.json({ error: 'deal disappeared while publishing request', code: 'DEAL_NOT_FOUND' }, 404);
    }
  }
  return c.json({ ok: true, idempotent: queued.idempotent, request: publicCreDeliveryRequest(queued.value) }, queued.idempotent ? 200 : 201);
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
  if (!deal.creDeliveryRequest) return c.json({ error: 'delivery request not found', code: 'CRE_REQUEST_NOT_FOUND' }, 404);
  const adopted = await adoptLegacyCreDeliveryRequest(deal.creDeliveryRequest);
  if (!adopted.ok) return c.json({ error: adopted.message, code: adopted.code }, 409);
  const completed = await completeCreDeliveryRequest(adopted.value, result.binding);
  if (!completed.ok) return c.json({ error: completed.message, code: completed.code }, 409);
  if (!result.idempotent) {
    const saved = await patchDeal(deal.jobId, {
      creEvidenceReceipt: result.binding,
      evidenceExpectedCommitment: result.binding.evidenceCommitment,
    });
    if (!saved) return c.json({ error: 'deal disappeared while binding receipt', code: 'DEAL_NOT_FOUND' }, 404);
  }
  return c.json({ ok: true, idempotent: completed.idempotent ?? result.idempotent, binding: result.binding }, completed.idempotent || result.idempotent ? 200 : 201);
});
