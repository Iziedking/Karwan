/// SME demo test-kit. A read-only status board for rehearsing and demoing the
/// trade-finance rail: it prints the live state of the actors, their money, the
/// finance-lane deals, and every PO line and factoring offer, so you can watch
/// each state machine advance as you click through the flow. It writes nothing
/// and moves no money; the real actions happen in the app, this just shows you
/// where everything stands.
///
/// Usage (from backend/):
///   npm run sme:testkit                         board: all open lines + offers + finance deals
///   npm run sme:testkit -- status 0xACTOR 0x..  per-actor: kind, verified, financier, balances
///   npm run sme:testkit -- deal 0xJOBID         one deal: stage, PoD anchored, PO line, offers
///
/// Point it at the two sample businesses from the runbook (supplier + buyer) and
/// the financier to see the whole board update between steps.

import { formatUnits } from 'viem';
import { publicClient } from '../chain/client.js';
import { getProfile } from '../db/profiles.js';
import { getAgentWallets } from '../db/agentWallets.js';
import { readUsdcBalance } from '../chain/contracts.js';
import { financierEligibility, isApprovedFinancier } from '../profile/financier.js';
import { getDeal, listAllDeals } from '../db/deals.js';
import { listAllLines, getPOLineForInvoice } from '../db/poFinancing.js';
import { listOffersForInvoice, listOpenOffers, listAcceptedOffers } from '../db/factoring.js';
import { config } from '../config.js';

