import type { AgentMandate, AgentSwitchName, SaidUsdc } from '@/core/api';
import type { AgentSwitchesCopy } from '@/shared/i18n/messages/agentSwitches';

/// What the agent does alone, as the screens show it (view 87). Pure: the
/// server decides every change; this only says what to draw and what to send.

export const MANDATE_KEY = ['agent-mandate'] as const;

export const SWITCH_ORDER: readonly AgentSwitchName[] = ['offers', 'bargain', 'agree', 'lock', 'find', 'data', 'brief'];

export interface SwitchState {
  name: AgentSwitchName;
  on: boolean;
  disabled: boolean;
  /// Lock money where the network has not opened it.
  notOpen: boolean;
}

/// Each switch as saved. With the agent off or stopped they keep their value
/// and cannot be changed, so turning the agent back on restores them.
export function switchRows(m: AgentMandate, lockOpen: boolean): SwitchState[] {
  const idle = !m.on || m.stopped !== null;
  return SWITCH_ORDER.map((name) => {
    const closed = name === 'lock' && !lockOpen;
    return { name, on: closed ? false : m.switches[name], disabled: idle || closed, notOpen: closed };
  });
}

export type Turning =
  | { kind: 'patch'; patch: { part: 'switch'; name: AgentSwitchName; on: boolean } }
  | { kind: 'lock-sheet' }
  | { kind: 'refused'; why: 'needsAgree' };

/// What flipping one switch does. Lock money is never turned on by the switch
/// alone: its limits are confirmed in the sheet.
export function turning(m: AgentMandate, name: AgentSwitchName, on: boolean): Turning {
  if (name === 'lock' && on) return m.switches.agree ? { kind: 'lock-sheet' } : { kind: 'refused', why: 'needsAgree' };
  return { kind: 'patch', patch: { part: 'switch', name, on } };
}

/// Whether saving these lock limits lets the agent lock more than it may now,
/// which the server confirms with the passkey.
export function lockWidens(m: AgentMandate, next: { perDealUsdc: number; perWeekUsdc: number }): boolean {
  if (!m.switches.lock || !m.lock) return true;
  const micros = (usdc: number) => Math.round(usdc * 1e6);
  return micros(next.perDealUsdc) > micros(m.lock.perDeal.usdc) || micros(next.perWeekUsdc) > micros(m.lock.perWeek.usdc);
}

export type AloneOpens = 'price' | 'lock' | 'reach' | 'money' | null;
export interface AloneRow { name: AgentSwitchName; label: string; value: string; opens: AloneOpens }

const fill = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);

/// Your agent: one row for each switch that is on, with its limit, and the
/// names of the ones that are off.
export function aloneRows(
  m: AgentMandate,
  lockOpen: boolean,
  copy: AgentSwitchesCopy['agent'],
  text: { amount: (a: SaidUsdc) => string; weeklyLimit: string; sells: boolean },
): { on: AloneRow[]; off: Array<{ name: AgentSwitchName; label: string }> } {
  const value: Record<AgentSwitchName, string> = {
    offers: copy.atYourPrice,
    bargain: text.sells ? copy.toYourLowest : copy.insideLimits,
    agree: copy.insideLimits,
    lock: m.lock ? fill(copy.aDeal, { amount: text.amount(m.lock.perDeal) }) : '',
    find: copy.on,
    data: fill(copy.aWeek, { amount: text.weeklyLimit }),
    brief: `${m.brief.hour}:00`,
  };
  const opens: Record<AgentSwitchName, AloneOpens> = {
    offers: text.sells ? 'price' : null,
    bargain: text.sells ? 'price' : null,
    agree: null,
    lock: 'lock',
    find: 'reach',
    data: 'money',
    brief: null,
  };
  const rows = switchRows(m, lockOpen);
  return {
    on: rows.filter((r) => r.on).map((r) => ({ name: r.name, label: copy.rows[r.name], value: value[r.name], opens: opens[r.name] })),
    off: rows.filter((r) => !r.on).map((r) => ({ name: r.name, label: copy.rows[r.name] })),
  };
}
