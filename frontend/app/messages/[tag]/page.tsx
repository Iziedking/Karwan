'use client';

import { use } from 'react';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { ConversationView } from '@/features/messages/ConversationView';

/// Talk to someone by their Karwan tag before a deal: /messages/ada.
export default function MessagesPage({ params }: { params: Promise<{ tag: string }> }) {
  const { tag } = use(params);
  const t = useTranslations().directMessages;
  return (
    <AuthGuard gateTag={t.gateTag} gateBody={t.gateBody}>
      <ConversationView tag={decodeURIComponent(tag).replace(/^@/, '')} />
    </AuthGuard>
  );
}
