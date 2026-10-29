import { logger } from '../logger.js';

/// Agents are set up when an account is made, so nobody is asked to activate
/// anything (view 38). Runs in the background: sign-up answers first, and a
/// failure is retried by the next POST /api/activate.

export interface AgentStartDeps {
  existing: (address: string) => Promise<unknown | null>;
  activate: (address: string) => Promise<unknown>;
  log: (err: Error) => void;
}

const live: AgentStartDeps = {
  existing: async (address) => (await import('../db/agentWallets.js')).getAgentWallets(address),
  activate: async (address) => (await import('../routes/activation.js')).activateAgents(address),
  log: (err) => logger.warn({ err: err.message }, 'agent setup at sign-up failed; activate retries it'),
};

export function startAgents(address: string, deps: AgentStartDeps = live): void {
  const key = address.toLowerCase();
  void (async () => {
    if (await deps.existing(key)) return;
    await deps.activate(key);
  })().catch((err: unknown) => deps.log(err instanceof Error ? err : new Error(String(err))));
}
