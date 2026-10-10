import { ARC } from '../chain/client.js';
import { paidCreditPassport } from '../x402/buyerClient.js';

/// One paid agent-to-agent read on the active network: the payer agent's
/// x402 EOA pays Karwan's credit-passport endpoint through Circle Gateway.
/// Proves the batched x402 rail on a network before agents rely on it.
///
/// Usage, inside the running backend container (the endpoint is local):
///   node dist/scripts/x402-mainnet-spike.js --network=mainnet <payerAgentAddress> <subjectAddress>

const args = process.argv.slice(2);
const network = args.find((a) => a.startsWith('--network='))?.slice('--network='.length);
const [payer, subject] = args.filter((a) => !a.startsWith('--'));

if (!network || !payer || !subject) {
  console.error('usage: x402-mainnet-spike --network=<testnet|mainnet> <payerAgentAddress> <subjectAddress>');
  process.exit(2);
}
if (network !== ARC.name) {
  console.error(`refusing: asked for ${network} but this process runs on ${ARC.name}`);
  process.exit(2);
}

try {
  const r = await paidCreditPassport(payer, subject);
  console.log(JSON.stringify({
    network: ARC.name,
    paidUsdc: r.amountUsd,
    tier: r.tier,
    gatewayTransaction: r.transaction || null,
    depositTxHash: r.depositTxHash ?? null,
    gatewayBalanceAfter: r.gatewayBalanceAfter ?? null,
  }, null, 2));
  process.exit(0);
} catch (e) {
  console.error(`x402 spike failed on ${ARC.name}: ${(e as Error).message}`);
  process.exit(1);
}
