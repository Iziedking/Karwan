/// How much motion a device gets (view 86): full everywhere it can carry it,
/// lite on little memory, few cores or a slow connection, still for
/// reduced motion, Save-Data and 2G.

export type MotionLevel = 'full' | 'lite' | 'still';

const RANK: Record<MotionLevel, number> = { full: 0, lite: 1, still: 2 };

export interface DeviceSignals {
  reducedMotion: boolean;
  saveData: boolean;
  effectiveType: string | undefined;
  /// GB, from navigator.deviceMemory; Safari and Firefox report nothing.
  deviceMemory: number | undefined;
  /// navigator.hardwareConcurrency.
  cores: number | undefined;
}

export function deviceLevel(s: DeviceSignals): MotionLevel {
  if (s.reducedMotion || s.saveData) return 'still';
  if (s.effectiveType === '2g' || s.effectiveType === 'slow-2g') return 'still';
  if (s.effectiveType === '3g') return 'lite';
  if (s.deviceMemory !== undefined && s.deviceMemory <= 4) return 'lite';
  if (s.cores !== undefined && s.cores <= 4) return 'lite';
  return 'full';
}

/// The lower of two levels.
export function lower(a: MotionLevel, b: MotionLevel | null): MotionLevel {
  return b && RANK[b] > RANK[a] ? b : a;
}

export function stepDown(level: MotionLevel): MotionLevel {
  return level === 'full' ? 'lite' : 'still';
}

/// After at least 60 frames of scrolling: if a quarter or more ran over
/// 34 ms (under 30 a second, on any screen), the device is struggling.
export function frameVerdict(gaps: readonly number[]): 'keep' | 'down' {
  if (gaps.length < 60) return 'keep';
  const late = gaps.filter((g) => g > 34).length;
  return late / gaps.length >= 0.25 ? 'down' : 'keep';
}

export const SAVED_KEY = 'karwan.motionLevel';
const KEEP_MS = 30 * 86_400_000;

type Store = Pick<Storage, 'getItem' | 'setItem'>;

/// A step down saved on this device in the last 30 days, or null.
export function readSaved(store: Store, now: number): MotionLevel | null {
  try {
    const raw = store.getItem(SAVED_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { level?: unknown; at?: unknown };
    if (saved.level !== 'lite' && saved.level !== 'still') return null;
    if (typeof saved.at !== 'number' || now - saved.at > KEEP_MS) return null;
    return saved.level;
  } catch {
    return null;
  }
}

export function saveDown(store: Store, level: MotionLevel, now: number): void {
  try {
    store.setItem(SAVED_KEY, JSON.stringify({ level, at: now }));
  } catch {
    // Private mode or a full store: the step down holds for this visit only.
  }
}
