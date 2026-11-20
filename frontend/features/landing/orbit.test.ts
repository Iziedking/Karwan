import assert from 'node:assert/strict';
import test from 'node:test';
import { orbitRings } from './orbit';

test('two rings, partners inside and channels outside, each going all the way round with every badge twice', () => {
  const rings = orbitRings('KarwanBot');
  assert.equal(rings.length, 2);
  for (const ring of rings) {
    const step = 360 / ring.slots.length;
    ring.slots.forEach((slot, i) => assert.equal(slot.angle, -180 + step / 2 + i * step));
    const ids = new Set(ring.slots.map((s) => s.item.id));
    assert.equal(ring.slots.length, ids.size * 2);
  }
  assert.deepEqual(rings.map((r) => [...new Set(r.slots.map((s) => s.item.id))]), [
    ['arc', 'circle', 'ignyte', 'paytag'],
    ['telegram', 'whatsapp', 'x', 'linkedin', 'tiktok', 'email'],
  ]);
  assert.ok(rings[0]!.slots.every((s) => s.item.kind === 'partner'));
  assert.ok(rings[1]!.slots.every((s) => s.item.kind === 'channel'));
});

test('only the first copy of a badge takes focus, so a keyboard meets each once', () => {
  for (const ring of orbitRings('KarwanBot')) {
    const half = ring.slots.length / 2;
    ring.slots.forEach((slot, i) => assert.equal(slot.focusable, i < half));
  }
});

test('a channel the agent is not on yet has no link', () => {
  const items = orbitRings('KarwanBot').flatMap((r) => r.slots.map((s) => s.item));
  for (const id of ['whatsapp', 'tiktok']) {
    const item = items.find((i) => i.id === id)!;
    assert.equal(item.href, null);
  }
  assert.equal(items.find((i) => i.id === 'telegram')!.href, 'https://t.me/KarwanBot');
  assert.equal(items.find((i) => i.id === 'email')!.href, 'mailto:admin@karwan.site');
  assert.equal(items.find((i) => i.id === 'x')!.href, 'https://x.com/karwanBuild');
});

test('without the bot handle Telegram waits like the others, never a dead link', () => {
  const telegram = orbitRings('').flatMap((r) => r.slots.map((s) => s.item)).find((i) => i.id === 'telegram')!;
  assert.equal(telegram.href, null);
  assert.equal(orbitRings('@KarwanBot')[1]!.slots.find((s) => s.item.id === 'telegram')!.item.href, 'https://t.me/KarwanBot');
});

test('partners open their own site, channels are Karwan on that channel', () => {
  const items = orbitRings('KarwanBot').flatMap((r) => r.slots.map((s) => s.item));
  assert.deepEqual(items.filter((i) => i.kind === 'partner').map((i) => i.href).filter((h, i, a) => a.indexOf(h) === i), [
    'https://www.arc.network',
    'https://www.circle.com',
    'https://www.ignyte.ae/',
    'https://www.usepaytag.xyz/',
  ]);
});
