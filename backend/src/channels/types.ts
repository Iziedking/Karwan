import type { ConfirmAction } from '../assistant/actions.js';

/// One message a person sent the Karwan agent on a chat channel, reduced to
/// what Karwan reads. Each channel adapter parses its own payload into this.
export interface InboundMessage {
  id: string;
  /// The sender's channel id: digits for a WhatsApp number, `tg:<id>` for a
  /// Telegram user.
  from: string;
  /// Epoch milliseconds.
  timestamp: number;
  kind: 'text' | 'button' | 'list' | 'media' | 'other';
  /// Typed text, or a media caption.
  text?: string;
  /// The id of the button or list row the person tapped.
  replyId?: string;
  mediaId?: string;
  mimeType?: string;
  /// The channel's own id for this message, so it can be deleted (a message
  /// that holds a sign-in code).
  messageRef?: string;
}

export type OnboardingStep = 'choose' | 'have' | 'email' | 'code' | 'terms' | 'tag' | 'role' | 'offer' | 'price' | 'done';

/// Where someone is in signing in or up from a chat.
export interface OnboardingState {
  step: OnboardingStep;
  /// 'new' signs up; 'have' signs in to an existing account or adds an email.
  mode?: 'new' | 'have';
  email?: string;
  role?: 'sell' | 'buy' | 'both';
  offer?: string;
}

/// What the core reads and writes on a chat account, whichever channel holds
/// it. The field names are the stored ones and stay as they are.
export interface ChatAccount {
  /// Hashed channel id: the lookup key. The raw id never becomes a key.
  numberHash: string;
  /// Where replies go: the number on WhatsApp, the chat id on Telegram.
  to: string;
  address: string | null;
  termsVersion: string | null;
  termsAt: number | null;
  lastInboundAt: number | null;
  /// Agent wallets created and bound. False after a failed activation, which
  /// is retried on the next accept.
  activated?: boolean;
  /// The last messages of the conversation, sent with each assistant turn.
  history?: { role: 'user' | 'assistant'; content: string }[];
  /// Confirm cards waiting for a button tap, by card id.
  pendingActions?: Record<string, { action: ConfirmAction; expiresAt: number }>;
  onboarding?: OnboardingState;
  /// An account opened before chat sign-in had an email was asked once to add one.
  emailAsked?: boolean;
  /// People may find this account by its chat username (Telegram name).
  findable?: boolean;
  /// The findable question was asked once.
  findableAsked?: boolean;
}
