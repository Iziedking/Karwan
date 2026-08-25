import {
  clampStructuredOffer,
  structuredOfferFingerprint,
  validateExactAcceptance,
  type AcceptanceCommand,
  type AcceptanceDecision,
  type AcceptanceSnapshot,
  type NegotiationMandates,
  type StructuredOffer,
} from './structuredOffer.js';
import {
  CommandIdempotencyConflict,
  type NegotiationCommandConflictRecorder,
} from './commandLedger.js';
import type { SqlExecutor } from '../db/migrations.js';
import type { KarwanEventType } from '../events.js';

export type TransactionRunner = <T>(operation: (executor: SqlExecutor) => Promise<T>) => Promise<T>;

export interface PostgresPublishCommand {
  commandId: string;
  idempotencyKey: string;
  expectedDealRoomVersion: number;
  rawOffer: unknown;
  mandates: NegotiationMandates;
  nowUnix: number;
}

export type PostgresPublishResult =
  | { outcome: 'published'; offer: StructuredOffer; dealRoomVersion: number; supersededOfferId?: string }
  | { outcome: 'duplicate'; offer: StructuredOffer; dealRoomVersion: number }
  | { outcome: 'stale'; reason: 'STALE_DEAL_ROOM' | 'STALE_OFFER'; dealRoomVersion: number; activeOfferId?: string; activeOfferVersion?: number };

interface RuntimeRow extends Record<string, unknown> {
  id: string;
  deal_room_id: string;
  state: string;
  offer_version: number | string;
  proposer: string;
  version: number | string;
  expires_at?: number | string | null;
  created_at: number | string;
  updated_at: number | string;
  data: Record<string, unknown>;
  active_offer_id?: string | null;
}

interface RoomRow extends Record<string, unknown> {
  id: string;
  job_id: string;
  state: string;
  version: number | string;
  last_sequence: number | string;
  active_offer_id?: string | null;
  data: Record<string, unknown>;
}

interface CommandRow extends Record<string, unknown> {
  command_id: string;
  kind: string;
  result: PostgresPublishResult | AcceptanceDecision;
}

function safeInt(value: number | string, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`unsafe ${label}`);
  return parsed;
}

function parseStructured(row: RuntimeRow): StructuredOffer {
  const value = row.data.structuredOffer;
  if (!value || typeof value !== 'object') throw new Error(`offer ${row.id} has no structured terms`);
  return value as StructuredOffer;
}

async function priorCommand<T extends PostgresPublishResult | AcceptanceDecision>(executor: SqlExecutor, idempotencyKey: string): Promise<{ commandId: string; kind: string; result: T } | null> {
  const result = await executor.query<CommandRow>(
    'SELECT command_id, kind, result FROM negotiation_commands_v2 WHERE idempotency_key = $1',
    [idempotencyKey],
  );
  return result.rows[0]
    ? { commandId: result.rows[0].command_id, kind: result.rows[0].kind, result: result.rows[0].result as T }
    : null;
}

async function recordCommand(executor: SqlExecutor, input: {
  commandId: string;
  idempotencyKey: string;
  kind: string;
  result: PostgresPublishResult | AcceptanceDecision;
  nowUnix: number;
}): Promise<void> {
  await executor.query(
    `INSERT INTO negotiation_commands_v2 (command_id, idempotency_key, kind, result, created_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (idempotency_key) DO NOTHING`,
    [input.commandId, input.idempotencyKey, input.kind, input.result, input.nowUnix],
  );
}

