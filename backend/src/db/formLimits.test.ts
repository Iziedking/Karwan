import assert from 'node:assert/strict';
import test from 'node:test';
import { formLimitsOn, formLimitsState, setFormLimits } from './formLimits.js';

/// The switch for the per-IP limits on the survey and the waitlist.
///
///   npx tsx --test src/db/formLimits.test.ts

test('the limits are on until an admin turns them off, and say who changed them', async () => {
  assert.equal(formLimitsOn(), true);
  assert.equal((await formLimitsState()).on, true);

  await setFormLimits(false, 'admin');
  assert.equal(formLimitsOn(), false);
  const off = await formLimitsState();
  assert.equal(off.on, false);
  assert.equal(off.updatedBy, 'admin');
  assert.equal(typeof off.updatedAt, 'number');

  await setFormLimits(true, 'admin');
  assert.equal(formLimitsOn(), true);
});
