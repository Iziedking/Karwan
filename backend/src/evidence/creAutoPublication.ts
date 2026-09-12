import { config } from '../config.js';
import { getDeal, listAllDeals, updateCrePublication, type DirectDeal } from '../db/deals.js';
import { logger } from '../logger.js';
import { buildCreDeliveryRequest, type CreDeliveryRequest } from './creDeliveryRequest.js';
import { publishCreDeliveryRequest } from './creDeliveryRequestQueue.js';
import { parseGitHubSubmission, resolveGitHubSubmissionSha } from './githubSubmission.js';

export interface CreAutoPublicationDependencies {
  enabled: boolean;
  now: () => number;
  get: typeof getDeal;
  update: typeof updateCrePublication;
  publish: (request: CreDeliveryRequest) => Promise<{ ok: boolean }>;
  resolveSha: (submission: NonNullable<ReturnType<typeof parseGitHubSubmission>>) => Promise<string>;
}
const dependencies: CreAutoPublicationDependencies = {
  enabled: config.CRE_AUTO_PUBLISH_ENABLED && Boolean(config.CRE_DELIVERY_REQUEST_TOKEN),
  now: Date.now, get: getDeal, update: updateCrePublication, publish: publishCreDeliveryRequest,
  resolveSha: (submission) => resolveGitHubSubmissionSha(submission, config.CRE_GITHUB_SHA_MODE, config.CRE_GITHUB_READ_TOKEN),
};

function eligible(deal: DirectDeal | null): deal is DirectDeal {
  return !!deal && deal.evidenceRequired === true && deal.delivered === true && !!deal.acceptedAt
    && !deal.cancelledAt && !deal.settledAt && !deal.disputed
    && deal.verificationStatus !== 'malicious' && deal.verificationStatus !== 'suspicious';
}

/** Durable delivery is the outbox. A restart retries the same pinned request. */
export async function automaticallyPublishCreDelivery(jobId: string, deps = dependencies): Promise<void> {
  if (!deps.enabled) return;
  const snapshot = await deps.get(jobId);
  if (!eligible(snapshot)) return;
  const now = deps.now();
  // Reserve a bounded attempt under the same delivery lock before any provider call.
  const reserved = await deps.update(snapshot, (current) => {
    if (!eligible(current)) return null;
    if (current.creDeliveryRequest && (current.creDeliveryRequest.expiresAt <= now / 1000 || current.creEvidenceReceipt)) return null;
    const attempt = current.creAutoPublication;
    if (attempt?.published && current.creDeliveryRequest) return null;
    if (attempt && attempt.revision === current.deliveryRevision && (attempt.attempts >= 3 || attempt.nextAttemptAt > now)) return null;
    return { creAutoPublication: { revision: current.deliveryRevision!, attempts: (attempt && attempt.revision === current.deliveryRevision ? attempt.attempts : 0) + 1, nextAttemptAt: now + 60_000 } };
  });
  if (!reserved) return;
  let error: NonNullable<DirectDeal['creAutoPublication']>['error'];
  try {
    let pinned = reserved;
    if (!pinned.creDeliveryRequest) {
      const submission = parseGitHubSubmission(pinned.deliveryProof);
      if (!submission) { error = 'invalid-proof'; return; }
      let submittedSha: string;
      try { submittedSha = await deps.resolveSha(submission); }
      catch (cause) { error = cause instanceof Error && cause.message === 'GITHUB_SUBMISSION_NOT_MERGED' ? 'not-merged' : 'github-unavailable'; return; }
      const built = buildCreDeliveryRequest(pinned, {
        termsVersion: pinned.agreementVersion ?? 1, evidenceRevision: pinned.deliveryRevision!,
        expiresAt: Math.floor(now / 1000) + 3600, pullNumber: submission.pullNumber, submittedSha,
      }, Math.floor(now / 1000));
      if (!built.ok) return;
      const attached = await deps.update(pinned, (current) => current.creDeliveryRequest ? null : {
        creDeliveryRequest: { ...built.request, ...submission, publishedAt: now },
      });
      if (!attached) return;
      pinned = attached;
    }
    // Persist the mirror first: /current and the recovery sweep can adopt it if this call fails.
    const published = await deps.publish(pinned.creDeliveryRequest!);
    if (!published.ok) error = 'publish-unavailable';
    else await deps.update(pinned, (current) => ({ creAutoPublication: { ...current.creAutoPublication!, published: true } }));
  } catch {
    error = 'publish-unavailable';
  } finally {
    if (error) {
      const code = error;
      await deps.update(reserved, (current) => ({ creAutoPublication: { ...current.creAutoPublication!, error: code } }));
      logger.warn({ jobId, code }, 'CRE automatic publication needs attention');
    }
  }
}

export function startCreAutoPublisher(): () => void {
  if (!dependencies.enabled) {
    logger.info('CRE automatic publication disabled or bridge token missing');
    return () => undefined;
  }
  let stopped = false;
  let running = false;
  const sweep = async () => {
    if (stopped || running) return;
    running = true;
    try {
      const candidates = (await listAllDeals()).filter(eligible).filter((deal) => {
        const attempt = deal.creAutoPublication;
        return !deal.creEvidenceReceipt && !attempt?.published
          && (!deal.creDeliveryRequest || deal.creDeliveryRequest.expiresAt > Date.now() / 1000)
          && (!attempt || (attempt.attempts < 3 && attempt.nextAttemptAt <= Date.now()));
      }).sort((a,b) => (a.deliveredAt ?? 0) - (b.deliveredAt ?? 0)).slice(0,5);
      for (const deal of candidates) {
        if (stopped) break;
        await automaticallyPublishCreDelivery(deal.jobId);
      }
    } catch {
      logger.warn('CRE automatic publication recovery failed');
    } finally { running = false; }
  };
  void sweep();
  const timer = setInterval(() => { void sweep(); }, 30_000);
  timer.unref();
  logger.info({ intervalMs: 30_000, batchSize: 5, maxAttempts: 3 }, 'CRE automatic publication started');
  return () => { stopped = true; clearInterval(timer); };
}