async function recordNegotiationEvent(executor: SqlExecutor, input: {
  eventId: string;
  dealRoomId: string;
  jobId: string;
  aggregateVersion: number;
  sequence: number;
  type: Extract<KarwanEventType, 'negotiation.offer.published' | 'negotiation.offer.accepted'>;
  actor: 'buyer' | 'seller' | 'platform';
  payload: Record<string, unknown>;
  offer?: StructuredOffer;
  occurredAt: number;
}): Promise<void> {
  const eventData = input.offer
    ? {
        structuredOffer: {
          id: input.offer.offerId,
          version: input.offer.offerVersion,
          amountUsdc: input.offer.priceUsdc,
          updatedAt: input.occurredAt,
          deadlineUnix: input.offer.deadlineUnix,
          buyerMandateVersion: input.offer.buyerMandateVersion,
          sellerMandateVersion: input.offer.sellerMandateVersion,
        },
      }
    : {};
  await executor.query(
    `INSERT INTO domain_events_v2 (
       id, aggregate_type, aggregate_id, aggregate_version, sequence,
       category, type, actor, job_id, dedupe_key, occurred_at, payload, data
     ) VALUES ($1, 'deal_room', $2, $3, $4, 'negotiation', $5, $6, $7, $1, $8, $9, $10)`,
    [
      input.eventId,
      input.dealRoomId,
      input.aggregateVersion,
      input.sequence,
      input.type,
      input.actor,
      input.jobId,
      input.occurredAt,
      input.payload,
      eventData,
    ],
  );
  await executor.query(
    `INSERT INTO event_outbox_v2 (
       id, event_id, state, attempt, available_at, created_at, updated_at
     ) VALUES ($1, $2, 'pending', 0, $3, $3, $3)`,
    [`outbox:${input.eventId}`, input.eventId, input.occurredAt],
  );
}

export class PostgresNegotiationRuntime {
  constructor(
    private readonly transaction: TransactionRunner,
    private readonly conflictRecorder?: NegotiationCommandConflictRecorder,
  ) {}

