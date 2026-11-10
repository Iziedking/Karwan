/// Which switchable features run on this network, so nothing offers one that
/// is off (product audit, Batch 1). The live value is in featuresLive.ts.
export interface LiveFeatures {
  hourlyWork: boolean;
  /// View 75: a seller chosen from the shortlist is asked first.
  sellerAsked: boolean;
  /// View 75: the agent can be switched off (needs the shortlist too).
  agentSwitch: boolean;
}

/// Hourly work needs both the engagements and the market requests bound to
/// the Time escrow (work/workLive.ts, work/workRequestsLive.ts).
export function liveFeaturesFrom(input: { work: unknown; workRequests: unknown; sellerAsked?: boolean; agentSwitch?: boolean }): LiveFeatures {
  return { hourlyWork: input.work != null && input.workRequests != null, sellerAsked: input.sellerAsked === true, agentSwitch: input.agentSwitch === true };
}

/// Guide entries the assistant must not offer while their feature is off.
export function hiddenGuideIds(f: Pick<LiveFeatures, 'hourlyWork' | 'sellerAsked'>): string[] {
  return [...(f.hourlyWork ? [] : ['hourly-work']), ...(f.sellerAsked ? [] : ['seller-asked'])];
}
