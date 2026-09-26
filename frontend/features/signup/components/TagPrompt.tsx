'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/core/api';
import { useUserProfile } from '@/shared/hooks/useUserProfile';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { isPublicEditorialRoute } from '@/shared/utils/routes';
import { localTagIssue, normalizeTag, type TagIssue } from '../tag';

/// Accounts made before tags pick one, once, the next time they are signed in.
/// Every account then has a tag other people can find and trust.
export function TagPrompt() {
  const t = useTranslations().signup;
  const pathname = usePathname();
  const qc = useQueryClient();
  const { profile, isConnected, fetchState } = useUserProfile();
  const [tag, setTag] = useState('');
  const [state, setState] = useState<'idle' | 'checking' | 'available' | TagIssue>('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile || profile.handle || tag) return;
    const suggestion = normalizeTag(profile.displayName ?? '').replace(/[^a-z0-9_]/g, '').replace(/^[^a-z]+/, '').slice(0, 20);
    if (suggestion.length >= 3) setTag(suggestion);
  }, [profile, tag]);

  useEffect(() => {
    const clean = normalizeTag(tag);
    const issue = localTagIssue(tag);
    if (!clean) return setState('idle');
    if (issue) return setState(issue);
    setState('checking');
    const id = window.setTimeout(async () => {
      try {
        const r = await api.signupTagCheck(clean);
        if (normalizeTag(tag) === r.tag) setState(r.available ? 'available' : (r.reason ?? 'taken'));
      } catch {
        setState('idle');
      }
    }, 350);
    return () => window.clearTimeout(id);
  }, [tag]);

  if (!isConnected || fetchState !== 'success' || !profile || profile.handle) return null;
  if (isPublicEditorialRoute(pathname) || pathname?.startsWith('/onboarding')) return null;

  const s = t.signUp;
  const clean = normalizeTag(tag);
  const line =
    state === 'available' ? s.tagAvailable.replace('{tag}', clean)
      : state === 'taken' ? s.tagTaken.replace('{tag}', clean)
        : state === 'too_short' ? s.tagTooShort
          : state === 'too_long' ? s.tagTooLong
            : state === 'invalid' ? s.tagInvalid
              : state === 'reserved' ? s.tagReserved
                : state === 'checking' ? s.tagChecking
                  : s.tagHint;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (state !== 'available') return;
    setBusy(true);
    setError(null);
    try {
      await api.signupClaimTag(clean);
      await qc.invalidateQueries();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      if (code === 'tag_taken') {
        setState('taken');
        setError(t.errors.tagTaken);
      } else if (code === 'tag_already_set') {
        await qc.invalidateQueries();
      } else setError(t.errors.generic);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[rgba(14,14,14,0.55)] sm:items-center sm:p-6">
      <form onSubmit={save} role="dialog" aria-modal="true" aria-labelledby="tag-prompt-title"
        className="w-full max-w-[460px] rounded-t-[20px] border border-[var(--lp-outline-strong)] bg-[var(--lp-card)] p-6 shadow-[var(--shadow-pop)] sm:rounded-[16px] sm:p-8">
        <h2 id="tag-prompt-title" className="text-[24px] font-bold tracking-[-0.03em] text-[var(--lp-dark)]">{t.tagPrompt.title}</h2>
        <p className="mt-2 text-[15px] leading-[1.5] text-[var(--lp-text-sub)]">{t.tagPrompt.body}</p>
        <div className="mt-5 flex min-h-[52px] items-center rounded-[12px] border border-[var(--lp-outline-strong)] px-4 focus-within:ring-2 focus-within:ring-[var(--lp-accent)]">
          <span className="text-[17px] font-semibold text-[var(--lp-text-sub)]" aria-hidden>@</span>
          <input aria-label={t.tagPrompt.title} value={tag} onChange={(e) => setTag(e.target.value.replace(/\s/g, ''))}
            autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={21} autoFocus
            className="ms-1 h-[50px] w-full bg-transparent text-[17px] text-[var(--lp-dark)] outline-none" />
        </div>
        <p aria-live="polite" className={`mt-2 text-[14px] ${state === 'available' ? 'text-[var(--lp-dark)]' : state === 'idle' || state === 'checking' ? 'text-[var(--lp-text-sub)]' : 'text-[var(--lp-critical)]'}`}>
          {line}
        </p>
        {error && <p role="alert" className="mt-2 border-s-2 border-[var(--neg)] ps-3 text-[14px] text-[var(--lp-critical)]">{error}</p>}
        <button type="submit" disabled={state !== 'available' || busy}
          className="mt-5 inline-flex min-h-[52px] w-full items-center justify-center rounded-[12px] bg-[var(--lp-accent)] px-5 text-[15px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--lp-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50">
          {busy ? t.tagPrompt.saving : t.tagPrompt.save}
        </button>
      </form>
    </div>
  );
}