  async publishOffer(command: PostgresPublishCommand): Promise<PostgresPublishResult> {
    const clamped = clampStructuredOffer(command.rawOffer, command.mandates);
    const offer = clamped.offer;
    try {
      return await this.transaction(async (tx) => {
        const replayed = await priorCommand<PostgresPublishResult>(tx, command.idempotencyKey);
        if (replayed) {
          // Existing delivery retries may carry a new transport command id.
          // Only a different operation kind is an idempotency conflict.
          if (replayed.kind !== 'publish_offer') {
            throw new CommandIdempotencyConflict(command.idempotencyKey);
          }
          return replayed.result;
        }
      const roomResult = await tx.query<RoomRow>(
        'SELECT id, job_id, state, version, last_sequence, active_offer_id, data FROM deal_rooms WHERE id = $1 FOR UPDATE',
        [offer.dealRoomId],
      );
      const room = roomResult.rows[0];
      if (!room) throw new Error('DEAL_ROOM_NOT_FOUND');
      const roomVersion = safeInt(room.version, 'deal room version');
      const activeOfferId = room.active_offer_id ?? undefined;
      const activeResult = activeOfferId
        ? await tx.query<RuntimeRow>('SELECT * FROM offers WHERE id = $1 FOR UPDATE', [activeOfferId])
        : { rows: [] as RuntimeRow[] };
      const active = activeResult.rows[0];
      const activeOfferVersion = active ? safeInt(active.offer_version, 'offer version') : undefined;
      if (roomVersion !== command.expectedDealRoomVersion) {
        const result: PostgresPublishResult = { outcome: 'stale', reason: 'STALE_DEAL_ROOM', dealRoomVersion: roomVersion, ...(activeOfferId ? { activeOfferId } : {}), ...(activeOfferVersion === undefined ? {} : { activeOfferVersion }) };
        await recordCommand(tx, { commandId: command.commandId, idempotencyKey: command.idempotencyKey, kind: 'publish_offer', result, nowUnix: command.nowUnix });
        return result;
      }
      if (activeOfferVersion !== undefined && offer.offerVersion <= activeOfferVersion) {
        const result: PostgresPublishResult = { outcome: 'stale', reason: 'STALE_OFFER', dealRoomVersion: roomVersion, ...(activeOfferId ? { activeOfferId } : {}), activeOfferVersion };
        await recordCommand(tx, { commandId: command.commandId, idempotencyKey: command.idempotencyKey, kind: 'publish_offer', result, nowUnix: command.nowUnix });
        return result;
      }
      const priorOffers = await tx.query<RuntimeRow>(
        'SELECT data FROM offers WHERE deal_room_id = $1',
        [offer.dealRoomId],
      );
      if (priorOffers.rows.some((row) => structuredOfferFingerprint(parseStructured(row)) === structuredOfferFingerprint(offer))) {
        const result: PostgresPublishResult = { outcome: 'stale', reason: 'STALE_OFFER', dealRoomVersion: roomVersion, ...(activeOfferId ? { activeOfferId } : {}), ...(activeOfferVersion === undefined ? {} : { activeOfferVersion }) };
        await recordCommand(tx, { commandId: command.commandId, idempotencyKey: command.idempotencyKey, kind: 'publish_offer', result, nowUnix: command.nowUnix });
        return result;
      }
      const existingResult = await tx.query<RuntimeRow>('SELECT * FROM offers WHERE id = $1 FOR UPDATE', [offer.offerId]);
      if (existingResult.rows[0]) {
        const existing = parseStructured(existingResult.rows[0]);
        if (JSON.stringify(existing) === JSON.stringify(offer)) {
          const result: PostgresPublishResult = { outcome: 'duplicate', offer: existing, dealRoomVersion: roomVersion };
          await recordCommand(tx, { commandId: command.commandId, idempotencyKey: command.idempotencyKey, kind: 'publish_offer', result, nowUnix: command.nowUnix });
          return result;
        }
        throw new Error('OFFER_ID_REUSED');
      }
      if (activeOfferId) {
        await tx.query("UPDATE offers SET state = 'superseded', updated_at = $2 WHERE id = $1 AND state IN ('draft', 'proposed')", [activeOfferId, command.nowUnix]);
      }
      await tx.query(
        `INSERT INTO offers (id, deal_room_id, offer_version, state, proposer, version, created_at, updated_at, expires_at, data)
         VALUES ($1, $2, $3, 'proposed', $4, 1, $5, $5, $6, $7)`,
        [offer.offerId, offer.dealRoomId, offer.offerVersion, offer.senderRole, command.nowUnix, offer.deadlineUnix, {
          structuredOffer: offer,
          clampReasons: clamped.reasons,
        }],
      );
      const nextRoomVersion = roomVersion + 1;
      const nextSequence = safeInt(room.last_sequence, 'deal room sequence') + 1;
      await tx.query(
        `UPDATE deal_rooms
         SET active_offer_id = $2,
             version = $3,
             last_sequence = $4,
             updated_at = $5,
             state = CASE WHEN state IN ('open', 'qualifying') THEN 'negotiating' ELSE state END
         WHERE id = $1 AND version = $6`,
        [offer.dealRoomId, offer.offerId, nextRoomVersion, nextSequence, command.nowUnix, roomVersion],
      );
      const result: PostgresPublishResult = { outcome: 'published', offer, dealRoomVersion: nextRoomVersion, ...(activeOfferId ? { supersededOfferId: activeOfferId } : {}) };
      await recordNegotiationEvent(tx, {
        eventId: `negotiation:${command.idempotencyKey}:offer-published`,
        dealRoomId: offer.dealRoomId,
        jobId: room.job_id,
        aggregateVersion: nextRoomVersion,
        sequence: nextSequence,
        type: 'negotiation.offer.published',
        actor: offer.senderRole,
        payload: {
          commandId: command.commandId,
          offerId: offer.offerId,
          offerVersion: offer.offerVersion,
          fingerprint: structuredOfferFingerprint(offer),
          clampReasons: clamped.reasons,
          ...(activeOfferId ? { supersededOfferId: activeOfferId } : {}),
        },
        offer,
        occurredAt: command.nowUnix,
      });
      await recordCommand(tx, { commandId: command.commandId, idempotencyKey: command.idempotencyKey, kind: 'publish_offer', result, nowUnix: command.nowUnix });
        return result;
      });
    } catch (error) {
      if (error instanceof CommandIdempotencyConflict) {
        try {
          await this.conflictRecorder?.recordConflict({
            idempotencyKey: command.idempotencyKey,
            commandId: command.commandId,
            kind: 'publish_offer',
            createdAt: command.nowUnix,
          });
        } catch {
          // Conflict telemetry must never replace the original safety error.
        }
      }
      throw error;
    }
  }

