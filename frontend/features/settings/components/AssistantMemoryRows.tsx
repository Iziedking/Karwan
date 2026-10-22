'use client';
import { useEffect, useId, useState } from 'react';
import { api, type AssistantMemoryView } from '@/core/api';
import { ConfirmSheetShell } from '@/shared/components/ConfirmSheetShell';
import { Icon } from '@/shared/components/Icon';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { Row, RowGroup, ToggleRow } from '@/features/profile/ui/ProfileUi';

/// What the assistant remembers about this account (view 20): the switch, and
/// a sheet listing every note with a delete button and "Forget everything".
export function AssistantMemoryRows() {
  const t = useTranslations().assistantMemory;
  const { locale } = useLocale();
  const titleId = useId();
  const [memory, setMemory] = useState<AssistantMemoryView | null>(null);
  const [open, setOpen] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    api.assistantMemory().then((m) => { if (live) setMemory(m); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, []);

  async function run(change: () => Promise<AssistantMemoryView>) {
    setBusy(true);
    setFailed(false);
    try {
      setMemory(await change());
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const date = (at: number) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(at);
  const count = memory?.notes.length ?? 0;

  return (
    <>
      <RowGroup title={t.group}>
        <ToggleRow
          label={t.toggle}
          note={t.toggleNote}
          checked={memory?.enabled ?? true}
          onChange={(on) => { if (memory && !busy) void run(() => api.setAssistantMemory(on)); }}
        />
        <Row label={t.notes} value={memory ? (count ? t.notesCount.replace('{n}', String(count)) : t.none) : ''} onClick={() => setOpen(true)} />
      </RowGroup>
      {failed && !open ? <p role="alert" className="px-1 text-[14px] font-medium text-[var(--color-critical)]">{t.failed}</p> : null}

      <ConfirmSheetShell open={open} labelledBy={titleId} busy={busy} onClose={() => { setOpen(false); setConfirmAll(false); }}>
        <h2 id={titleId} className="text-[20px] font-semibold text-[var(--lp-dark)]">{t.sheetTitle}</h2>
        <p className="mt-1 mb-4 text-[14px] font-medium text-[var(--lp-text-sub)]">{t.sheetBody}</p>
        {count ? (
          <ul className="divide-y divide-[var(--lp-border-light)] overflow-hidden rounded-[18px] border border-[var(--lp-border-light)] bg-[var(--lp-card)]">
            {memory!.notes.map((n) => (
              <li key={n.id} className="flex items-start gap-3 py-3 ps-4 pe-2">
                <span className="min-w-0 flex-1">
                  <span dir="auto" className="block text-[15px] text-[var(--lp-dark)]">{n.text}</span>
                  <span className="block text-[14px] text-[var(--lp-text-sub)]">{date(n.at)}</span>
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(() => api.deleteAssistantMemoryNote(n.id))}
                  aria-label={t.deleteNote.replace('{text}', n.text)}
                  className="grid size-11 shrink-0 place-items-center rounded-full text-[var(--lp-text-sub)] hover:bg-[var(--lp-light)] hover:text-[var(--color-critical)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
                >
                  <Icon name="trash" size={20} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[15px] text-[var(--lp-text-sub)]">{t.none}</p>
        )}
        {failed ? <p role="alert" className="mt-3 text-[14px] font-medium text-[var(--color-critical)]">{t.failed}</p> : null}
        {count ? (
          confirmAll ? (
            <div className="mt-5 grid gap-2">
              <p className="text-[15px] text-[var(--lp-dark)]">{t.forgetAllConfirm}</p>
              <button type="button" disabled={busy} onClick={() => void run(api.forgetAssistantMemory).then(() => setConfirmAll(false))} className="min-h-12 rounded-full bg-[var(--color-critical)] px-5 text-[15px] font-semibold text-white disabled:opacity-50">
                {t.forgetAllYes}
              </button>
              <button type="button" disabled={busy} onClick={() => setConfirmAll(false)} className="min-h-12 rounded-full border border-[var(--lp-border-light)] px-5 text-[15px] font-semibold text-[var(--lp-dark)] hover:bg-[var(--lp-light)] disabled:opacity-50">
                {t.keep}
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmAll(true)} className="mt-5 min-h-12 w-full rounded-full border border-[var(--lp-border-light)] px-5 text-[15px] font-semibold text-[var(--color-critical)] hover:bg-[var(--lp-light)]">
              {t.forgetAll}
            </button>
          )
        ) : null}
      </ConfirmSheetShell>
    </>
  );
}
