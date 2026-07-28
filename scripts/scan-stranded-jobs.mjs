#!/usr/bin/env node
// Find jobs the chain has closed but the backend still treats as open.
//
// The failure this looks for: `acceptBid` succeeds on the JobBoard, the escrow
// funding that should follow does not, and the approval is deliberately not
// recorded so the buyer can "approve again". But acceptBid moved the job out of
// Posted permanently, so every retry reverts JobNotOpen, and the listing sweep
// keeps rediscovering the job and burning an LLM decision plus a doomed
// transaction on it every cycle, indefinitely.
//
// Read-only. It never writes, never sends a transaction, and is safe against
// production.
//
// Usage, on the VPS so it picks up the real .env:
//   docker compose exec -T karwan-api node scripts/scan-stranded-jobs.mjs
//
// Optional env:
//   RPC_URL=..     override the Arc RPC
//   VERBOSE=1      print every job checked, not only the stranded ones

import { createPublicClient, http, formatUnits } from 'viem';

const RPC =
  process.env.RPC_URL ||
  (process.env.ARC_TESTNET_RPC_URLS || '').split(',')[0] ||
  process.env.ARC_TESTNET_RPC_URL ||
  'https://rpc.testnet.arc.network';

const JOB_BOARD = process.env.KARWAN_JOBBOARD_ADDR;
const ESCROW = process.env.KARWAN_ESCROW_ADDR;
const API = process.env.BASE_URL || 'http://127.0.0.1:8787';
const ADMIN_TOKEN = process.env.ADMIN_API_TOKEN;

if (!JOB_BOARD || !ESCROW) {
  console.error('KARWAN_JOBBOARD_ADDR and KARWAN_ESCROW_ADDR must be set. Run this inside the API container.');
  process.exit(1);
}

// None=0, Posted=1, Accepted=2, Cancelled=3, Expired=4
const STATE = ['none', 'posted', 'accepted', 'cancelled', 'expired'];

const jobsAbi = [
  {
    type: 'function',
    name: 'jobs',
    stateMutability: 'view',
    inputs: [{ type: 'bytes32' }],
    outputs: [
      { name: 'buyer', type: 'address' },
      { name: 'budget', type: 'uint256' },
      { name: 'deadline', type: 'uint64' },
      { name: 'termsHash', type: 'string' },
      { name: 'state', type: 'uint8' },
      { name: 'acceptedSeller', type: 'address' },
      { name: 'acceptedPrice', type: 'uint256' },
      { name: 'acceptedDeadline', type: 'uint64' },
    ],
  },
];

// v2 escrow exposes getEscrow, not a public `escrows` mapping. Only the two
// fields this needs are decoded; the rest of the struct is ignored.
const escrowAbi = [
  {
    type: 'function',
    name: 'getEscrow',
    stateMutability: 'view',
    inputs: [{ type: 'bytes32' }],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'buyer', type: 'address' },
          { name: 'seller', type: 'address' },
          { name: 'buyerIdentity', type: 'address' },
          { name: 'sellerIdentity', type: 'address' },
          { name: 'dealAmount', type: 'uint256' },
          { name: 'sellerNet', type: 'uint256' },
          { name: 'feeTotal', type: 'uint256' },
          { name: 'released', type: 'uint256' },
          { name: 'feeReleased', type: 'uint256' },
          { name: 'reservedAmount', type: 'uint256' },
          { name: 'milestonePcts', type: 'uint8[]' },
          { name: 'milestonesReleased', type: 'uint8' },
          { name: 'state', type: 'uint8' },
          { name: 'reservationBps', type: 'uint16' },
          { name: 'wasAccepted', type: 'bool' },
          { name: 'deliveredAt', type: 'uint64' },
          { name: 'claimDeadline', type: 'uint64' },
          { name: 'deliveryDeadline', type: 'uint64' },
          { name: 'reviewWindow', type: 'uint64' },
          { name: 'reclaimGrace', type: 'uint64' },
          { name: 'disputedAt', type: 'uint64' },
          { name: 'extensionCount', type: 'uint8' },
          { name: 'pendingDeadline', type: 'uint64' },
        ],
      },
    ],
  },
];

const client = createPublicClient({ transport: http(RPC) });

async function openJobIds() {
  const headers = ADMIN_TOKEN ? { 'X-Admin-Token': ADMIN_TOKEN } : {};
  const res = await fetch(`${API}/api/jobs`, { headers });
  if (!res.ok) throw new Error(`GET /api/jobs returned ${res.status}`);
  const body = await res.json();
  const list = Array.isArray(body) ? body : (body.jobs ?? body.briefs ?? []);
  return list.map((j) => j.jobId ?? j.id).filter((id) => typeof id === 'string' && id.startsWith('0x'));
}

const ids = await openJobIds();
console.log(`checking ${ids.length} job(s) the backend still lists as open\n`);

const stranded = [];

for (const jobId of ids) {
  let job;
  try {
    job = await client.readContract({ address: JOB_BOARD, abi: jobsAbi, functionName: 'jobs', args: [jobId] });
  } catch (err) {
    console.log(`  ? ${jobId}  could not read: ${err.message}`);
    continue;
  }

  const state = Number(job[4]);
  if (state === 1) {
    if (process.env.VERBOSE) console.log(`  ok ${jobId}  posted`);
    continue;
  }

  // Closed on chain but still in the open pool. Whether money is at stake
  // depends on the escrow, so read it rather than assuming.
  let funded = null;
  try {
    const e = await client.readContract({
      address: ESCROW,
      abi: escrowAbi,
      functionName: 'getEscrow',
      args: [jobId],
    });
    funded = e.dealAmount;
  } catch {
    // An escrow that was never created reads as zeros on some generations and
    // reverts on others. Both mean the same thing here.
    funded = 0n;
  }

  const row = {
    jobId,
    state: STATE[state] ?? String(state),
    acceptedSeller: job[5],
    acceptedPriceUsdc: formatUnits(job[6], 6),
    escrowFundedUsdc: formatUnits(funded ?? 0n, 6),
    moneyAtStake: (funded ?? 0n) > 0n,
  };
  stranded.push(row);

  console.log(
    `  STRANDED ${jobId}\n` +
      `    chain says: ${row.state}, accepted ${row.acceptedPriceUsdc} USDC from ${row.acceptedSeller}\n` +
      `    escrow holds: ${row.escrowFundedUsdc} USDC${row.moneyAtStake ? '  <-- MONEY AT STAKE' : ''}`,
  );
}

console.log(`\n${stranded.length} stranded of ${ids.length} open`);
const withMoney = stranded.filter((s) => s.moneyAtStake);
if (withMoney.length) {
  console.log(`${withMoney.length} of them hold funds and need a decision before anything else.`);
} else if (stranded.length) {
  console.log('None of them hold funds, so the cost is a wasted sweep loop rather than lost USDC.');
}

// Exit 1 when anything is stranded, so this works as a cron gate.
process.exit(stranded.length > 0 ? 1 : 0);
