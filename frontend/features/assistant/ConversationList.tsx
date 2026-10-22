'use client';

import type { AssistantConversationSummary } from '@/core/api';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { Icon } from '@/shared/components/Icon';
import { cn } from '@/shared/utils/cn';
import { groupConversations } from './conversationGroups';

/// The conversation column of assistant mode: New conversation, then the saved
/// ones under Today, Yesterday and Earlier. Each one can be deleted from here.
export function ConversationList({ list, currentId, onNew, onOpen, onRemove }: {
  list: readonly AssistantConversationSummary[];
  currentId: string | null;
  onNew: () => void;
  onOpen: (id: string) => void;
  onRemove: (id: string) => void;
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
              <li
                key={c.id}
                className={cn(
                  'group flex items-center rounded-[10px] transition-colors',
                  c.id === currentId ? 'bg-[var(--lp-light)]' : 'hover:bg-[var(--lp-light)]',
                )}
              >
                <button
                  type="button"
                  aria-current={c.id === currentId ? 'page' : undefined}
                  onClick={() => onOpen(c.id)}
                  className={cn(
                    'min-w-0 flex-1 truncate rounded-[10px] py-3 ps-3 text-start text-[15px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]',
                    c.id === currentId ? 'text-[var(--lp-dark)]' : 'text-[var(--lp-text-sub)] group-hover:text-[var(--lp-dark)]',
                  )}
                >
                  {c.title}
                </button>
                {/* Always shown on touch screens; on a pointer it appears on hover or focus. */}
                <button
                  type="button"
                  onClick={() => onRemove(c.id)}
                  aria-label={t.removeNamed.replace('{title}', c.title)}
                  className="grid size-11 shrink-0 place-items-center rounded-[10px] text-[var(--lp-text-sub)] transition-opacity hover:text-[var(--color-critical)] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100"
                >
                  <Icon name="trash" size={16} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
