import {
  clampStructuredOffer,
  decideReengagement,
  structuredOfferFingerprint,
  validateExactAcceptance,
  type AcceptanceCommand,
  type AcceptanceDecision,
  type AcceptanceSnapshot,
  type NegotiationMandates,
  type ReengagementInput,
  type ReengagementDecision,
  type StructuredOffer,
  formatUsdcMicro,
} from './structuredOffer.js';
import { parseUsdcMicro } from '../matching/money.js';

export interface NegotiationOfferRecord {
  readonly offer: StructuredOffer;
  readonly state: 'ACTIVE' | 'SUPERSEDED' | 'ACCEPTED';
  readonly fingerprint: string;
  readonly createdAtUnix: number;
}

export interface NegotiationRoomRecord {
  readonly dealRoomId: string;
  readonly dealRoomVersion: number;
  readonly activeOfferId?: string;
  readonly activeOfferVersion?: number;
  readonly buyerMandateVersion: number;
  readonly sellerMandateVersion: number;
  readonly attemptCount: number;
  readonly previousFingerprint?: string;
  readonly doNotReengage: boolean;
  readonly negotiationSpendUsdc: string;
  readonly negotiationSpendCapUsdc?: string;
}

export type PublishOfferResult =
  | { outcome: 'published'; room: NegotiationRoomRecord; offer: NegotiationOfferRecord; supersededOfferId?: string }
  | { outcome: 'duplicate'; room: NegotiationRoomRecord; offer: NegotiationOfferRecord }
  | { outcome: 'stale'; room: NegotiationRoomRecord; reason: 'STALE_DEAL_ROOM' | 'STALE_OFFER' };

export interface NegotiationPublishCommand {
  commandId: string;
  expectedDealRoomVersion: number;
  rawOffer: unknown;
  mandates: NegotiationMandates;
  nowUnix: number;
}

export class InMemoryNegotiationRuntime {
  private readonly rooms = new Map<string, NegotiationRoomRecord>();
  private readonly offers = new Map<string, NegotiationOfferRecord>();
  private readonly results = new Map<string, PublishOfferResult | AcceptanceDecision>();
  private readonly reengagementKeys = new Set<string>();

  seedRoom(input: {
    dealRoomId: string;
    dealRoomVersion?: number;
    mandates: NegotiationMandates;
    doNotReengage?: boolean;
    negotiationSpendUsdc?: string;
    negotiationSpendCapUsdc?: string;
    nowUnix?: number;
  }): NegotiationRoomRecord {
    if (this.rooms.has(input.dealRoomId)) throw new Error('DUPLICATE_DEAL_ROOM');
    const negotiationSpendUsdc = input.negotiationSpendUsdc ?? '0';
    const spendMicros = parseUsdcMicro(negotiationSpendUsdc);
    const capMicros = input.negotiationSpendCapUsdc === undefined
      ? undefined
      : parseUsdcMicro(input.negotiationSpendCapUsdc);
    if (capMicros !== undefined && spendMicros > capMicros) {
      throw new Error('NEGOTIATION_SPEND_EXCEEDS_CAP');
    }
    const room: NegotiationRoomRecord = {
      dealRoomId: input.dealRoomId,
      dealRoomVersion: input.dealRoomVersion ?? 1,
      buyerMandateVersion: input.mandates.buyerMandateVersion,
      sellerMandateVersion: input.mandates.sellerMandateVersion,
      attemptCount: 0,
      doNotReengage: input.doNotReengage ?? false,
      negotiationSpendUsdc: formatUsdcMicro(spendMicros),
      ...(capMicros === undefined ? {} : { negotiationSpendCapUsdc: formatUsdcMicro(capMicros) }),
    };
    this.rooms.set(room.dealRoomId, room);
    return room;
  }

  getRoom(dealRoomId: string): NegotiationRoomRecord {
    const room = this.rooms.get(dealRoomId);
    if (!room) throw new Error('DEAL_ROOM_NOT_FOUND');
    return room;
  }

