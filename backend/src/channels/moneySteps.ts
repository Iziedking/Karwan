import type { ConfirmAction } from '../assistant/actions.js';

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
  'stake_usdc',
  'claim_yield',
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
      return job ? `/deals/${job}` : null;
    case 'approve_match':
    case 'choose_offer':
      return job ? `/jobs/${job}` : null;
    case 'withdraw_proceeds':
    case 'fund_agent':
      return '/account';
    case 'cash_out':
      return '/bridge?direction=out';
    case 'top_up_to_arc':
      return '/bridge?direction=in';
    case 'stake_usdc':
    case 'claim_yield':
      return '/stake';
    default:
      return null;
  }
}
