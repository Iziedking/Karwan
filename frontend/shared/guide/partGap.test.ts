import assert from 'node:assert/strict';
import test from 'node:test';
import { widenGap } from './partGap';

/// A line under a part opens a gap in the page instead of covering what is
/// below, and the part gets exactly its own spacing back after (view 57, 19 Nov).

const part = (inline: string, computed: string) => {
  const el = { style: { marginBlockEnd: inline } };
  return { el, computed: () => ({ marginBlockEnd: computed }) };
};

test('the gap opens under a part with no spacing of its own, and closes to nothing', () => {
  const { el, computed } = part('', '0px');
  const restore = widenGap(el, 40, computed);
  assert.equal(el.style.marginBlockEnd, '40px');
  restore();
  assert.equal(el.style.marginBlockEnd, '');
});

test('a part with its own spacing keeps it, plus the gap, and gets it back', () => {
  const { el, computed } = part('12px', '12px');
  const restore = widenGap(el, 40, computed);
  assert.equal(el.style.marginBlockEnd, '52px');
  restore();
  assert.equal(el.style.marginBlockEnd, '12px');
});

test('spacing from a stylesheet counts, and restoring twice does no harm', () => {
  const { el, computed } = part('', '8px');
  const restore = widenGap(el, 30, computed);
  assert.equal(el.style.marginBlockEnd, '38px');
  restore();
  restore();
  assert.equal(el.style.marginBlockEnd, '');
});

test('a line at the top of the page opens its gap above the content and gives it back', () => {
  const el = { style: { marginBlockEnd: '', paddingBlockStart: '4px' } };
  const restore = widenGap(el, 50, () => ({ marginBlockEnd: '0px', paddingBlockStart: '4px' }), 'paddingBlockStart');
  assert.equal(el.style.paddingBlockStart, '54px');
  assert.equal(el.style.marginBlockEnd, '');
  restore();
  assert.equal(el.style.paddingBlockStart, '4px');
});
