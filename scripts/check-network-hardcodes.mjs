#!/usr/bin/env node
// Fails when backend runtime code names an Arc chain id or a network-specific
// contract address outside backend/src/chain/networks.ts. Everything
// chain-specific must come from the active network, or a mainnet deployment
// can quietly read and sign against testnet (see docs/contract-suite-design.md).
//
// Tests and one-off operator scripts are exempt.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = join(import.meta.dirname, '..', 'backend', 'src');
const allowed = new Set(['chain/networks.ts', 'config.ts']);
const needles = [
  '5042002',
  "'eip155:5042",
  '0x9fdF14c5B14173D74C08Af27AebFf39240dC105A',
  '0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C',
  '0x0077777d7EBA4688BDeF3E311b846F25870A19B9',
  '0x0022222ABE238Cc2C7Bb1f21003F0a260052475B',
  '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA',
  '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

const hits = [];
for (const file of walk(root)) {
  const rel = relative(root, file).replaceAll('\\', '/');
  if (allowed.has(rel) || rel.endsWith('.test.ts') || rel.startsWith('scripts/')) continue;
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    for (const n of needles) {
      if (line.toLowerCase().includes(n.toLowerCase())) hits.push(`backend/src/${rel}:${i + 1}: ${n}`);
    }
  });
}

if (hits.length) {
  console.error('Network-specific values outside backend/src/chain/networks.ts:');
  for (const h of hits) console.error('  ' + h);
  process.exit(1);
}
console.log('network hardcodes: none outside chain/networks.ts');
