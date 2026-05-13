import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { logger } from '../logger.js';

const repoRoot = resolve(import.meta.dirname, '..', '..', '..');
const outDir = join(repoRoot, 'backend', 'src', 'chain', 'abis');
mkdirSync(outDir, { recursive: true });

const artifacts: Array<{ name: string; path: string }> = [
  { name: 'jobBoard', path: 'contracts/out/KarwanJobBoard.sol/KarwanJobBoard.json' },
  { name: 'escrow', path: 'contracts/out/KarwanEscrow.sol/KarwanEscrow.json' },
  { name: 'reputation', path: 'contracts/out/KarwanReputation.sol/KarwanReputation.json' },
];

for (const { name, path } of artifacts) {
  const json = JSON.parse(readFileSync(join(repoRoot, path), 'utf8'));
  const ts = `export const ${name}Abi = ${JSON.stringify(json.abi, null, 2)} as const;\n`;
  writeFileSync(join(outDir, `${name}.ts`), ts);
  logger.info({ artifact: name }, 'abi synced');
}
