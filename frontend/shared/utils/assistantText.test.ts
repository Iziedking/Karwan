import assert from 'node:assert/strict';
import test from 'node:test';
import { tidyAssistantText } from './assistantText';

test('markdown headings become plain bold lines, never raw hashes', () => {
  assert.equal(tidyAssistantText('### 1. Browse the market'), '**1. Browse the market**');
  assert.equal(tidyAssistantText('## Next steps'), '**Next steps**');
});

test('a bare in-app path becomes a link with a readable label', () => {
  assert.equal(tidyAssistantText('Go to /market to see open offers.'), 'Go to [the market](/market) to see open offers.');
  assert.equal(
    tidyAssistantText('Fill in a direct deal at **/buyer?mode=direct** with their tag.'),
    'Fill in a direct deal at [a direct deal](/buyer?mode=direct) with their tag.',
  );
});

test('existing links, numbers and fractions are left alone', () => {
  const linked = 'Open [your activity](/activity) for receipts.';
  assert.equal(tidyAssistantText(linked), linked);
  assert.equal(tidyAssistantText('Paid 50/50 over 2 milestones.'), 'Paid 50/50 over 2 milestones.');
});

test('em and en dashes are rewritten as commas', () => {
  assert.equal(
    tidyAssistantText('That score reflects completed deals—the more you finish, the higher it goes.'),
    'That score reflects completed deals, the more you finish, the higher it goes.',
  );
  assert.equal(tidyAssistantText('Fees – about 1.5%.'), 'Fees, about 1.5%.');
});
