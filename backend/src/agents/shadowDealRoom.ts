import type { AgentRuntimeRepository, DealRoomRecord, RuntimeData } from '../db/agentRuntime.js';

/**
 * Make the V2 foreign-key target available for a legacy-derived shadow task.
 * This creates only an open, explicitly marked V2 projection; it does not
 * claim the legacy deal state or authorize any action.
 */
export async function ensureShadowDealRoom(
  repository: AgentRuntimeRepository,
  dealRoomId: string,
  now: number,
  dataPatch?: RuntimeData,
): Promise<DealRoomRecord> {
  const id = dealRoomId.trim();
  if (!id) throw new Error('shadow deal room id is required');
  const existing = await repository.getDealRoom(id);
  if (existing) return existing;
  try {
    return await repository.createDealRoom({
      id,
      jobId: id,
      data: {
        mode: 'read-only-shadow',
        authoritativeDealRoom: 'legacy',
        ...dataPatch,
      },
      now,
    });
  } catch (error) {
    // Two independent legacy observations can race to seed the same room.
    // Re-read after a duplicate rather than retrying an insert or hiding a
    // different database error.
    const raced = await repository.getDealRoom(id);
    if (raced) return raced;
    throw error;
  }
}
