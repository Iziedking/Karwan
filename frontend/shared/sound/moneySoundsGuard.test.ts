import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const source = (file: string) => readFileSync(join(root, file), 'utf8');

/// Money code plays sound through moneySounds only, so dedupe and the hold for
/// a pressed button see every money sound.
const MONEY_CODE = [
  'features/bridge/hooks/useBridge.ts',
  'features/notifications/hooks/useNotifications.ts',
  'features/money/components/MoneySheet.tsx',
  'features/bridge/components/CrossChainFlow.tsx',
];

test('money code plays sound through moneySounds only', () => {
  assert.deepEqual(MONEY_CODE.filter((file) => /\bsfx\./.test(source(file))), []);
});

test('a wallet send drops the coin only once the chain confirms it', () => {
  assert.match(
    source('features/bridge/hooks/useBridge.ts'),
    /moneySounds\.outcome\(outcome\.state === 'success' \? 'success' : 'pending'/,
  );
});
