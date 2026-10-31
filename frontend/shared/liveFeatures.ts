/// Which switchable features run on this network (GET /api/features). Until the
/// answer arrives every feature counts as off, so nothing flashes and vanishes.
export interface LiveFeatures {
  hourlyWork: boolean;
}

export const LIVE_FEATURES_OFF: LiveFeatures = { hourlyWork: false };

/// A deploy shows within minutes without a reload.
export const LIVE_FEATURES_QUERY = { staleTime: 300_000, refetchOnWindowFocus: true } as const;
