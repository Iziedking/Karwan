import type { ConfirmAction } from '../assistant/actions.js';
import type { OutMessage } from './render.js';

/// Steps that move money. On a chat channel these are never confirmed by a
/// chat button: the person opens Karwan, sees every figure, and confirms
/// there. Chat keeps everything else: terms, delivery, extensions, disputes.
export const MONEY_INTENTS: ReadonlySet<ConfirmAction['intent']> = new Set<ConfirmAction['intent']>([
  'fund_direct_deal',
  'release_milestone',
  'cancel_deal',
  'approve_match',
  'choose_offer',
  'withdraw_proceeds',
  'fund_agent',
  'cash_out',
  'top_up_to_arc',
  'guarantee_put_up',
  'claim_yield',
  'guarantee_collect',
  'legacy_step',
  'finance_accept',
  'finance_offer',
  'finance_pay_seller',
  'claim_payment',
  'take_back_deal',
  'accept_offer',
  'near_miss_proceed',
  'pay_payment_link',
  'add_research_credit',
]);

const JOB_ID = /^0x[0-9a-fA-F]{64}$/;

/// The Karwan page where this money step is confirmed, or null when the card
/// does not carry what the page needs.
export function moneyStepPath(action: ConfirmAction): string | null {
  const jobId = (action.payload as { jobId?: unknown }).jobId;
  const job = typeof jobId === 'string' && JOB_ID.test(jobId) ? jobId : null;
  switch (action.intent) {
    case 'fund_direct_deal':
    case 'release_milestone':
    case 'cancel_deal':
    case 'finance_accept':
    case 'claim_payment':
    case 'take_back_deal':
      return job ? `/deals/${job}` : null;
    case 'finance_offer':
    case 'finance_pay_seller':
      return '/financier';
    case 'approve_match':
    case 'choose_offer':
    case 'accept_offer':
    case 'near_miss_proceed':
      return job ? `/jobs/${job}` : null;
    case 'withdraw_proceeds':
    case 'fund_agent':
      return '/account';
    case 'cash_out':
      return '/bridge?direction=out';
    case 'top_up_to_arc':
      return '/bridge?direction=in';
    case 'add_research_credit':
      return '/profile/agent-funds';
    case 'pay_payment_link': {
      const token = (action.payload as { token?: unknown }).token;
      return typeof token === 'string' && /^[0-9a-f-]{36}$/.test(token) ? `/deposit/request/${token}` : null;
    }
    case 'guarantee_put_up':
    case 'claim_yield':
    case 'guarantee_collect':
      return '/guarantee';
    case 'legacy_step':
      return '/legacy';
    default:
      return null;
  }
}

/// How every chat channel shows a money card: as a one-time link to the
/// Karwan page where the person sees every figure and confirms. A card shown
/// this way is never kept, so no chat tap can confirm it.
export function createMoneyStepPresenter(deps: {
  webBase: string;
  /// A one-time sign-in link for an account Karwan holds the keys of, or null.
  openLink: (address: string, path: string) => Promise<string | null>;
}) {
  return async function presentConfirm(address: string, action: ConfirmAction): Promise<OutMessage | null> {
    if (!MONEY_INTENTS.has(action.intent)) return null;
    const path = moneyStepPath(action);
    const details = [action.title, action.summary, ...action.fields.map((f) => `${f.label}: ${f.value}`), action.warning]
      .filter(Boolean)
      .join('\n');
    if (!path) return { kind: 'text', body: `${details}\n\nOpen Karwan to finish this step.` };
    const signedIn = await deps.openLink(address, path);
    const how = 'You confirm this on Karwan, where you see every figure before money moves.';
    return {
      kind: 'link',
      body: signedIn ? `${details}\n\n${how} The link works once, within 10 minutes.` : `${details}\n\n${how}`,
      label: 'Open in Karwan',
      url: signedIn ?? `${deps.webBase}${path}`,
    };
  };
}
