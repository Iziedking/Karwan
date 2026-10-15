import { encodeAbiParameters, parseAbiParameters, type Address, type Hex } from 'viem';
import { KEEP, KEEP_SELECTORS, encodeEnvelope, keepBody, type KeepCall, type KeepSignature } from '../shared/adapterReport.js';
import { agreementAlerts, agreementCandidates, type AgreementView, type Alert, type DisputeView } from './due.js';

/// Four calls at the adapter's 1.5M per call fit the 7M report gas limit.
const MAX_CALLS = 4;
/// CRE allows 15 EVM reads per execution: two per Agreement deal, one per simulation.
const MAX_READS = 15;

export interface RiskConfig {
  chainId: number;
  adapter: Address;
  maxDeals: number;
  /// Family escrows this workflow keeps moving; anything else is ignored.
  families: Address[];
}

/// One open deal from Karwan's index. Karwan only says where to look; every
/// suggested call is checked against the allowed list and simulated on Arc.
export type OpenDeal =
  | { kind: 'agreement'; family: Address; id: Hex }
  | { kind: 'time' | 'job'; family: Address; id: Hex; suggest: { signature: string; args: Hex }[] };

export interface RiskPorts {
  now(): number;
  /// A page of the watch list starting at cursor modulo its length.
  openDeals(limit: number, cursor: number): OpenDeal[];
  agreementDeal(family: Address, dealId: Hex): AgreementView;
  disputeOf(family: Address, dealId: Hex): DisputeView;
  /// eth_call of the keeper call from the adapter's address at the latest block.
  simulate(call: KeepCall): boolean;
  writeReport(report: Hex): { ok: boolean };
  postAlerts(alerts: Alert[]): void;
}

export type RecordLog =
  | { kind: 'record-pending'; family: Address; dealId: Hex; party: number }
  | { kind: 'payout-credited'; family: Address; to: Address; amount: bigint };

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const isKeepSignature = (s: string): s is KeepSignature => Object.prototype.hasOwnProperty.call(KEEP_SELECTORS, s);

function write(ports: RiskPorts, config: RiskConfig, calls: KeepCall[]): boolean {
  const { report } = encodeEnvelope({ kind: KEEP, chainId: config.chainId, adapter: config.adapter, issuedAt: ports.now(), body: keepBody(calls) });
  return ports.writeReport(report).ok;
}

/// On the schedule: trigger the timeouts the terms already allow, and raise
/// alerts for people to act on. It never holds a deal; that is the guardian's.
export function sweep(ports: RiskPorts, config: RiskConfig): { calls: number; alerts: number; written: boolean } {
  const now = ports.now();
  const due: KeepCall[] = [];
  const alerts: Alert[] = [];
  let reads = 0;
  for (const deal of ports.openDeals(config.maxDeals, Math.floor(now / 60)).slice(0, config.maxDeals)) {
    if (!config.families.some((f) => same(f, deal.family))) continue;
    let candidates: KeepCall[];
    if (deal.kind === 'agreement') {
      if (reads + 2 > MAX_READS) break;
      reads += 2;
      const view = ports.agreementDeal(deal.family, deal.id);
      const dispute = ports.disputeOf(deal.family, deal.id);
      candidates = agreementCandidates(deal.family, deal.id, view, dispute, now);
      alerts.push(...agreementAlerts(deal.family, deal.id, view, dispute, now));
    } else {
      candidates = deal.suggest
        .filter((s) => isKeepSignature(s.signature) && /^0x([0-9a-fA-F]{2}){0,64}$/.test(s.args))
        .map((s) => ({ family: deal.family, selector: KEEP_SELECTORS[s.signature as KeepSignature], args: s.args }));
    }
    for (const c of candidates) {
      if (due.length >= MAX_CALLS || reads >= MAX_READS) break;
      reads++;
      if (ports.simulate(c)) due.push(c);
    }
  }
  if (alerts.length > 0) ports.postAlerts(alerts);
  const written = due.length > 0 && write(ports, config, due);
  return { calls: due.length, alerts: alerts.length, written };
}

/// On a family's RecordPending or PayoutCredited log.
export function onRecordLog(ports: RiskPorts, config: RiskConfig, log: RecordLog): 'kept' | 'not-due' | 'alerted' | 'ignored' {
  if (!config.families.some((f) => same(f, log.family))) return 'ignored';
  if (log.kind === 'payout-credited') {
    ports.postAlerts([{ kind: 'owed_balance', family: log.family, to: log.to, amount: log.amount.toString() }]);
    return 'alerted';
  }
  const call: KeepCall = {
    family: log.family,
    selector: KEEP_SELECTORS['retryRecord(bytes32,uint8)'],
    args: encodeAbiParameters(parseAbiParameters('bytes32, uint8'), [log.dealId, log.party]),
  };
  if (!ports.simulate(call)) return 'not-due';
  return write(ports, config, [call]) ? 'kept' : 'not-due';
}
