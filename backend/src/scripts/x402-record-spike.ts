import { findAgentWalletByAgentAddress } from '../db/agentWallets.js';
import { ensureX402Wallet, gatewayAvailableUsd, paidCreditPassport } from '../x402/buyerClient.js';

/// One paid credit-passport read from a real person's buyer agent against
/// another person, with the Gateway balance before and after. Testnet only.
/// Usage: x402-record-spike <payerBuyerAgentAddress> <subjectAddress>

const [payer, subject] = process.argv.slice(2);
if (!payer || !subject) {
  console.error('usage: x402-record-spike <payerBuyerAgentAddress> <subjectAddress>');
  process.exit(2);
}

const record = await findAgentWalletByAgentAddress(payer);
if (!record) {
  console.error(`no agent wallet behind ${payer}`);
  process.exit(1);
}

const x402 = await ensureX402Wallet(record);
const before = await gatewayAvailableUsd(x402.address).catch((err: Error) => `unreadable: ${err.message}`);
const started = Date.now();
try {
  const signal = await paidCreditPassport(payer, subject, `spike-${started}`);
  console.log(
    JSON.stringify(
      {
        ok: true,
        x402Signer: x402.address,
        gatewayBefore: before,
        gatewayAfter: signal.gatewayBalanceAfter ?? null,
        amountUsd: signal.amountUsd,
        settlement: signal.transaction,
        depositTxHash: signal.depositTxHash ?? null,
        tier: signal.tier,
        score: signal.score,
        ms: Date.now() - started,
      },
      null,
      2,
    ),
  );
  process.exit(0);
} catch (err) {
  console.log(JSON.stringify({ ok: false, x402Signer: x402.address, gatewayBefore: before, error: (err as Error).message, ms: Date.now() - started }, null, 2));
  process.exit(1);
}
