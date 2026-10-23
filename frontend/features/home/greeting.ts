'use client';

import { useEffect, useState } from 'react';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { greetingsCopy, type GreetingsCopy } from '@/shared/i18n/messages/greetings';
import { greetingFor } from './greetingTime';

/// The greeting for the reader's local hour. Null until the page has mounted,
/// so the server's clock never decides it and hydration never disagrees; it
/// changes on its own when the hour crosses a boundary.
export function useGreeting(): string | null {
  const { locale } = useLocale();
  const [part, setPart] = useState<keyof GreetingsCopy | null>(null);
  useEffect(() => {
    const update = () => setPart(greetingFor(new Date().getHours()));
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  if (!part) return null;
  return (greetingsCopy[locale as keyof typeof greetingsCopy] ?? greetingsCopy.en)[part];
}
