'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ASSISTANT_OPEN_EVENT, isShortcut, openAssistant, type AssistantOpenDetail } from './openAssistant';

/// Listens once in the signed-in shell: Ctrl+K or Cmd+K, and any screen asking
/// to open the assistant page or bring in a person (view 57).
export function useAssistantShortcut(enabled: boolean): void {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const where = useRef(pathname);
  where.current = pathname;

  useEffect(() => {
    if (!enabled) return;
    const push = (href: string) => router.push(href);
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !isShortcut(e)) return;
      e.preventDefault();
      if (!/^\/assistant(?:\/|$)/.test(where.current)) openAssistant(where.current, push);
    };
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<AssistantOpenDetail>).detail;
      if (detail?.to === 'person') push(detail.href);
      else openAssistant(where.current, push);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener(ASSISTANT_OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(ASSISTANT_OPEN_EVENT, onOpen);
    };
  }, [enabled, router]);
}
