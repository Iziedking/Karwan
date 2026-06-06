#!/usr/bin/env node
/**
 * On-chain check: are KarwanVault + KarwanTreasury entitled for USYC on Arc
 * Testnet?
 *
 * Circle confirmed allowlisting takes 24-48 hours after the email is sent.
 * Run this script to see whether the entitlements contract recognises our
 * vault and treasury without waiting for an email reply.
 *
 * The Hashnote Entitlements contract uses a multi-role pattern — addresses
 * can hold zero or more bytes32-keyed entitlements. We try the well-known
 * signatures in order:
 *   1. hasEntitlement(address, bytes32) — per-role check
 *   2. getEntitlement(address)           — single-bytes32 return
 *   3. hasPermission(address)            — boolean shorthand
 *   4. isEntitled(address)               — older Cedar-style shorthand
 * Whichever responds non-revert is the live shape; the script reports the
 * answer for each target address.
 *
 * Verified Arc Testnet USYC addresses (Circle docs 2026-06-06):
 *   Entitlements: 0xcc205224862c7641930c87679e98999d23c26113
 *   Teller:       0x9fdF14c5B14173D74C08Af27AebFf39240dC105A
 *   USYC token:   0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C
 *
 * Run:
 *   node scripts/check-usyc-entitlement.mjs
 *
 * Env vars (sourced from backend/.env or repo .env):
 *   ARC_TESTNET_RPC_URL       — required
 *   KARWAN_VAULT_ADDR         — required, the Gen 4 KarwanVault address
 *   KARWAN_TREASURY_V3_ADDR   — required, the new Treasury wired to real USYC
 *   USYC_ENTITLEMENTS_ADDR    — optional, defaults to the Arc Testnet address
 */

import { createPublicClient, http, keccak256, toBytes } from 'viem';
import 'dotenv/config';

const ARC_CHAIN_ID = 5042002;
const ENTITLEMENTS_ARC_TESTNET = '0xcc205224862c7641930c87679e98999d23c26113';

const RPC_URL = process.env.ARC_TESTNET_RPC_URL;
const VAULT = process.env.KARWAN_VAULT_ADDR;
const TREASURY = process.env.KARWAN_TREASURY_V3_ADDR;
const ENTITLEMENTS =
  process.env.USYC_ENTITLEMENTS_ADDR || ENTITLEMENTS_ARC_TESTNET;

if (!RPC_URL) {
  console.error('missing ARC_TESTNET_RPC_URL');
  process.exit(1);
}
if (!VAULT || !TREASURY) {
  console.error('missing KARWAN_VAULT_ADDR or KARWAN_TREASURY_V3_ADDR');
  process.exit(1);
}

const arc = {
  id: ARC_CHAIN_ID,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 },
  rpcUrls: { default: { http: [RPC_URL] } },
};

const client = createPublicClient({ chain: arc, transport: http(RPC_URL) });

/// Candidate entitlement-view shapes. The first one that returns without a
/// revert is the active interface. Hashnote evolved this surface over the
/// years and Arc Testnet's deploy could be any one of them.
const PROBES = [
  {
    label: 'hasEntitlement(address, bytes32 TRANSFER_ROLE)',
    abi: [
      {
        type: 'function',
        name: 'hasEntitlement',
        stateMutability: 'view',
        inputs: [
          { name: 'account', type: 'address' },
          { name: 'role', type: 'bytes32' },
        ],
        outputs: [{ type: 'bool' }],
      },
    ],
    fn: 'hasEntitlement',
    /// keccak256("TRANSFER_ROLE") — the canonical Cedar/Hashnote role for
    /// "may hold this token." Other roles (MINTER, BURNER) exist but
    /// holders only need TRANSFER.
    args: (addr) => [addr, keccak256(toBytes('TRANSFER_ROLE'))],
  },
  {
    label: 'hasEntitlement(address, bytes32 USYC_HOLDER)',
    abi: [
      {
        type: 'function',
        name: 'hasEntitlement',
        stateMutability: 'view',
        inputs: [
          { name: 'account', type: 'address' },
          { name: 'role', type: 'bytes32' },
        ],
        outputs: [{ type: 'bool' }],
      },
    ],
    fn: 'hasEntitlement',
    args: (addr) => [addr, keccak256(toBytes('USYC_HOLDER'))],
  },
  {
    label: 'getEntitlements(address) returns bytes32[]',
    abi: [
      {
        type: 'function',
        name: 'getEntitlements',
        stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ type: 'bytes32[]' }],
      },
    ],
    fn: 'getEntitlements',
    args: (addr) => [addr],
  },
  {
    label: 'getPermission(address) returns uint256',
    abi: [
      {
        type: 'function',
        name: 'getPermission',
        stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ type: 'uint256' }],
      },
    ],
    fn: 'getPermission',
    args: (addr) => [addr],
  },
  {
    label: 'isEntitled(address) returns bool',
    abi: [
      {
        type: 'function',
        name: 'isEntitled',
        stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ type: 'bool' }],
      },
    ],
    fn: 'isEntitled',
    args: (addr) => [addr],
  },
  {
    label: 'isPermitted(address) returns bool',
    abi: [
      {
        type: 'function',
        name: 'isPermitted',
        stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ type: 'bool' }],
      },
    ],
    fn: 'isPermitted',
    args: (addr) => [addr],
  },
];

