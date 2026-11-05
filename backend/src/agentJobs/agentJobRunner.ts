import { logger } from '../logger.js';
import type { AgentJobs } from './agentJobs.js';

/// Pays outside-agent jobs whose review ended in silence, returns the money for
/// rejections nobody disputed, and flags the reminders (view 15). A step that
/// fails on chain stays for the next pass.
const EVERY_MS = 10 * 60_000;

export function startAgentJobRunner(core: AgentJobs | null): () => void {
  if (!core) return () => {};
  let running = false;
  const pass = async () => {
    if (running) return;
    running = true;
    try {
      const steps = await core.tick();
      if (steps.length) logger.info({ steps }, 'agent jobs moved on');
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'agent job runner pass failed');
    } finally {
      running = false;
    }
  };
  const id = setInterval(() => void pass(), EVERY_MS);
  id.unref?.();
  return () => clearInterval(id);
}
