'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type AgentSwitchName } from '@/core/api';
import { LockSheet } from '@/features/agent/LockSheet';
import { MANDATE_KEY, switchRows, turning } from '@/features/agent/switches';
import { Row, RowGroup, SwitchRow } from '@/features/profile/ui/ProfileUi';
import { useLiveFeatures } from '@/shared/hooks/useLiveFeatures';
import { PROFILE_SAVED_EVENT } from '@/shared/hooks/useUserProfile';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { agentSwitchesCopy } from '@/shared/i18n/messages/agentSwitches';
import { yourAgentCopy } from '@/shared/i18n/messages/yourAgent';

/// Settings, Agent (view 87): the agent switch, then one switch for each thing
/// it does alone. Budgets and rules are on Your agent.
export function SettingsAgent() {
  const { locale } = useLocale();
  const copy = agentSwitchesCopy[locale] ?? agentSwitchesCopy.en;
  const power = (yourAgentCopy[locale as keyof typeof yourAgentCopy] ?? yourAgentCopy.en).power;
  const features = useLiveFeatures();
  const client = useQueryClient();
  const { data } = useQuery({ queryKey: MANDATE_KEY, queryFn: api.mandate, retry: false });
  const [saving, setSaving] = useState<AgentSwitchName | 'power' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lockOpen, setLockOpen] = useState(false);

  const reread = () => {
    void client.invalidateQueries({ queryKey: MANDATE_KEY });
    window.dispatchEvent(new Event(PROFILE_SAVED_EVENT));
  };

  async function send(key: AgentSwitchName | 'power', patch: Record<string, unknown>) {
    if (saving) return;
    setSaving(key);
    setNotice(null);
    try {
      await api.changeMandate(patch, `page:${crypto.randomUUID()}`);
    } catch {
      setNotice(copy.failed);
    } finally {
      setSaving(null);
      // The switch shows what the server holds, whether or not the change took.
      reread();
    }
  }

  const rulesRow = (
    <RowGroup>
      <Row label={copy.rules} value={copy.yourAgent} href="/profile/setup" />
    </RowGroup>
  );
  if (!data?.mandate) return <div data-settings-agent className="space-y-7">{rulesRow}</div>;

  const { mandate } = data;
  const stopped = mandate.stopped !== null;
  function flip(name: AgentSwitchName, on: boolean) {
    const next = turning(mandate, name, on);
    if (next.kind === 'refused') return setNotice(copy.needsAgree);
    if (next.kind === 'lock-sheet') return setLockOpen(true);
    void send(name, next.patch);
  }

  return (
    <div data-settings-agent className="space-y-7">
      {features.agentSwitch ? (
        <RowGroup>
          <SwitchRow label={power.label} checked={mandate.on && !stopped} disabled={stopped || saving !== null} onChange={(on) => void send('power', { part: 'power', on })} />
        </RowGroup>
      ) : null}

      <RowGroup title={copy.title}>
        {switchRows(mandate, data.lockOpen && features.autopilotLock === true).map((row) => (
          <SwitchRow
            key={row.name}
            label={copy.labels[row.name]}
            info={copy.notes[row.name]}
            checked={row.on}
            disabled={row.disabled || saving !== null}
            pill={row.notOpen ? copy.notOpen : undefined}
            onChange={(on) => flip(row.name, on)}
          />
        ))}
      </RowGroup>
      {notice ? <p role="alert" className="px-1 text-[14px] font-medium text-[var(--ink)]">{notice}</p> : null}

      {rulesRow}

      {lockOpen ? <LockSheet mandate={mandate} copy={copy} onClose={() => setLockOpen(false)} onSaved={reread} /> : null}
    </div>
  );
}
