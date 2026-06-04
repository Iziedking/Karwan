/// Verify every live Karwan contract against Arc Testnet's Etherscan-compatible
/// API. Run from the repo root:
///
///   VERIFY_RUN=1 \
///   VERIFIER_URL=https://testnet.arcscan.app/api/ \
///   ETHERSCAN_API_KEY=any \
///   npx tsx scripts/verify-contracts.ts
///
/// Without VERIFY_RUN=1 the script dry-runs: it prints the exact forge
/// commands it would execute but does not call them. Use that to sanity-check
/// constructor-args extraction before burning explorer rate limits.
///
/// Optional filters:
///   CONTRACTS=KarwanYieldDistributor,KarwanTreasuryV3 ...  // only these
///   CHAIN_ID=5042002 ...                                   // default Arc Testnet
///
/// How it works:
///   1. Each Karwan deploy ran `forge script --broadcast` which writes a
///      broadcast/<Script>/5042002/run-latest.json file. Those files contain
///      every CREATE tx with the raw `input` (creationBytecode + encodedArgs).
///   2. The matching artifact in contracts/out/<Contract>.sol/<Contract>.json
///      has the unmodified `bytecode.object`. Subtracting that from the
///      broadcast tx's `input` gives the exact encoded constructor args blob
///      that forge verify-contract wants on `--constructor-args`.
///   3. We feed every (address, contract path, args) triple to forge
///      verify-contract pointing at Arcscan's Etherscan-compatible verifier.
///
/// The auto-extract avoids hand-writing constructor signatures per contract.
/// A re-deploy of any contract is picked up automatically as long as the
/// matching broadcast file exists and the address matches the live address
/// in REGISTRY below.

import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const CONTRACTS_DIR = join(REPO_ROOT, 'contracts');
const BROADCAST_DIR = join(CONTRACTS_DIR, 'broadcast');
const OUT_DIR = join(CONTRACTS_DIR, 'out');

