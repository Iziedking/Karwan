'use client';

import { settlementChain } from '@/core/arcNetwork';
import { networkPresentation } from '@/shared/chain/networkPresentation';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

/** A disclosure in public chrome; an always-visible notice beside funds. */
export function NetworkContext({ disclosure = false }: { disclosure?: boolean }) {
  const t = useTranslations().networkUi;
  const network = networkPresentation(settlementChain);
  const content = (
    <div className="space-y-2 text-[13px] leading-6 text-[var(--lp-text-sub)]">
      <p className="font-semibold text-[var(--lp-dark)]">
        {t.settlementNetwork}: <bdi>Arc</bdi> · {t[network.environment]}
      </p>
      <p className="max-w-[72ch]">{t[network.noticeKey]}</p>
      {disclosure && (
        <>
          <p>{t.chainId}: <bdi>{network.chainId}</bdi></p>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {network.explorerUrl && <a className="inline-flex min-h-[44px] items-center underline underline-offset-4" href={network.explorerUrl} target="_blank" rel="noreferrer">{t.explorer}<span aria-hidden> ↗</span></a>}
            {network.faucetUrl && <a className="inline-flex min-h-[44px] items-center underline underline-offset-4" href={network.faucetUrl} target="_blank" rel="noreferrer">{t.faucet}<span aria-hidden> ↗</span></a>}
          </div>
        </>
      )}
    </div>
  );

  if (disclosure) return (
    <details className="group max-w-lg" data-network-context={network.environment}>
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-3 py-2 text-[13.5px] font-medium text-[var(--lp-dark)] focus-visible:outline-offset-4">
        {t.details}<span aria-hidden className="text-base group-open:rotate-45">+</span>
      </summary>
      <div className="pb-3 pt-1">{content}</div>
    </details>
  );

  return <aside aria-label={t.details} data-network-context={network.environment} className="my-5 border-s-2 border-[var(--lp-border-light)] ps-4">{content}</aside>;
}
