// Off-chain brief metadata keyed by on-chain jobId. The on-chain JobBoard only
// stores termsHash for integrity; this side-store carries the human-readable
// brief plus negotiation knobs (tolerance, keywords) the agents consult when
// scoring and counter-evaluating.

export interface Brief {
  jobId: string;
  briefText: string;
  postedBy: string;
  negotiationMaxIncreasePct?: number;
  keywords?: string[];
  createdAt: number;
}

const store = new Map<string, Brief>();

export function getBrief(jobId: string): Brief | null {
  return store.get(jobId.toLowerCase()) ?? null;
}

export function createBrief(input: Omit<Brief, 'createdAt'>): Brief {
  const brief: Brief = {
    ...input,
    jobId: input.jobId.toLowerCase(),
    postedBy: input.postedBy.toLowerCase(),
    createdAt: Date.now(),
  };
  store.set(brief.jobId, brief);
  return brief;
}

export function patchBrief(jobId: string, patch: Partial<Brief>): Brief | null {
  const existing = store.get(jobId.toLowerCase());
  if (!existing) return null;
  const next = { ...existing, ...patch };
  store.set(existing.jobId, next);
  return next;
}
