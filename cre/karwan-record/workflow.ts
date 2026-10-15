import { cre, decodeJson, type HTTPPayload, type Runtime } from '@chainlink/cre-sdk';
import { isAddress, zeroAddress, type Address } from 'viem';
import { z } from 'zod';
import { handleWorkRequest, type WorkRequest } from './record.js';
import { createPorts } from './ports.js';

const address = z.string().refine(isAddress, 'must be an address');

export const configSchema = z.object({
  chainId: z.literal(5_042_002),
  chainSelectorName: z.literal('arc-testnet'),
  adapter: address,
  /// The key Karwan's backend signs work-fact requests with.
  backendKey: address,
  githubTokenSecretId: z.string().min(1),
  /// Keys the evidence seal, so public GitHub data cannot be matched to a wallet.
  sealKeySecretId: z.string().min(1),
  gasLimit: z.string().regex(/^[1-9][0-9]*$/),
}).strict().refine((c) => c.adapter !== zeroAddress, 'karwan-record writes through the deployed adapter');

export type Config = z.infer<typeof configSchema>;

export function onWorkRequest(runtime: Runtime<Config>, payload: HTTPPayload): string {
  const request = decodeJson(payload.input) as WorkRequest;
  const result = handleWorkRequest(createPorts(runtime, runtime.config), {
    chainId: runtime.config.chainId,
    adapter: runtime.config.adapter as Address,
  }, request);
  return JSON.stringify(result);
}

export function initWorkflow(config: Config) {
  const http = new cre.capabilities.HTTPCapability();
  return [
    cre.handler(http.trigger({ authorizedKeys: [{ type: 'KEY_TYPE_ECDSA_EVM', publicKey: config.backendKey }] }), onWorkRequest),
  ];
}
