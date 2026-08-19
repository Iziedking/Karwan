#!/usr/bin/env node
// Regenerate backend/src/chain/abis/historicalEvents.ts from git history.
//
//   node scripts/gen-historical-events.mjs
//
// Why this exists: the all-time scan decodes logs emitted by contracts that
// were retired generations ago, and those contracts' event signatures are not
// in the repo any more. The current ABIs describe the current contract. Decode
// an old log against them and it fails, so the money it moved never reaches the
// total.
//
// Git still has every version of the source. This walks the history of the
// money contracts, collects every event declaration that ever existed, and
// emits the union. A signature that appears in more than one revision is kept
// once; a signature that changed shape (EscrowSettled gained a second argument,
// EscrowRefunded gained priorReleased) is kept as BOTH, because both were
// emitted on chain and both have to decode.
//
// Re-run it after changing any event in the contracts, and commit the result.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'backend', 'src', 'chain', 'abis', 'historicalEvents.ts');

/// The contracts whose logs the lifetime scan decodes. Must stay in step with
/// TRACKED in gen-deploy-ledger.mjs: a contract in the ledger whose sources are
/// not walked here has its retired generations' logs land in `undecodedEvents`,
/// which is visible but still means money missing from a total.
const SOURCES = [
  'contracts/src/KarwanEscrow.sol',
  'contracts/src/KarwanVault.sol',
  'contracts/src/KarwanInvoiceRegistry.sol',
  'contracts/src/KarwanPOFinancing.sol',
  'contracts/src/KarwanTreasury.sol',
  'contracts/src/KarwanYieldDistributor.sol',
  'contracts/src/KarwanJobBoard.sol',
  'contracts/src/KarwanReputation.sol',
  'contracts/src/KarwanBusinessRegistry.sol',
];

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

/// Match a Solidity event declaration including multi-line parameter lists.
/// EscrowFunded has eight parameters and is wrapped across lines in every
/// revision, which is exactly the one a line-oriented grep misses.
const EVENT_RE = /\bevent\s+(\w+)\s*\(([\s\S]*?)\)\s*(?:anonymous\s*)?;/g;

/// Strip comments from the whole source before looking for declarations.
///
/// Doing this only inside the parameter list was not enough: one revision has a
/// comment containing the words "event signature (and ...", and the regex
/// happily matched from that `event` through to the next closing paren,
/// producing `event signature(and event DealTiming(...)`. parseAbi rejected it
/// and the whole module failed to load.
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}

/// Enum names declared anywhere in the walked sources, across all revisions.
///
/// Solidity lets an event take an enum, and the source then reads
/// `Outcome outcome`. There is no such ABI type: an enum is encoded as uint8,
/// and `CompletionRecorded(bytes32,address,address,uint8,uint256)` is what
/// keccak actually hashes into topic0. Copying the source text through gives a
/// signature abitype rejects outright, which took the whole generated module
/// down on import, and would have produced the wrong topic even if it parsed.
const ENUM_TYPES = new Set();

