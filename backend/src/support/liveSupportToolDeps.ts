import type { SupportToolDeps } from '../assistant/supportTools.js';
import { caseStore } from './cases.js';
import { openOrJoinCase, tellTeam } from './openCase.js';

/// The assistant's support tools on the live case store (view 78).
export const liveSupportToolDeps: SupportToolDeps = {
  open: (address, input) => openOrJoinCase({ address, text: input.text, records: input.records, channel: 'web' }),
  mine: async (address) => {
    const store = caseStore();
    return Promise.all(
      (await store.forPerson(address)).map(async (c) => {
        const seen = await store.messages(c.id, { forPerson: true });
        return { ref: c.ref, kind: c.kind, state: c.state, lastLine: (seen[seen.length - 1]?.text ?? '').slice(0, 200), updatedAt: c.updatedAt };
      }),
    );
  },
  add: async (address, ref, text) => {
    const store = caseStore();
    const c = await store.get(ref);
    if (!c || c.address !== address.toLowerCase()) return false;
    await store.add(c.id, { role: 'person', channel: 'web', text, at: Date.now() });
    void tellTeam(c.ref, text, false);
    return true;
  },
};
