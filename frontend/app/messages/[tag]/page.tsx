'use client';

import { use } from 'react';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { ConversationView } from '@/features/messages/ConversationView';
import { parseAbout } from '@/features/messages/about';

/// Talk to someone by their Karwan tag before a deal: /messages/ada. From a
/// market ad, ?about=listing:<id> or request:<id> names what it is about.
export default function MessagesPage({ params, searchParams }: { params: Promise<{ tag: string }>; searchParams: Promise<{ about?: string }> }) {
  const { tag } = use(params);
  const { about } = use(searchParams);
  const t = useTranslations().directMessages;
  return (
    <AuthGuard gateTag={t.gateTag} gateBody={t.gateBody}>
      <ConversationView tag={decodeURIComponent(tag).replace(/^@/, '')} about={parseAbout(about)} />
    </AuthGuard>
  );
}
