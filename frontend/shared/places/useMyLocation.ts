'use client';

import { useCallback, useRef, useState } from 'react';
import { api } from '@/core/api';
import { findMe, LOCATE_OPTIONS, type FoundPlace, type Position } from './findMe';

/// The hook behind "Use my location" (view 39, 19 Nov): asks the phone only
/// when tapped, and names the nearest town through Karwan's own server.

function deviceLocate(): (() => Promise<Position>) | null {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return null;
  return () => new Promise<Position>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, LOCATE_OPTIONS));
}

export function useMyLocation(onFound: (place: FoundPlace) => void) {
  const [state, setState] = useState<'idle' | 'finding' | 'found' | 'failed'>('idle');
  const asking = useRef(false);
  const ask = useCallback(() => {
    if (asking.current) return;
    asking.current = true;
    setState('finding');
    void findMe({ locate: deviceLocate(), near: api.placesNear }).then((place) => {
      asking.current = false;
      if (place) {
        setState('found');
        onFound(place);
      } else {
        setState('failed');
      }
    });
  }, [onFound]);
  return { state, ask };
}
