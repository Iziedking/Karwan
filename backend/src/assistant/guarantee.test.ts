import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildGuaranteeCancelConfirm,
  buildGuaranteeCollectConfirm,
  buildGuaranteePutUpConfirm,
  buildGuaranteeTakeOutConfirm,
  buildLegacyStepConfirm,
} from './guarantee.js';

const ME = '0x00000000000000000000000000000000000000aa';
const NOW = Date.UTC(2026, 9, 28, 12) / 1000;

test('putting up says what it protects, how long coming back takes, and the yield in exact words', () => {
  const c = buildGuaranteePutUpConfirm({ address: ME, amountUsdc: 100, balanceUsdc: 250, waitDays: 7, signer: 'karwan' });
  assert.ok(!('error' in c));
  assert.equal(c.intent, 'guarantee_put_up');
  assert.equal(c.title, 'Deposit to your deal guarantee');
  assert.match(c.summary!, /protects your buyers/);
  assert.deepEqual(c.fields.map((f) => f.label), ['Amount', 'Coming back takes', 'Earns', 'Balance after']);
  assert.equal(c.fields.find((f) => f.label === 'Earns')!.value, 'At the USYC rate, paid by Karwan on testnet');
  assert.deepEqual(c.payload, { address: ME, amountUsdc: '100.00', signer: 'karwan' });
  for (const w of [c.title, c.summary, c.warning, ...c.fields.map((f) => f.value)]) assert.doesNotMatch(String(w ?? ''), /stake|vault|insurance/i);
});

test('putting up more than the balance is refused with the balance', () => {
  const c = buildGuaranteePutUpConfirm({ address: ME, amountUsdc: 300, balanceUsdc: 250, waitDays: 7, signer: 'karwan' });
  assert.match((c as { error: string }).error, /250\.00 USDC/);
});

test('taking out names what deals hold, and warns when it restarts the wait', () => {
  const c = buildGuaranteeTakeOutConfirm({ address: ME, freeUsdc: 60, heldUsdc: 40, comingBackUsdc: 20, waitDays: 7, nowUnix: NOW, signer: 'wallet' });
  assert.ok(!('error' in c));
  assert.equal(c.payload.amountUsdc, '60.00');
  assert.match(c.warning!, /restarts the 7 days for all 80\.00 USDC/);
  assert.equal(c.fields.find((f) => f.label === 'Ready to collect')!.value, '4 Nov');
  const over = buildGuaranteeTakeOutConfirm({ address: ME, amountUsdc: 70, freeUsdc: 60, heldUsdc: 40, comingBackUsdc: 0, waitDays: 7, nowUnix: NOW, signer: 'karwan' });
  assert.match((over as { error: string }).error, /up to 60\.00 USDC.*40\.00 USDC/);
  const none = buildGuaranteeTakeOutConfirm({ address: ME, freeUsdc: 0, heldUsdc: 40, comingBackUsdc: 0, waitDays: 7, nowUnix: NOW, signer: 'karwan' });
  assert.match((none as { error: string }).error, /deals hold all 40\.00 USDC/i);
});

test('cancelling and collecting act on everything coming back', () => {
  const cancel = buildGuaranteeCancelConfirm({ address: ME, comingBackUsdc: 20, signer: 'karwan' });
  assert.ok(!('error' in cancel));
  assert.equal(cancel.payload.amountUsdc, '20.00');
  assert.match((buildGuaranteeCancelConfirm({ address: ME, comingBackUsdc: 0, signer: 'karwan' }) as { error: string }).error, /Nothing is coming back/);
  const early = buildGuaranteeCollectConfirm({ address: ME, comingBackUsdc: 20, readyAt: NOW + 86_400, nowUnix: NOW, signer: 'karwan' });
  assert.match((early as { error: string }).error, /29 Oct/);
  const ready = buildGuaranteeCollectConfirm({ address: ME, comingBackUsdc: 20, readyAt: NOW, nowUnix: NOW, signer: 'karwan' });
  assert.ok(!('error' in ready));
  assert.equal(ready.intent, 'guarantee_collect');
});

test('a legacy step card names the step in plain words and carries the position', () => {
  const c = buildLegacyStepConfirm({ address: ME, kind: 'guarantee', contract: '0x3fe7bddea2b1d5255a0e865222dae00eeefc45da', ref: '4', step: 'claim', amountUsdc: '250', signer: 'karwan' });
  assert.equal(c.intent, 'legacy_step');
  assert.equal(c.title, 'Collect from an older contract');
  assert.deepEqual(c.payload, { address: ME, kind: 'guarantee', contract: '0x3fe7bddea2b1d5255a0e865222dae00eeefc45da', ref: '4', step: 'claim', amountUsdc: '250', signer: 'karwan' });
  assert.equal(buildLegacyStepConfirm({ address: ME, kind: 'deal', contract: '0x1', ref: '0x2', step: 'refund', amountUsdc: '20', signer: 'karwan' }).title, 'Get your money back from an older deal');
});
