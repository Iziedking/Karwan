import { sessionAddress } from '../auth/session.js';
import { answerQuestion, openQuestionsFor, questionsSince } from '../db/agentQuestions.js';
import { getAgentRecord, updateAgentRecord } from '../db/agentRecords.js';
import { liveWatchesFor } from '../db/marketWatches.js';
import { progressStore } from '../db/agentProgress.js';
import { getProfile, type UserLocale } from '../db/profiles.js';
import type { MandateToolDeps } from '../assistant/mandateActions.js';
import type { MandateRouteDeps } from '../routes/mandate.js';
import { liveSetupDeps } from '../setup/live.js';
import { mandateOf } from './mandate.js';
import { replan, type ReplanDeps } from './replan.js';

/// The live stores behind /api/agents/mandate: the profile through the same
/// save the setup routes use, the agent record, the watches, and the seller
/// agent for the re-plan.

const seller = () => import('./seller.js');

export const liveReplanDeps: ReplanDeps = {
  now: Date.now,
  questionsSince,
  openQuestionsFor,
  answerQuestion,
  forgetJudgedFor: async (owner, jobIds) => (await seller()).forgetJudgedFor(owner, jobIds),
  matchSellerNow: async (owner) => (await seller()).matchSellerNow(owner),
  hasOfferOn: async (jobId, owner) => (await seller()).hasOfferFrom(owner, jobId),
};

export const liveMandateToolDeps: MandateToolDeps = {
  read: async (address, now) => {
    const [profile, record, watches] = await Promise.all([getProfile(address), getAgentRecord(address), liveWatchesFor(address, now).catch(() => [])]);
    if (!profile) return null;
    return { mandate: mandateOf(profile, record, watches), locale: (profile.settings?.locale ?? 'en') as UserLocale };
  },
  questionsSince,
  openRequests: async (address, now) => {
    const { gatherFacts } = await import('../intelligence/insightsLive.js');
    return (await gatherFacts(address, [], now)).openRequests.map((r) => ({ jobId: r.jobId, budgetUsdc: r.budgetUsdc }));
  },
  toldSince: (address, since) => progressStore().toldSince(address, since),
};

export const liveMandateDeps: Omit<MandateRouteDeps, 'now' | 'newId'> = {
  sessionAddress,
  current: (address) => getProfile(address),
  save: (address, patch) => liveSetupDeps.save(address, patch),
  record: (address) => getAgentRecord(address),
  updateRecord: (address, change) => updateAgentRecord(address, change),
  watches: (address, now) => liveWatchesFor(address, now),
  replan: (owner, before, patch, locale) => replan(owner, before, patch, liveReplanDeps, locale),
};
