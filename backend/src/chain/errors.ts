/// Shared classifier for agent-side chain failures. Both the direct-deal route
/// and the managed-deal buyer agent run the same `executeContractCall` path
/// against the same Circle wallet, so they surface the same error shapes —
/// keep the mapping in one place so the UI and Telegram fan-out can render a
/// uniform error language.

export type AgentErrorCode =
  | 'INSUFFICIENT_AGENT_BALANCE'
  | 'INSUFFICIENT_AGENT_GAS'
  | 'AGENT_TX_FAILED';

export interface AgentErrorInfo {
  code: AgentErrorCode;
  message: string;
  raw: string;
}

export function classifyAgentError(err: unknown): AgentErrorInfo {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  const lower = raw.toLowerCase();
  if (
    lower.includes('insufficient_token_balance') ||
    lower.includes('transfer amount exceeds balance')
  ) {
    return {
      code: 'INSUFFICIENT_AGENT_BALANCE',
      message: 'The buyer agent does not have enough USDC on Arc to fund this escrow.',
      raw,
    };
  }
  if (lower.includes('insufficient funds') && lower.includes('gas')) {
    return {
      code: 'INSUFFICIENT_AGENT_GAS',
      message: 'The buyer agent does not have enough native gas on Arc to send this transaction.',
      raw,
    };
  }
  return { code: 'AGENT_TX_FAILED', message: 'The agent transaction failed.', raw };
}
