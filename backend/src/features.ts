/// Which switchable features run on this network, so nothing offers one that
/// is off (product audit, Batch 1). The live value is in featuresLive.ts.
export interface LiveFeatures {
  hourlyWork: boolean;
}

/// Hourly work needs both the engagements and the market requests bound to
/// the Time escrow (work/workLive.ts, work/workRequestsLive.ts).
export function liveFeaturesFrom(input: { work: unknown; workRequests: unknown }): LiveFeatures {
  return { hourlyWork: input.work != null && input.workRequests != null };
}

/// Guide entries the assistant must not offer while their feature is off.
export function hiddenGuideIds(f: LiveFeatures): string[] {
  return f.hourlyWork ? [] : ['hourly-work'];
}
