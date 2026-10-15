import { bytesToHex, cre, getNetwork, logTriggerConfig, type EVMLog, type Runtime } from '@chainlink/cre-sdk';
import { decodeEventLog, isAddress, zeroAddress, type Address, type Hex } from 'viem';
import { z } from 'zod';
import { agreementAbi } from '../shared/suiteAbi.js';
import { onRecordLog, sweep, type RiskConfig } from './risk.js';
import { createPorts } from './ports.js';

const RECORD_PENDING = '0x183e28ff67e52a157f23eb6d61dc73c49777856338f13e43c0cb7504014ea1e3' as Hex;
const PAYOUT_CREDITED = '0xe9452bb2e2b0e6cf560d1269f57cbd45a3a5a39dbe2cbe33db4b08e5febe6906' as Hex;
const address = z.string().refine(isAddress, 'must be an address');

export const configSchema = z.object({
  schedule: z.string().min(1),
  chainId: z.literal(5_042_002),
  chainSelectorName: z.literal('arc-testnet'),
  /// Agreement, Time and Jobs escrows kept moving (log trigger limit: 5).
  families: z.array(address).min(1).max(5),
  adapter: address,
  karwanApi: z.string().regex(/^https:\/\/[^\s/]+[^\s]*$/),
  apiTokenSecretId: z.string().min(1),
  /// CRE caps a report at 10M gas.
  gasLimit: z.string().regex(/^[1-9][0-9]*$/).refine((g) => Number(g) <= 10_000_000, 'at most 10M gas'),
  /// Deals read per run; the sweep also stops at 15 EVM reads.
  maxDeals: z.number().int().min(1).max(3),
}).strict().refine((c) => c.adapter !== zeroAddress, 'karwan-risk writes through the deployed adapter');

export type Config = z.infer<typeof configSchema>;

const riskConfig = (c: Config): RiskConfig => ({
  chainId: c.chainId,
  adapter: c.adapter as Address,
  maxDeals: c.maxDeals,
  families: c.families as Address[],
});

export function onSweep(runtime: Runtime<Config>): string {
  return JSON.stringify(sweep(createPorts(runtime, runtime.config), riskConfig(runtime.config)));
}

export function onFamilyLog(runtime: Runtime<Config>, log: EVMLog): string {
  const topics = log.topics.map((t) => bytesToHex(t)) as [Hex, ...Hex[]];
  const family = bytesToHex(log.address) as Address;
  const ports = createPorts(runtime, runtime.config);
  if (topics[0] === RECORD_PENDING) {
    const d = decodeEventLog({ abi: agreementAbi, eventName: 'RecordPending', topics, data: bytesToHex(log.data) });
    return onRecordLog(ports, riskConfig(runtime.config), { kind: 'record-pending', family, dealId: d.args.dealId, party: d.args.party });
  }
  const p = decodeEventLog({ abi: agreementAbi, eventName: 'PayoutCredited', topics, data: bytesToHex(log.data) });
  return onRecordLog(ports, riskConfig(runtime.config), { kind: 'payout-credited', family, to: p.args.to, amount: p.args.amount });
}

export function initWorkflow(config: Config) {
  const network = getNetwork({ chainFamily: 'evm', chainSelectorName: config.chainSelectorName, isTestnet: true });
  if (!network) throw new Error('CHAIN_NOT_SUPPORTED_BY_SDK');
  const evm = new cre.capabilities.EVMClient(network.chainSelector.selector);
  const cron = new cre.capabilities.CronCapability();
  return [
    cre.handler(cron.trigger({ schedule: config.schedule }), onSweep),
    cre.handler(
      evm.logTrigger(logTriggerConfig({ addresses: config.families as Hex[], topics: [[RECORD_PENDING, PAYOUT_CREDITED]], confidence: 'SAFE' })),
      onFamilyLog,
    ),
  ];
}
