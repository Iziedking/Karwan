import { formatUnits, parseUnits } from 'viem';
import type { MatchProposal } from '../db/matchProposals.js';
import { matchNeed } from './buyerFundingNeed.js';

const USDC_DECIMALS = 6;

/// A match marked short when it was proposed reads the buyer agent's balance
/// again, so a top-up shows at once instead of the page still asking for one.
/// Returns the proposal with its funding fields brought up to date, or null
/// when there is nothing to change. Never throws.
export async function refreshFundability(
  proposal: MatchProposal,
  readBalance: (agent: string) => Promise<bigint>,
): Promise<MatchProposal | null> {
  if (proposal.fundable !== false || proposal.approvedAt || proposal.declinedAt || !proposal.fundedAmountUsdc) return null;
  // A seller raise is funded at the raised price, which its own path reads.
  if (proposal.awaitingParty === 'buyer' && proposal.raisedPriceUsdc) return null;
  let balance: bigint;
  try {
    balance = await readBalance(proposal.buyerAgent);
  } catch {
    return null;
  }
  const needed = matchNeed(parseUnits(proposal.fundedAmountUsdc, USDC_DECIMALS));
  const agentBalanceUsdc = formatUnits(balance, USDC_DECIMALS);
  if (agentBalanceUsdc === proposal.agentBalanceUsdc) return null;
  const fundable = balance >= needed;
  return {
    ...proposal,
    fundable,
    agentBalanceUsdc,
    topUpNeededUsdc: formatUnits(fundable ? 0n : needed - balance, USDC_DECIMALS),
  };
}