async function probe(target, label) {
  console.log(`\n  ${label}`);
  console.log(`  ${'─'.repeat(56)}`);
  console.log(`  address: ${target}`);

  let anyHit = false;
  for (const p of PROBES) {
    try {
      const result = await client.readContract({
        address: ENTITLEMENTS,
        abi: p.abi,
        functionName: p.fn,
        args: p.args(target),
      });
      anyHit = true;
      const friendly = renderResult(result);
      console.log(`  ✓ ${p.label}`);
      console.log(`    → ${friendly}`);
    } catch (err) {
      // Revert or signature mismatch. Most candidates will fall here.
      // Only log the one-line summary so the output stays scannable.
      const msg = (err && err.shortMessage) || err.message || String(err);
      if (msg.includes('returned no data') || msg.includes('reverted')) {
        // signature not present, silent
      } else {
        // network/RPC error worth surfacing
        console.log(`  ✗ ${p.label} — ${msg.split('\n')[0]}`);
      }
    }
  }
  if (!anyHit) {
    console.log('  ⚠ no entitlement view returned data — the contract may');
    console.log('    use a different surface, or the rpc rejected the calls.');
  }
}

function renderResult(value) {
  if (Array.isArray(value)) {
    if (value.length === 0) return 'no entitlements granted yet';
    return `${value.length} entitlement(s): ${value.join(', ')}`;
  }
  if (typeof value === 'boolean') return value ? 'ENTITLED' : 'NOT entitled';
  if (typeof value === 'bigint') {
    return value === 0n ? 'NOT entitled (0)' : `entitled, bits = ${value.toString(16)}`;
  }
  return String(value);
}

async function run() {
  console.log('USYC Entitlement Check — Arc Testnet');
  console.log('─'.repeat(60));
  console.log(`entitlements contract: ${ENTITLEMENTS}`);
  console.log(`RPC:                   ${RPC_URL}`);

  try {
    const code = await client.getBytecode({ address: ENTITLEMENTS });
    if (!code || code === '0x') {
      console.error('\n✗ entitlements contract not found on this RPC. Wrong chain?');
      process.exit(2);
    }
  } catch (err) {
    console.error('\n✗ failed to reach RPC:', err.message);
    process.exit(2);
  }

  await probe(VAULT, 'KarwanVault (Gen 4)');
  await probe(TREASURY, 'KarwanTreasury V3 (real USYC)');

  console.log('\n─'.repeat(60));
  console.log('Reading list:');
  console.log('  ENTITLED            → Circle has whitelisted; flip live.');
  console.log('  NOT entitled / 0    → still waiting on Circle (24-48h SLA).');
  console.log('  no entitlement view → contract uses a surface we don\'t probe');
  console.log('    here; cross-check on https://arc-testnet.explorer.caldera.xyz');
}

run().catch((err) => {
  console.error('check failed:', err.message || err);
  process.exit(1);
});
