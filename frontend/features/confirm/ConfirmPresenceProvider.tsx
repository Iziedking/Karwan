'use client';
import { useEffect, useRef, useState } from 'react';
import { setConfirmHandler, type ConfirmRequired } from '@/core/api';
import { ConfirmPresenceSheet } from './ConfirmPresenceSheet';

/// Answers every 428 the backend sends with the confirmation sheet, so any
/// screen that sends money out or puts up deal insurance gets it without code
/// of its own.
export function ConfirmPresenceProvider() {
  const [required, setRequired] = useState<ConfirmRequired | null>(null);
  const resolve = useRef<((grant: string | null) => void) | null>(null);

  useEffect(() => {
    setConfirmHandler(
      (next) =>
        new Promise<string | null>((done) => {
          resolve.current?.(null);
          resolve.current = done;
          setRequired(next);
        }),
    );
    return () => {
      setConfirmHandler(null);
      resolve.current?.(null);
    };
  }, []);

  const settle = (grant: string | null) => {
    resolve.current?.(grant);
    resolve.current = null;
    setRequired(null);
  };

  return required ? <ConfirmPresenceSheet required={required} onDone={settle} onClose={() => settle(null)} /> : null;
}
