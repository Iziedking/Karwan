'use client';

import { useState } from 'react';
import { api, type UserSettings } from '@/core/api';
import { ConfirmSheet } from '@/features/deals/workspace/ConfirmSheet';
import { Row, ToggleRow } from '@/features/profile/ui/ProfileUi';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { attestationSettingsCopy, type AttestationSettingsCopy } from '@/shared/i18n/messages/attestationSettings';

/// The result of a removal, worded for none, one or many.
export function removedLine(n: number, copy: AttestationSettingsCopy): string {
  if (n === 0) return copy.removedNone;
  if (n === 1) return copy.removedOne;
  return copy.removed.replace('{n}', String(n));
}

/// Public deal statements: publish from now on (on by default), earlier deals
/// (off by default), and removing every statement already published.
export function PublishDealsRows({ settings, save }: { settings: UserSettings; save: (patch: Partial<UserSettings>) => void }) {
  const { locale } = useLocale();
  const copy = attestationSettingsCopy[locale];
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const { revoked } = await api.removeMyAttestations();
      setResult(removedLine(revoked, copy));
      setOpen(false);
      save({ publishDeals: false });
    } catch {
      setError(copy.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <ToggleRow
        label={copy.publishDeals}
        note={copy.publishDealsNote}
        checked={settings.publishDeals !== false}
        onChange={(v) => save({ publishDeals: v })}
      />
      <ToggleRow
        label={copy.publishHistory}
        note={copy.publishHistoryNote}
        checked={settings.publishHistory === true}
        onChange={(v) => save({ publishHistory: v })}
      />
      <Row label={result ?? copy.removeDeals} onClick={result ? undefined : () => setOpen(true)} />
      <ConfirmSheet
        open={open}
        title={copy.removeTitle}
        consequence={copy.removeConsequence}
        irreversible
        confirmLabel={copy.removeConfirm}
        busy={busy}
        error={error}
        onConfirm={() => {
          if (!busy) void remove();
        }}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
      >
        {null}
      </ConfirmSheet>
    </>
  );
}
