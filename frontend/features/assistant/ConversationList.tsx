'use client';

import type { AssistantConversationSummary } from '@/core/api';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { cn } from '@/shared/utils/cn';
import { groupConversations } from './conversationGroups';

/// The conversation column of assistant mode: New conversation, then the saved
/// ones under Today, Yesterday and Earlier.
export function ConversationList({ list, currentId, onNew, onOpen }: {
  list: readonly AssistantConversationSummary[];
  currentId: string | null;
  onNew: () => void;
  onOpen: (id: string) => void;
}) {
  const t = useTranslations().assistantMode;
  const groups = groupConversations(list, Date.now());
  return (
    <nav aria-label={t.conversations} className="flex flex-col gap-1">
      <button
        type="button"
        onClick={onNew}
        className="flex min-h-12 items-center gap-2.5 rounded-[12px] border border-[var(--lp-outline-strong)] px-4 text-[15px] font-semibold text-[var(--lp-dark)] transition-colors hover:bg-[var(--lp-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
        {t.newConversation}
      </button>
      {groups.length === 0 ? <p className="mt-4 px-2 text-[14px] text-[var(--lp-text-sub)]">{t.noConversations}</p> : null}
      {groups.map((g) => (
        <div key={g.when}>
          <p className="mx-2 mb-1.5 mt-4 text-[14px] font-semibold text-[var(--lp-text-sub)]">{t[g.when]}</p>
          <ul className="flex flex-col gap-0.5">
            {g.items.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  aria-current={c.id === currentId ? 'page' : undefined}
                  onClick={() => onOpen(c.id)}
                  className={cn(
                    'block w-full truncate rounded-[10px] px-3 py-3 text-start text-[15px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]',
                    c.id === currentId ? 'bg-[var(--lp-light)] text-[var(--lp-dark)]' : 'text-[var(--lp-text-sub)] hover:bg-[var(--lp-light)] hover:text-[var(--lp-dark)]',
                  )}
                >
                  {c.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
