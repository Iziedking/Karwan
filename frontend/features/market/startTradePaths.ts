import type { LiveFeatures } from '@/shared/liveFeatures';

export type StartTradePathId = 'buy' | 'sell' | 'agreement' | 'contest' | 'hourly';

/// The ways into a trade, in order; hourly work only where it runs.
export function startTradePaths(f: LiveFeatures): StartTradePathId[] {
  const paths: StartTradePathId[] = ['buy', 'sell', 'agreement', 'contest'];
  return f.hourlyWork ? [...paths, 'hourly'] : paths;
}
