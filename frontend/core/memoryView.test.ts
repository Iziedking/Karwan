import assert from 'node:assert/strict';
import test from 'node:test';
import { memoryView } from './api.js';

test('a memory response without notes reads as empty and on, never as a crash', () => {
  assert.deepEqual(memoryView({ items: [] } as never), { enabled: true, notes: [] });
  assert.deepEqual(memoryView(null), { enabled: true, notes: [] });
  assert.deepEqual(memoryView({ enabled: false, notes: [{ id: 'a', text: 'Ships to Kano', at: 1 }, { id: 2 } as never] }), {
    enabled: false,
    notes: [{ id: 'a', text: 'Ships to Kano', at: 1 }],
  });
});
