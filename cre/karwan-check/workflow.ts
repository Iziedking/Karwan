import {
  bytesToHex,
  cre,
  decodeJson,
  getNetwork,
  logTriggerConfig,
  type EVMLog,
  type HTTPPayload,
  type Runtime,
} from '@chainlink/cre-sdk';
import { decodeEventLog, isAddress, zeroAddress, type Address, type Hex } from 'viem';
import { z } from 'zod';
import { agreementAbi } from '../shared/suiteAbi.js';
import { collectResults, startDryRun, startReplay, type CheckConfig, type DryRunRequest } from './check.js';
import { createPorts } from './ports.js';

const DELIVERED_TOPIC = '0xd45beba397c83fdda516d54bb097da4de94910b65c27d164acabb48abe741efc' as Hex;
const address = z.string().refine(isAddress, 'must be an address');
// The CRE CLI's WASM validator has rejected valid URLs under z.url (cre/github-delivery).
const httpsUrl = z.string().regex(/^https:\/\/[^\s/]+[^\s]*$/);

export const configSchema = z.object({
  schedule: z.string().min(1),
  chainId: z.literal(5_042_002),
  chainSelectorName: z.literal('arc-testnet'),
  /// Agreement family escrows whose deliveries this workflow watches (log trigger limit: 5).
  families: z.array(address).min(1).max(5),
  verifiers: z.array(address).min(1).max(4),
  /// False while CRE_ENABLED is off: verdicts are compared, never attested.
  attest: z.boolean(),
  adapter: address,
  karwanApi: httpsUrl,
  apiTokenSecretId: z.string().min(1),
  githubTokenSecretId: z.string().min(1),
  runnerRef: z.string().min(1).max(100),
  /// The one replay runner repository this workflow trusts (owner/name).
  runnerRepo: z.string().regex(/^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9_.-]{1,100}$/),
  /// The key Karwan's x402 endpoint signs dry-run requests with.
  gatewayKey: address,
  gasLimit: z.string().regex(/^[1-9][0-9]*$/),
  maxItems: z.number().int().min(1).max(3),
}).strict().refine((c) => !c.attest || c.adapter !== zeroAddress, 'an attesting workflow needs the deployed adapter');

export type Config = z.infer<typeof configSchema>;

const checkConfig = (c: Config): CheckConfig => ({
  chainId: c.chainId,
  verifiers: c.verifiers as Address[],
  attest: c.attest,
  adapter: c.adapter as Address,
  maxItems: c.maxItems,
  runnerRepo: c.runnerRepo,
});

export function onDelivered(runtime: Runtime<Config>, log: EVMLog): string {
  const decoded = decodeEventLog({
    abi: agreementAbi,
    eventName: 'Delivered',
    topics: log.topics.map((t) => bytesToHex(t)) as [Hex, ...Hex[]],
    data: bytesToHex(log.data),
  });
  const outcome = startReplay(createPorts(runtime, runtime.config), checkConfig(runtime.config), {
    family: bytesToHex(log.address) as Address,
    dealId: decoded.args.dealId,
    revision: decoded.args.revision,
    proofHash: decoded.args.proofHash,
    blockHash: bytesToHex(log.blockHash),
  });
  return JSON.stringify({ outcome });
}

export function onCollect(runtime: Runtime<Config>): string {
  return JSON.stringify({ results: collectResults(createPorts(runtime, runtime.config), checkConfig(runtime.config)) });
}

export function onDryRun(runtime: Runtime<Config>, payload: HTTPPayload): string {
  const request = decodeJson(payload.input) as DryRunRequest;
  return JSON.stringify({ outcome: startDryRun(createPorts(runtime, runtime.config), checkConfig(runtime.config), request) });
}

export function initWorkflow(config: Config) {
  const network = getNetwork({ chainFamily: 'evm', chainSelectorName: config.chainSelectorName, isTestnet: true });
  if (!network) throw new Error('CHAIN_NOT_SUPPORTED_BY_SDK');
  const evm = new cre.capabilities.EVMClient(network.chainSelector.selector);
  const cron = new cre.capabilities.CronCapability();
  const http = new cre.capabilities.HTTPCapability();
  return [
    cre.handler(
      evm.logTrigger(logTriggerConfig({ addresses: config.families as Hex[], topics: [[DELIVERED_TOPIC]], confidence: 'SAFE' })),
      onDelivered,
    ),
    cre.handler(cron.trigger({ schedule: config.schedule }), onCollect),
    cre.handler(
      http.trigger({ authorizedKeys: [{ type: 'KEY_TYPE_ECDSA_EVM', publicKey: config.gatewayKey }] }),
      onDryRun,
    ),
  ];
}
