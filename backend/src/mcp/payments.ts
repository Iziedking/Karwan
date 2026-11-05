import { BatchFacilitatorClient, GatewayEvmScheme } from '@circle-fin/x402-batching/server';
import type { FacilitatorClient } from '@x402/core/server';
import { createPaymentWrapper, x402ResourceServer } from '@x402/mcp';
import { ARC } from '../chain/client.js';
import { RECORD_READ_PRICE_USDC } from '../x402/recordReadGate.js';

/// Paid MCP tools settle through Circle Gateway's batched facilitator on Arc,
/// the same rail as Karwan's record reads, into Karwan's treasury. The wrapper
/// settles only after the tool answers without an error, so a refusal is never
/// charged.

export const FIND_PRICE_USDC = 0.1;
export const CHECK_PRICE_USDC = RECORD_READ_PRICE_USDC;

export type Paid = ReturnType<typeof createPaymentWrapper>;
export interface PaidTools {
  find: Paid;
  check: Paid;
}

type Facilitator = ConstructorParameters<typeof x402ResourceServer>[0];

// Batching 3.0.4 types an optional extension field looser than @x402/core
// 2.30 does; the client itself is what Circle's seller guide passes here.
const gateway = () => [new BatchFacilitatorClient({ url: ARC.gatewayApiBase }) as unknown as FacilitatorClient];

export async function createPaidTools(payTo: string, facilitator: Facilitator = gateway()): Promise<PaidTools> {
  const server = new x402ResourceServer(facilitator);
  server.register('eip155:*', new GatewayEvmScheme());
  await server.initialize();
  const wrapper = async (tool: string, price: number, description: string) =>
    createPaymentWrapper(server, {
      accepts: await server.buildPaymentRequirements({ scheme: 'exact', network: ARC.caip2 as `${string}:${string}`, payTo, price: `$${price}` }),
      resource: { url: `mcp://tool/${tool}`, description, serviceName: 'Karwan' },
    });
  return {
    find: await wrapper('find_counterparty', FIND_PRICE_USDC, 'Karwan sellers who fit a need, matched on their full records'),
    check: await wrapper('check_person', CHECK_PRICE_USDC, 'A Karwan member\'s public record'),
  };
}