const REGISTRY_READ_ABI = [
  {
    type: 'function',
    name: 'isPoDAccepted',
    stateMutability: 'view',
    inputs: [{ name: 'invoiceId', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

function usd(wei: bigint): string {
  return `${Number(formatUnits(wei, 6)).toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC`;
}

function short(a?: string): string {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—';
}

async function isPoDAccepted(invoiceId: string): Promise<boolean | null> {
  if (!config.KARWAN_INVOICE_REGISTRY_ADDR) return null;
  try {
    return (await publicClient.readContract({
      address: config.KARWAN_INVOICE_REGISTRY_ADDR as `0x${string}`,
      abi: REGISTRY_READ_ABI,
      functionName: 'isPoDAccepted',
      args: [invoiceId as `0x${string}`],
    })) as boolean;
  } catch {
    return null;
  }
}

async function printActor(address: string): Promise<void> {
  const addr = address.toLowerCase();
  const profile = await getProfile(addr);
  const wallets = await getAgentWallets(addr);
  console.log(`\n── actor ${addr}`);
  console.log(`   account kind   : ${profile?.accountKind ?? 'person'}`);
  console.log(
    `   business       : ${profile?.business?.status ?? 'none'}${
      profile?.business?.verifiedAt ? ' (verified)' : ''
    }`,
  );

  const finStatus = profile?.financier?.status ?? 'none';
  const approved = isApprovedFinancier(profile);
  let elig = '';
  try {
    const e = await financierEligibility(addr);
    elig = ` | eligible=${e.eligible} tenure=${e.tenureDays}d stake=${e.stakeUsdc} rep=${e.repOk ? 'ok' : 'low'}`;
  } catch {
    elig = ' | eligibility read failed';
  }
  console.log(`   financier      : ${finStatus} (approved=${approved})${elig}`);

  try {
    const idBal = await readUsdcBalance(addr);
    console.log(`   identity wallet: ${short(addr)}  ${usd(idBal)}`);
  } catch {
    console.log(`   identity wallet: ${short(addr)}  balance read failed`);
  }
  if (wallets) {
    for (const [label, a] of [
      ['buyer agent ', wallets.buyerAddress],
      ['seller agent', wallets.sellerAddress],
    ] as const) {
      try {
        const b = await readUsdcBalance(a);
        console.log(`   ${label}   : ${short(a)}  ${usd(b)}`);
      } catch {
        console.log(`   ${label}   : ${short(a)}  balance read failed`);
      }
    }
  } else {
    console.log('   agents         : not activated');
  }
}

function printPOLine(line: Awaited<ReturnType<typeof listAllLines>>[number], pod?: boolean | null): void {
  const next =
    line.state === 'funded'
      ? pod
        ? '→ watcher will releaseToSeller next tick'
        : 'waiting on proof of delivery'
      : line.state === 'released'
        ? '→ watcher will claimRepayment once the deal settles'
        : '';
  console.log(
    `   PO   ${line.state.padEnd(9)} ${line.principalUsdc}→${line.repayUsdc} USDC  ` +
      `financier ${short(line.financier)} seller ${short(line.seller)}  ${next}`,
  );
  const t = line.txHashes;
  const hashes = [
    t.fund && `fund ${short(t.fund)}`,
    t.release && `release ${short(t.release)}`,
    t.repay && `repay ${short(t.repay)}`,
  ].filter(Boolean);
  if (hashes.length) console.log(`        tx: ${hashes.join('  ')}`);
}

function printOffer(offer: Awaited<ReturnType<typeof listOpenOffers>>[number]): void {
  console.log(
    `   FCT  ${offer.status.padEnd(9)} advance ${offer.offeredAdvanceUsdc} expect ${offer.expectedReturnUsdc} USDC  ` +
      `financier ${short(offer.financier)} seller ${short(offer.seller)}`,
  );
}

async function boardCmd(): Promise<void> {
  console.log('=== SME trade-finance board ===');
  console.log(
    `registry=${config.KARWAN_INVOICE_REGISTRY_ADDR ?? 'UNSET'}  po=${config.KARWAN_PO_FINANCING_ADDR ?? 'UNSET'}  relay=${config.cctpRelayWalletId ? 'set' : 'UNSET'}`,
  );

  const deals = await listAllDeals();
  const financeDeals = deals.filter((d) => d.tradeLane === 'finance');
  console.log(`\n-- finance-lane deals (${financeDeals.length}) --`);
  for (const d of financeDeals) {
    const stage = d.settledAt
      ? 'settled'
      : d.cancelledAt
        ? 'cancelled'
        : d.delivered
          ? 'delivered'
          : d.acceptedAt
            ? 'accepted'
            : 'open';
    const pod = await isPoDAccepted(d.jobId);
    console.log(
      `   ${short(d.jobId)}  ${stage.padEnd(9)} ${d.dealAmountUsdc} USDC  buyer ${short(d.buyer)} seller ${short(d.seller)}  PoD=${pod === null ? '?' : pod}`,
    );
  }

  const lines = await listAllLines();
  const openLines = lines.filter((l) => l.state === 'funded' || l.state === 'released');
  console.log(`\n-- PO lines (${lines.length}, ${openLines.length} open) --`);
  for (const l of lines) printPOLine(l, await isPoDAccepted(l.invoiceId));

  const [open, accepted] = await Promise.all([listOpenOffers(), listAcceptedOffers()]);
  console.log(`\n-- factoring offers (${open.length} open, ${accepted.length} accepted) --`);
  for (const o of [...open, ...accepted]) printOffer(o);
  console.log('');
}

async function statusCmd(addresses: string[]): Promise<void> {
  if (addresses.length === 0) {
    console.log('usage: sme:testkit -- status 0xADDR [0xADDR ...]');
    return;
  }
  console.log('=== SME actors ===');
  for (const a of addresses) await printActor(a);
  console.log('');
}

async function dealCmd(jobId: string): Promise<void> {
  const deal = await getDeal(jobId);
  if (!deal) {
    console.log(`no deal ${jobId}`);
    return;
  }
  console.log(`=== deal ${jobId} ===`);
  console.log(`   trade lane : ${deal.tradeLane ?? 'service'}  amount ${deal.dealAmountUsdc} USDC`);
  console.log(`   buyer      : ${deal.buyer}`);
  console.log(`   seller     : ${deal.seller}`);
  console.log(
    `   stage      : accepted=${!!deal.acceptedAt} delivered=${!!deal.delivered} settled=${!!deal.settledAt} cancelled=${!!deal.cancelledAt}`,
  );
  console.log(`   PoD anchored on registry: ${await isPoDAccepted(jobId)}`);

  const line = await getPOLineForInvoice(jobId);
  if (line) printPOLine(line, await isPoDAccepted(jobId));
  else console.log('   PO line    : none');

  const offers = await listOffersForInvoice(jobId);
  if (offers.length) offers.forEach(printOffer);
  else console.log('   factoring  : no offers');
  console.log('');
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case undefined:
    case 'board':
      await boardCmd();
      break;
    case 'status':
      await statusCmd(rest);
      break;
    case 'deal':
      if (!rest[0]) {
        console.log('usage: sme:testkit -- deal 0xJOBID');
        break;
      }
      await dealCmd(rest[0]);
      break;
    default:
      console.log(`unknown command "${cmd}". try: board | status <addr...> | deal <jobId>`);
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
