'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/// What is left of the old page guide once Aman became the only guide (view 57,
/// 17 Nov): whether the person turned first-visit tips off on this device, and
/// how much of Karwan they have used, so tips can fade. Page tours are gone.

interface GuideContextValue {
  /// First-visit tips (coach notes) were turned off on this device.
  disabled: boolean;
  /// Kept for coach notes, which wait while something else speaks. Nothing does now.
  hasActive: boolean;
  /// Quality-weighted experience. Using DIFFERENT tools advances it; repeating
  /// the same action plateaus. Record real actions via `recordAction(type)`.
  experience: number;
  recordAction: (type: string) => void;
  mastered: boolean;
}

/// Actions after which a person is treated as knowing their way around.
export const GUIDE_MASTERY_XP = 15;

const GuideContext = createContext<GuideContextValue | null>(null);

export function useGuide(): GuideContextValue {
  const ctx = useContext(GuideContext);
  if (!ctx) throw new Error('useGuide must be used within GuideProvider');
  return ctx;
}

const DISABLED_KEY = 'karwan:guide:disabled';
const ACTIONS_KEY = 'karwan:guide:actions';

function loadDisabled(): boolean {
  try {
    return localStorage.getItem(DISABLED_KEY) === '1';
  } catch {
    return false;
  }
}

function loadActions(): Record<string, number> {
  try {
    const raw = localStorage.getItem(ACTIONS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

/// Each distinct action type is worth PER_DISTINCT; repeats add a little, hard
/// capped, so a person can't grind one button to mute the tips early.
function computeExperience(actions: Record<string, number>): number {
  const PER_DISTINCT = 3;
  const PER_REPEAT = 0.5;
  const REPEAT_CAP = 10;
  let distinct = 0;
  let repeats = 0;
  for (const count of Object.values(actions)) {
    if (count <= 0) continue;
    distinct += 1;
    repeats += count - 1;
  }
  return distinct * PER_DISTINCT + Math.min(repeats, REPEAT_CAP) * PER_REPEAT;
}

export function GuideProvider({ children }: { children: ReactNode }) {
  const [disabled, setDisabled] = useState(false);
  const [actions, setActions] = useState<Record<string, number>>({});

  // Read on the client only, so server and first paint agree.
  useEffect(() => {
    setDisabled(loadDisabled());
    setActions(loadActions());
  }, []);

  const recordAction = useCallback((type: string) => {
    setActions((prev) => {
      const nextMap = { ...prev, [type]: (prev[type] ?? 0) + 1 };
      try {
        localStorage.setItem(ACTIONS_KEY, JSON.stringify(nextMap));
      } catch {
        /* without storage it counts for this visit only */
      }
      return nextMap;
    });
  }, []);

  const experience = useMemo(() => computeExperience(actions), [actions]);

  const value = useMemo<GuideContextValue>(
    () => ({ disabled, hasActive: false, experience, recordAction, mastered: experience >= GUIDE_MASTERY_XP }),
    [disabled, experience, recordAction],
  );

  return <GuideContext.Provider value={value}>{children}</GuideContext.Provider>;
}