  publishOffer(command: NegotiationPublishCommand): PublishOfferResult {
    const roomId = (() => {
      const parsed = command.rawOffer as { dealRoomId?: unknown };
      return typeof parsed?.dealRoomId === 'string' ? parsed.dealRoomId : '';
    })();
    const room = this.getRoom(roomId);
    const prior = this.results.get(command.commandId);
    if (prior && 'outcome' in prior && (prior.outcome === 'published' || prior.outcome === 'duplicate' || prior.outcome === 'stale')) {
      return prior as PublishOfferResult;
    }
    if (command.expectedDealRoomVersion !== room.dealRoomVersion) {
      const result: PublishOfferResult = { outcome: 'stale', room, reason: 'STALE_DEAL_ROOM' };
      this.results.set(command.commandId, result);
      return result;
    }
    const clamped = clampStructuredOffer(command.rawOffer, command.mandates);
    const offer = clamped.offer;
    if (offer.offerVersion <= (room.activeOfferVersion ?? 0)) {
      const result: PublishOfferResult = { outcome: 'stale', room, reason: 'STALE_OFFER' };
      this.results.set(command.commandId, result);
      return result;
    }
    const fingerprint = structuredOfferFingerprint(offer);
    // A new version must carry a material terms change. Otherwise a retrying
    // re-engagement would send the same structured offer again under a new ID,
    // which is counterparty spam even though the version is numerically newer.
    const repeatedTerms = [...this.offers.values()].some((record) =>
      record.offer.dealRoomId === room.dealRoomId && record.fingerprint === fingerprint,
    );
    if (repeatedTerms) {
      const result: PublishOfferResult = { outcome: 'stale', room, reason: 'STALE_OFFER' };
      this.results.set(command.commandId, result);
      return result;
    }
    const existing = this.offers.get(offer.offerId);
    if (existing && existing.fingerprint === fingerprint) {
      const result: PublishOfferResult = { outcome: 'duplicate', room, offer: existing };
      this.results.set(command.commandId, result);
      return result;
    }
    const priorOffer = room.activeOfferId ? this.offers.get(room.activeOfferId) : undefined;
    if (priorOffer) this.offers.set(priorOffer.offer.offerId, { ...priorOffer, state: 'SUPERSEDED' });
    const created: NegotiationOfferRecord = { offer, state: 'ACTIVE', fingerprint, createdAtUnix: command.nowUnix };
    this.offers.set(offer.offerId, created);
    const next: NegotiationRoomRecord = {
      ...room,
      dealRoomVersion: room.dealRoomVersion + 1,
      activeOfferId: offer.offerId,
      activeOfferVersion: offer.offerVersion,
      previousFingerprint: room.activeOfferId ? priorOffer?.fingerprint : room.previousFingerprint,
    };
    this.rooms.set(room.dealRoomId, next);
    const result: PublishOfferResult = {
      outcome: 'published', room: next, offer: created, ...(priorOffer ? { supersededOfferId: priorOffer.offer.offerId } : {}),
    };
    this.results.set(command.commandId, result);
    return result;
  }

  accept(command: AcceptanceCommand): AcceptanceDecision {
    const prior = this.results.get(command.commandId);
    if (prior && 'outcome' in prior && (prior.outcome === 'accepted' || prior.outcome === 'stale' || prior.outcome === 'invalid')) {
      return prior as AcceptanceDecision;
    }
    const room = this.getRoom(command.dealRoomId);
    const snapshot: AcceptanceSnapshot = {
      dealRoomId: room.dealRoomId,
      dealRoomVersion: room.dealRoomVersion,
      activeOfferId: room.activeOfferId ?? '',
      activeOfferVersion: room.activeOfferVersion ?? 0,
      buyerMandateVersion: room.buyerMandateVersion,
      sellerMandateVersion: room.sellerMandateVersion,
    };
    const result = validateExactAcceptance(command, snapshot);
    if (result.outcome === 'accepted') {
      const active = this.offers.get(room.activeOfferId ?? '');
      if (active) this.offers.set(active.offer.offerId, { ...active, state: 'ACCEPTED' });
      this.rooms.set(room.dealRoomId, { ...room, dealRoomVersion: room.dealRoomVersion + 1 });
    }
    this.results.set(command.commandId, result);
    return result;
  }

  scheduleReengagement(input: Omit<ReengagementInput, 'attemptCount' | 'previousFingerprint' | 'explicitDoNotReengage'> & {
    dealRoomId: string;
    currentFingerprint: string;
  }): ReengagementDecision {
    const room = this.getRoom(input.dealRoomId);
    const decision = decideReengagement({
      ...input,
      attemptCount: room.attemptCount,
      previousFingerprint: room.previousFingerprint,
      explicitDoNotReengage: room.doNotReengage,
      negotiationSpendUsdc: room.negotiationSpendUsdc,
      negotiationSpendCapUsdc: room.negotiationSpendCapUsdc,
    });
    if (decision.outcome === 'schedule') {
      if (this.reengagementKeys.has(decision.key)) return { outcome: 'suppress', reason: 'NO_MATERIAL_CHANGE' };
      this.reengagementKeys.add(decision.key);
      const nextCost = parseUsdcMicro(input.nextAttemptCostUsdc ?? '0');
      const spendMicros = parseUsdcMicro(room.negotiationSpendUsdc) + nextCost;
      this.rooms.set(room.dealRoomId, {
        ...room,
        attemptCount: room.attemptCount + 1,
        negotiationSpendUsdc: formatUsdcMicro(spendMicros),
      });
    }
    return decision;
  }
}