function collectEnums(src) {
  for (const m of src.matchAll(/\benum\s+(\w+)\s*\{/g)) ENUM_TYPES.add(m[1]);
}

/// Normalise a parameter list to the canonical human-readable ABI form viem
/// parses: one space between tokens, and `indexed` preserved. Dropping
/// `indexed` would leave a decoder that reads topics as data and returns
/// plausible nonsense.
function normaliseParams(raw) {
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  return cleaned
    .split(',')
    .map((p) => {
      const parts = p.trim().replace(/\s+/g, ' ').split(' ');
      // An enum in position zero is the parameter's type. Arrays of enums keep
      // their suffix, so Outcome[2] becomes uint8[2].
      const base = parts[0]?.replace(/\[.*$/, '');
      if (base && ENUM_TYPES.has(base)) {
        parts[0] = parts[0].replace(base, 'uint8');
      }
      return parts.join(' ');
    })
    .filter(Boolean)
    .join(', ');
}

/// The topic0 identity of an event: its name and its parameter TYPES, with
/// names and `indexed` dropped. This is what keccak actually hashes.
///
/// Deduping on the human-readable form is not enough. `Slashed` was declared
/// once as (jobId, seller, beneficiary, amount) and later as (id, owner,
/// beneficiary, amount): different parameter names, identical types, so the
/// same topic0. Emitting both would leave two ABI entries competing to decode
/// the same log, and `decodeEventLog` would pick between them arbitrarily.
/// One entry per topic, and since git log walks newest-first, the one kept is
/// the most recent naming.
function topicIdentity(name, params) {
  const types = params
    .split(',')
    .map((p) => p.trim().split(/\s+/)[0])
    .filter(Boolean)
    .join(',');
  return `${name}(${types})`;
}

const signatures = new Map(); // human-readable signature -> first revision seen
const byTopic = new Map(); // topic identity -> the signature already kept for it

// Seed the enum names from every current source before walking any history.
// An enum declared in one contract can appear in another's event, and a
// revision is scanned for events the moment it is read, so waiting to learn the
// name from the file that declares it would be a race the ordering decides.
for (const path of SOURCES) {
  try {
    collectEnums(stripComments(readFileSync(join(ROOT, path), 'utf8')));
  } catch {
    // A source that no longer exists still has history worth walking.
  }
}

for (const path of SOURCES) {
  let revs;
  try {
    revs = git(['log', '--format=%H', '--all', '--', path]).split('\n').filter(Boolean);
  } catch {
    console.warn(`no history for ${path}, skipping`);
    continue;
  }
  for (const sha of revs) {
    let src;
    try {
      src = git(['show', `${sha}:${path}`]);
    } catch {
      continue; // the file did not exist at that revision
    }
    const clean = stripComments(src);
    // Revisions can declare an enum that later revisions dropped. Learn it
    // before this revision's events are read, not after.
    collectEnums(clean);
    for (const m of clean.matchAll(EVENT_RE)) {
      const name = m[1];
      const params = normaliseParams(m[2]);
      // A declaration whose parameters still contain a paren or a brace is not
      // a declaration: it is a false match. Refuse it rather than emit a
      // signature parseAbi will reject at import time.
      if (/[(){}]/.test(params)) {
        console.warn(`skipping malformed match: event ${name}(${params})`);
        continue;
      }
      const sig = `event ${name}(${params})`;
      if (signatures.has(sig)) continue;

      const topic = topicIdentity(name, params);
      const kept = byTopic.get(topic);
      if (kept) {
        // Same event, renamed parameters. The kept one is newer.
        if (kept !== sig) console.warn(`same topic as "${kept}", skipping: ${sig}`);
        continue;
      }
      byTopic.set(topic, sig);
      signatures.set(sig, sha.slice(0, 7));
    }
  }
}

const rows = [...signatures.entries()].sort(([a], [b]) => a.localeCompare(b));
if (rows.length === 0) {
  console.error('no event declarations found in history; refusing to write an empty ABI');
  process.exit(1);
}

const body = rows.map(([sig]) => `  '${sig}',`).join('\n');

writeFileSync(
  OUT,
  `// GENERATED by scripts/gen-historical-events.mjs from git history. Do not edit.
//
// Every event signature the Karwan escrow and vault contracts have EVER
// declared, across all revisions, unioned. Several appear in more than one
// shape because the shape changed between generations and both versions are on
// chain, emitted by contracts that are still deployed.
//
// One entry per topic0. Where a declaration only renamed its parameters
// (Slashed's jobId/seller became id/owner) the types are identical, so the
// topic is identical and only the NEWEST naming is kept. Anything reading these
// args by name must therefore accept the alternatives: see \`first()\` in
// lifetimeStats.ts.
//
// Used only by the all-time scan, to decode logs from retired contracts whose
// current ABI no longer describes them. Nothing that talks to a live contract
// should read this: use the real ABI for that.

import { parseAbi } from 'viem';

export const HISTORICAL_EVENT_SIGNATURES = [
${body}
] as const;

export const historicalEventsAbi = parseAbi(HISTORICAL_EVENT_SIGNATURES);
`,
  'utf8',
);

console.log(`wrote ${OUT}`);
console.log(`${rows.length} distinct event signatures across ${SOURCES.length} contracts`);
for (const [sig] of rows.filter(([s]) => /Funded|Settled|Refunded|Released|Claimed/.test(s))) {
  console.log(`  ${sig}`);
}