  async accept(command: AcceptanceCommand & { idempotencyKey: string; nowUnix: number }): Promise<AcceptanceDecision> {
    try {
      return await this.transaction(async (tx) => {
        const replayed = await priorCommand<AcceptanceDecision>(tx, command.idempotencyKey);
        if (replayed) {
          if (replayed.kind !== 'accept_offer') {
            throw new CommandIdempotencyConflict(command.idempotencyKey);
          }
          return replayed.result;
        }
      const roomResult = await tx.query<RoomRow>(
        'SELECT id, job_id, state, version, last_sequence, active_offer_id, data FROM deal_rooms WHERE id = $1 FOR UPDATE',
        [command.dealRoomId],
      );
      const room = roomResult.rows[0];
      if (!room) return this.recordAcceptance(tx, command, { outcome: 'invalid', reason: 'WRONG_DEAL_ROOM' });
      const activeOfferId = room.active_offer_id ?? '';
      const activeResult = await tx.query<RuntimeRow>('SELECT * FROM offers WHERE id = $1 FOR UPDATE', [activeOfferId]);
      const active = activeResult.rows[0];
      const buyerMandateVersion = safeInt(room.data.buyerMandateVersion as number | string, 'buyer mandate version');
      const sellerMandateVersion = safeInt(room.data.sellerMandateVersion as number | string, 'seller mandate version');
      const snapshot: AcceptanceSnapshot = {
        dealRoomId: room.id,
        dealRoomVersion: safeInt(room.version, 'deal room version'),
        activeOfferId,
        activeOfferVersion: active ? safeInt(active.offer_version, 'offer version') : 0,
        buyerMandateVersion,
        sellerMandateVersion,
      };
      const decision = validateExactAcceptance(command, snapshot);
      if (decision.outcome === 'accepted') {
        if (!active) return this.recordAcceptance(tx, command, { outcome: 'stale', reason: 'STALE_OFFER', current: snapshot });
        await tx.query("UPDATE offers SET state = 'accepted', updated_at = $2, version = version + 1 WHERE id = $1 AND state = 'proposed'", [active.id, command.nowUnix]);
        const nextRoomVersion = snapshot.dealRoomVersion + 1;
        const nextSequence = safeInt(room.last_sequence, 'deal room sequence') + 1;
        const updatedRoom = await tx.query(
          'UPDATE deal_rooms SET version = $2, last_sequence = $3, updated_at = $4 WHERE id = $1 AND version = $5 RETURNING id',
          [room.id, nextRoomVersion, nextSequence, command.nowUnix, snapshot.dealRoomVersion],
        );
        if (updatedRoom.rows.length !== 1) throw new Error('STALE_DEAL_ROOM');
        await recordNegotiationEvent(tx, {
          eventId: `negotiation:${command.idempotencyKey}:offer-accepted`,
          dealRoomId: room.id,
          jobId: room.job_id,
          aggregateVersion: nextRoomVersion,
          sequence: nextSequence,
          type: 'negotiation.offer.accepted',
          actor: 'platform',
          payload: {
            commandId: command.commandId,
            offerId: active.id,
            offerVersion: snapshot.activeOfferVersion,
            buyerMandateVersion: snapshot.buyerMandateVersion,
            sellerMandateVersion: snapshot.sellerMandateVersion,
          },
          offer: parseStructured(active),
          occurredAt: command.nowUnix,
        });
      }
      return this.recordAcceptance(tx, command, decision);
      });
    } catch (error) {
      if (error instanceof CommandIdempotencyConflict) {
        try {
          await this.conflictRecorder?.recordConflict({
            idempotencyKey: command.idempotencyKey,
            commandId: command.commandId,
            kind: 'accept_offer',
            createdAt: command.nowUnix,
          });
        } catch {
          // Conflict telemetry must never replace the original safety error.
        }
      }
      throw error;
    }
  }

  private async recordAcceptance(tx: SqlExecutor, command: AcceptanceCommand & { idempotencyKey: string; nowUnix: number }, decision: AcceptanceDecision): Promise<AcceptanceDecision> {
    await recordCommand(tx, { commandId: command.commandId, idempotencyKey: command.idempotencyKey, kind: 'accept_offer', result: decision, nowUnix: command.nowUnix });
    return decision;
  }
}
