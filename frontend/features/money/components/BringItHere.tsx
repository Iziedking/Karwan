'use client';
import { useState } from 'react';
import type { AgentKey, MoneyMove } from '../moneySheetModel';
import { MoneySheet } from './MoneySheet';

export interface InPlaceMove {
  move: Extract<MoneyMove, 'withdraw' | 'topUp'>;
  agent: AgentKey;
  amount: number;
}

/// A funding step that stays on the page (view 77, B-06): the words open the
/// money card over the page, filled in with what is missing, and a finished
/// move reads the balances again so the page updates under it.
export function BringItHere({ plan, label, onDone }: { plan: InPlaceMove | null; label: string; onDone?: () => void }) {
  const [opened, setOpened] = useState<InPlaceMove | null>(null);
  if (!plan && !opened) return null;
  return (
    <>
      {plan ? (
        <button
          type="button"
          data-bring-it-here
          onClick={() => setOpened(plan)}
          className="font-semibold text-[var(--ink)] underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          {label}
        </button>
      ) : null}
      {opened ? (
        <MoneySheet
          open
          onClose={() => setOpened(null)}
          move={opened.move}
          agent={opened.agent}
          prefillAmount={opened.amount}
          onDone={onDone}
        />
      ) : null}
    </>
  );
}
