'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';

export const MESSAGE_INBOX_KEY = ['message-inbox'] as const;

/// The signed-in person's conversations by tag, read again every half minute so
/// a new message shows in the app without Telegram or email. `unread` counts the
/// ones with a message since they were last opened: opening a conversation
/// clears it, a reply is not needed.
export function useMessageInbox() {
  const { isAuthenticated } = useAuth();
  const query = useQuery({
    queryKey: MESSAGE_INBOX_KEY,
    queryFn: api.messageInbox,
    enabled: isAuthenticated,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
  const conversations = query.data?.conversations ?? [];
  return { conversations, unread: conversations.filter((c) => c.unread).length, loading: query.isLoading, error: query.isError };
}

/// The tag a conversation links to, or null for someone with no tag.
export const inboxTag = (withLabel: string) => (withLabel.startsWith('@') ? withLabel.slice(1) : null);
