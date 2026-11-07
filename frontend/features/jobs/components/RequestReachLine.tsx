'use client';
import { useEffect, useState } from 'react';
import { api, type RequestReach } from '@/core/api';
import { Button } from '@/shared/components/Button';
import { Icon } from '@/shared/components/Icon';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { reachLine, showNobodyYet } from '../requestReachLine';

/// Where the poster's request stands with the sellers who fit (view 41):
/// counts only, read again when the page refreshes and every 20 seconds.
/// After a minute with nobody, the plain line and the link to share.
export function RequestReachLine({ jobId, active, refreshKey }: { jobId: string; active: boolean; refreshKey: string | number }) {
  const t = useTranslations().agentQuestions;
  const [reach, setReach] = useState<RequestReach | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!active) return;
    let gone = false;
    const read = () => {
      api
        .requestReach(jobId)
        .then((r) => {
          if (!gone) setReach(r.reach);
        })
        .catch(() => {});
    };
    read();
    const timer = setInterval(read, 20_000);
    return () => {
      gone = true;
      clearInterval(timer);
    };
  }, [jobId, active, refreshKey]);

  if (!active) return null;
  const line = reachLine(t, reach);
  if (line && reach) {
    // Three counts under a hairline (owner, 7 Nov 2026); the sentence stays for screen readers.
    const stats: Array<[number, string]> = [[reach.fit, t.statFit], [reach.offered, t.statOffered], [reach.asked, t.statAsked]];
    return (
      <div data-reach-stats className="mt-5 border-t border-[var(--line)] pt-4">
        <p className="sr-only">{line}</p>
        <div aria-hidden className="grid grid-cols-3">
          {stats.map(([n, label], i) => (
            <div key={label} className={i ? 'border-s border-[var(--line)] ps-3.5 sm:ps-5' : 'pe-3.5 sm:pe-5'}>
              <p className="text-[18px] font-semibold tabular-nums text-[var(--ink)] sm:text-[20px]">{n}</p>
              <p className="mt-0.5 text-[13px] font-medium leading-snug text-[var(--ink-secondary)]">{label}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (!showNobodyYet(reach)) return null;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/jobs/${jobId}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="mt-5 border-t border-[var(--line)] pt-4">
      <p className="text-[16px] font-semibold text-[var(--ink)]">{t.nobodyTitle}</p>
      <p className="mt-1 text-[14px] font-medium leading-relaxed text-[var(--ink-secondary)]">{t.nobodyBody}</p>
      <Button variant="outline" className="mt-3 rounded-full" onClick={() => void copyLink()}>
        <Icon name={copied ? 'check' : 'copy'} size={16} />
        {copied ? t.copied : t.copyLink}
      </Button>
    </div>
  );
}