const CHAIN_ID = process.env.CHAIN_ID ?? '5042002';
const VERIFIER_URL = process.env.VERIFIER_URL ?? 'https://testnet.arcscan.app/api/';
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY ?? 'any';
const VERIFY_RUN = process.env.VERIFY_RUN === '1';
const FILTER = (process.env.CONTRACTS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/// Live contracts on Arc Testnet, mirrored from the karwan_contracts_gen4
/// memory entry. When a contract is redeployed, update the address here and
/// the verifier will pick up the new args from the matching broadcast file.
const REGISTRY: Array<{ name: string; contract: string; path: string; address: string }> = [
  {
    name: 'KarwanJobBoard',
    contract: 'KarwanJobBoard',
    path: 'src/KarwanJobBoard.sol:KarwanJobBoard',
    address: '0x35224C2234263B5506a9F7BfF4bb98e9FceD3FF3',
  },
  {
    name: 'KarwanEscrow',
    contract: 'KarwanEscrow',
    path: 'src/KarwanEscrow.sol:KarwanEscrow',
    address: '0x48797C04EE342067A68f29Fbb19B577077d77301',
  },
  {
    name: 'KarwanReputation',
    contract: 'KarwanReputation',
    path: 'src/KarwanReputation.sol:KarwanReputation',
    address: '0xBBAC748cA8C7a47e39Bd2AEaDbaa4e9f96ae4442',
  },
  {
    name: 'KarwanVault',
    contract: 'KarwanVault',
    path: 'src/KarwanVault.sol:KarwanVault',
    address: '0x2d4506284B2D778365b4B295100EF099F35973c5',
  },
  {
    name: 'KarwanTreasury',
    contract: 'KarwanTreasury',
    path: 'src/KarwanTreasury.sol:KarwanTreasury',
    address: '0xa5516F58Ab4dbF1B4949723715D1310A8FBb6fBA',
  },
  {
    name: 'KarwanTreasuryV3',
    contract: 'KarwanTreasury',
    path: 'src/KarwanTreasury.sol:KarwanTreasury',
    address: '0xc761115fa5781bec09112510bA6151f3950aDD72',
  },
  {
    name: 'KarwanYieldDistributor',
    contract: 'KarwanYieldDistributor',
    path: 'src/KarwanYieldDistributor.sol:KarwanYieldDistributor',
    address: '0x9950b9a41A3e80930e451F2FEdaeb81e80195D03',
  },
  // MockUSYC intentionally omitted. Real Hashnote USYC is now wired on Treasury v3
  // and the live KarwanVault after Circle whitelisted both 2026-06-04.
];

interface BroadcastTx {
  transactionType: string;
  contractName: string | null;
  contractAddress: string | null;
  transaction: { input: string };
}

interface BroadcastFile {
  transactions: BroadcastTx[];
}

interface CreateRecord {
  address: string;
  contractName: string;
  input: string;
  scriptName: string;
}

/// Walk every broadcast/<Script>/<CHAIN_ID>/run-latest.json and index every
/// CREATE tx by lowercase contract address. Multiple scripts may have deployed
/// the same contract type at different addresses; the index keys on address so
/// the right tx is found per registry entry.
function indexBroadcasts(): Map<string, CreateRecord> {
  const index = new Map<string, CreateRecord>();
  if (!existsSync(BROADCAST_DIR)) {
    console.error(`No broadcast dir at ${BROADCAST_DIR}. Run forge scripts first.`);
    process.exit(1);
  }
  for (const scriptDir of readdirSync(BROADCAST_DIR)) {
    const runLatest = join(BROADCAST_DIR, scriptDir, CHAIN_ID, 'run-latest.json');
    if (!existsSync(runLatest)) continue;
    const file = JSON.parse(readFileSync(runLatest, 'utf8')) as BroadcastFile;
    for (const tx of file.transactions) {
      if (tx.transactionType !== 'CREATE') continue;
      if (!tx.contractAddress || !tx.contractName) continue;
      const key = tx.contractAddress.toLowerCase();
      index.set(key, {
        address: tx.contractAddress,
        contractName: tx.contractName,
        input: tx.transaction.input,
        scriptName: scriptDir,
      });
    }
  }
  return index;
}

interface AbiInput {
  type: string;
}
interface Artifact {
  bytecode?: { object?: string };
  abi?: Array<{ type: string; inputs?: AbiInput[] }>;
}

function readArtifact(contract: string): Artifact {
  const artifactPath = join(OUT_DIR, `${contract}.sol`, `${contract}.json`);
  if (!existsSync(artifactPath)) {
    throw new Error(
      `Artifact not found: ${artifactPath}. Run \`forge build\` from contracts/ first.`,
    );
  }
  return JSON.parse(readFileSync(artifactPath, 'utf8')) as Artifact;
}

function constructorInputs(artifact: Artifact): AbiInput[] {
  const ctor = artifact.abi?.find((entry) => entry.type === 'constructor');
  return ctor?.inputs ?? [];
}

/// Length-in-bytes of an ABI-encoded value at the top level. Returns null for
/// dynamic types whose encoded length isn't deterministic without the data.
function staticEncodedLength(type: string): number | null {
  if (type === 'address' || type === 'bool') return 32;
  if (/^u?int(\d+)?$/.test(type)) return 32;
  const bytesMatch = /^bytes(\d+)$/.exec(type);
  if (bytesMatch) return 32;
  return null;
}

/// Two strategies for extracting constructor args from the broadcast tx input:
///   1. Subtract the artifact's creation bytecode from the front. Exact but
///      requires the artifact to match the binary that was actually deployed.
///   2. Slice the trailing N bytes where N is the sum of static lengths
///      declared on the constructor ABI. Works only when every input is a
///      static type, but tolerates artifact-bytecode drift (post-deploy edits,
///      compiler bumps, metadata-hash changes).
function extractConstructorArgs(input: string, artifact: Artifact): string {
  const bc = artifact.bytecode?.object;
  if (bc && bc.startsWith('0x') && input.toLowerCase().startsWith(bc.toLowerCase())) {
    return '0x' + input.slice(bc.length);
  }

  const inputs = constructorInputs(artifact);
  if (inputs.length === 0) return '0x';

  let total = 0;
  for (const arg of inputs) {
    const n = staticEncodedLength(arg.type);
    if (n == null) {
      throw new Error(
        `Constructor input type ${arg.type} is dynamic; cannot recover from end-of-input. ` +
          'Re-broadcast at the original commit, or fetch the creation tx and hand-encode args.',
      );
    }
    total += n;
  }

  const hex = input.startsWith('0x') ? input.slice(2) : input;
  const need = total * 2;
  if (hex.length < need) {
    throw new Error(
      `Broadcast input is shorter (${hex.length / 2} bytes) than the constructor ABI requires ` +
        `(${total} bytes). Wrong artifact or wrong tx.`,
    );
  }
  return '0x' + hex.slice(hex.length - need);
}

function verifyOne(entry: (typeof REGISTRY)[number], creation: CreateRecord, args: string): boolean {
  const cmd = [
    'forge verify-contract',
    `--chain-id ${CHAIN_ID}`,
    `--verifier-url "${VERIFIER_URL}"`,
    `--etherscan-api-key "${ETHERSCAN_API_KEY}"`,
    args === '0x' ? '' : `--constructor-args ${args}`,
    '--watch',
    entry.address,
    entry.path,
  ]
    .filter(Boolean)
    .join(' ');

  console.log(`\n[${entry.name}] ${entry.address}`);
  console.log(`  via ${creation.scriptName}`);
  console.log(`  args: ${args === '0x' ? '(none)' : `${args.slice(0, 14)}... (${(args.length - 2) / 2} bytes)`}`);
  console.log(`  cmd:  ${cmd}`);

  if (!VERIFY_RUN) {
    console.log('  DRY-RUN — set VERIFY_RUN=1 to execute.');
    return true;
  }

  try {
    execSync(cmd, { cwd: CONTRACTS_DIR, stdio: 'inherit' });
    return true;
  } catch (err) {
    console.error(`  FAILED: ${(err as Error).message}`);
    return false;
  }
}

function main(): void {
  console.log(`Verifier:    ${VERIFIER_URL}`);
  console.log(`Chain ID:    ${CHAIN_ID}`);
  console.log(`Mode:        ${VERIFY_RUN ? 'EXECUTE' : 'dry-run'}`);
  if (FILTER.length) console.log(`Filter:      ${FILTER.join(', ')}`);

  const index = indexBroadcasts();
  console.log(`Indexed ${index.size} CREATE tx(s) across broadcast/`);

  const results: Array<{ name: string; ok: boolean; reason?: string }> = [];

  for (const entry of REGISTRY) {
    if (FILTER.length && !FILTER.includes(entry.name)) continue;

    const creation = index.get(entry.address.toLowerCase());
    if (!creation) {
      console.log(`\n[${entry.name}] ${entry.address}`);
      console.log('  SKIPPED: no matching CREATE tx in any broadcast file.');
      console.log('  Re-run the original deploy script (or restore broadcast/) to capture args.');
      results.push({ name: entry.name, ok: false, reason: 'no broadcast match' });
      continue;
    }

    let args: string;
    try {
      const artifact = readArtifact(entry.contract);
      args = extractConstructorArgs(creation.input, artifact);
    } catch (err) {
      console.log(`\n[${entry.name}] ${entry.address}`);
      console.log(`  SKIPPED: ${(err as Error).message}`);
      results.push({ name: entry.name, ok: false, reason: (err as Error).message });
      continue;
    }

    const ok = verifyOne(entry, creation, args);
    results.push({ name: entry.name, ok });
  }

  console.log('\n=== summary ===');
  for (const r of results) {
    console.log(`  ${r.ok ? 'OK ' : 'XX '} ${r.name}${r.reason ? ` (${r.reason})` : ''}`);
  }
  const failed = results.filter((r) => !r.ok).length;
  if (failed > 0) process.exit(1);
}

main();
