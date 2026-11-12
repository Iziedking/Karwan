import { randomUUID } from 'node:crypto';
import { pgEnabled, postgresExecutor } from '../db/client.js';
import type { SqlExecutor } from '../db/migrations.js';

/// The team room (view 78): one shared room for the support team, and a
/// thread for each case. A teammate asks a named teammate here; the room also
/// carries Karwan's own lines, such as a case going past its reply time.

export interface RoomMessage {
  id: string;
  /// The case this thread is about; absent in the shared room.
  caseId?: string;
  /// Absent on Karwan's own lines.
  memberId?: string;
  text: string;
  /// The teammate this message asks for help.
  asks?: string;
  at: number;
}

export interface TeamRoomStore {
  post(m: Omit<RoomMessage, 'id'>): Promise<RoomMessage>;
  /// Oldest first, the latest `limit`.
  list(opts: { caseId?: string; limit: number }): Promise<RoomMessage[]>;
}

export function memoryTeamRoomStore(): TeamRoomStore {
  const all: RoomMessage[] = [];
  return {
    async post(m) {
      const msg = { ...m, id: randomUUID() };
      all.push(msg);
      return msg;
    },
    async list({ caseId, limit }) {
      return all.filter((m) => (caseId ? m.caseId === caseId : !m.caseId)).slice(-limit);
    },
  };
}

export function postgresTeamRoomStore(executor: SqlExecutor): TeamRoomStore {
  return {
    async post(m) {
      const msg = { ...m, id: randomUUID() };
      await executor.query(`INSERT INTO team_room_v1 (id, case_id, at, data) VALUES ($1, $2, $3, $4)`, [msg.id, msg.caseId ?? null, msg.at, JSON.stringify(msg)]);
      return msg;
    },
    async list({ caseId, limit }) {
      const q = caseId
        ? await executor.query(`SELECT data FROM team_room_v1 WHERE case_id = $1 ORDER BY at DESC LIMIT $2`, [caseId, limit])
        : await executor.query(`SELECT data FROM team_room_v1 WHERE case_id IS NULL ORDER BY at DESC LIMIT $1`, [limit]);
      return (q.rows as Array<{ data: RoomMessage }>).map((r) => r.data).reverse();
    },
  };
}

let live: TeamRoomStore | null = null;

export function teamRoomStore(): TeamRoomStore {
  live ??= pgEnabled ? postgresTeamRoomStore(postgresExecutor()) : memoryTeamRoomStore();
  return live;
}

export function useTeamRoomStoreForTests(store: TeamRoomStore): void {
  live = store;
}
