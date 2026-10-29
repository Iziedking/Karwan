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
  if (line) return <p className="mt-3 text-[14px] font-medium tabular-nums text-[var(--lp-text-sub)]">{line}</p>;
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
    <div className="mt-4 border-t border-[var(--lp-border-light)] pt-4">
      <p className="text-[16px] font-semibold text-[var(--lp-dark)]">{t.nobodyTitle}</p>
      <p className="mt-1 text-[14px] font-medium leading-relaxed text-[var(--lp-text-sub)]">{t.nobodyBody}</p>
      <Button variant="outline" className="mt-3 rounded-full" onClick={() => void copyLink()}>
        <Icon name={copied ? 'check' : 'copy'} size={16} />
        {copied ? t.copied : t.copyLink}
      </Button>
    </div>
  );
}
