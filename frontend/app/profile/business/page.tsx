'use client';

import Link from 'next/link';
import { useUserProfile } from '@/shared/hooks/useUserProfile';
import { useWorkspaceContext } from '@/shared/hooks/useWorkspaceContext';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { WorkspaceSwitcher } from '@/features/workspaces/components/WorkspaceSwitcher';

const actionIcons = [
  'M4 19v-6a8 8 0 0 1 16 0v6 M7 19v-4 M17 19v-4 M9 19v-6 M15 19v-6',
  'M9 15l6-6 M10 13a4 4 0 0 0 6 0l4-4a4 4 0 0 0-6-6l-2 2 M14 11a4 4 0 0 0-6 0l-4 4a4 4 0 0 0 6 6l2-2',
  'M3 6h18 M5 6v12h14V6 M8 10h8 M8 14h5',
  'M6 3h12v18H6z M9 7h6 M9 11h6 M9 15h3',
];

export default function BusinessProfilePage() {
  const messages = useTranslations();
  const t = messages.businessProfilePage;
  const common = messages.common;
  const { fetchState, isConnected, refresh } = useUserProfile();
  const { activeWorkspace, workspaces, isBusinessWorkspace } = useWorkspaceContext();
  const pending = isConnected && (fetchState === 'loading' || fetchState === 'idle');
  const businessWorkspace = workspaces.find((workspace) => workspace.kind === 'business');
  const showingBusiness = isBusinessWorkspace && activeWorkspace?.kind === 'business';
  const businessName = showingBusiness ? activeWorkspace?.name : businessWorkspace?.name;
  const actions = [
    { title: t.findTitle, body: t.findBody, href: '/partners' },
    { title: t.dealTitle, body: t.dealBody, href: '/market' },
    { title: t.payTitle, body: t.payBody, href: '/buyer' },
    { title: t.recordTitle, body: t.recordBody, href: '/activity' },
  ];

  return (
    <main className="product-surface min-h-full bg-[var(--lp-light)] px-4 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-[1120px]">
        <header className="flex flex-col gap-6 border-b border-[var(--lp-border-light)] pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-[660px]">
            <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--lp-text-sub)]">{t.label}</p>
            <h1 className="mt-3 text-[clamp(2.2rem,5vw,4rem)] font-semibold leading-[1] tracking-[-0.055em] text-[var(--lp-dark)]">{t.title}</h1>
            <p className="mt-4 max-w-[58ch] text-[16px] leading-relaxed text-[var(--lp-text-sub)]">{t.intro}</p>
          </div>
          <WorkspaceSwitcher />
        </header>

        {showingBusiness && activeWorkspace ? (
          <section className="mt-8 rounded-[24px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] p-5 shadow-[0_18px_50px_-38px_rgba(0,0,0,0.42)] sm:p-7">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--lp-text-sub)]">{t.label}</p>
                <h2 className="mt-2 break-words text-[clamp(1.7rem,3vw,2.4rem)] font-semibold leading-tight tracking-[-0.04em] text-[var(--lp-dark)]">{businessName}</h2>
                <p className="mt-2 max-w-[54ch] text-[14px] leading-relaxed text-[var(--lp-text-sub)]">{t.manageBody}</p>
              </div>
              <Link href="/business/verification" className="inline-flex min-h-11 shrink-0 items-center justify-between gap-4 rounded-full bg-[var(--lp-accent)] px-5 py-3 text-[14px] font-bold text-[#10170b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-dark)]">
                {t.manage}<span aria-hidden>→</span>
              </Link>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[var(--lp-border-light)] pt-4 text-[13px] text-[var(--lp-text-sub)]">
              <span>{activeWorkspace.business?.verificationStatus === 'verified' ? t.manage : t.setup}</span>
              <Link href="/profile/edit" className="font-semibold underline underline-offset-4">{t.edit}</Link>
            </div>
          </section>
        ) : businessWorkspace ? (
          <section className="mt-8 rounded-[24px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] p-5 sm:p-7">
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--lp-text-sub)]">{t.label}</p>
            <h2 className="mt-2 break-words text-2xl font-semibold tracking-[-0.035em] text-[var(--lp-dark)]">{businessWorkspace.name}</h2>
            <p className="mt-2 max-w-[54ch] text-[14px] leading-relaxed text-[var(--lp-text-sub)]">{t.notice}</p>
            <p className="mt-4 text-[13px] font-semibold text-[var(--lp-text-sub)]">{t.setup}</p>
          </section>
        ) : null}

        {businessWorkspace ? (
          <section className="mt-8">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--lp-text-sub)]">{t.label}</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-[var(--lp-dark)]">{t.title}</h2>
              </div>
              <Link href="/profile/business/setup" className="hidden min-h-11 items-center text-[13px] font-semibold text-[var(--lp-text-sub)] underline underline-offset-4 sm:inline-flex">{t.edit}</Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {actions.map((action, index) => (
                <Link key={action.title} href={action.href} className="group flex min-h-[150px] flex-col justify-between rounded-[20px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] p-5 transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] sm:p-6">
                  <span aria-hidden className="flex size-10 items-center justify-center rounded-full border border-[var(--lp-border-light)] text-[var(--lp-accent)]">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={actionIcons[index]} /></svg>
                  </span>
                  <span className="mt-6 flex items-end justify-between gap-4">
                    <span><span className="block text-[17px] font-semibold tracking-[-0.02em] text-[var(--lp-dark)]">{action.title}</span><span className="mt-1 block text-[13px] leading-relaxed text-[var(--lp-text-sub)]">{action.body}</span></span>
                    <span aria-hidden className="shrink-0 text-xl text-[var(--lp-text-sub)] transition-transform group-hover:translate-x-1">→</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {pending ? <p role="status" className="mt-8 text-[var(--lp-text-sub)]">{common.loading}</p> : fetchState === 'error' ? (
          <div role="alert" className="mt-8 text-[var(--lp-text-sub)]"><p>{t.loadError}</p><button onClick={refresh} className="mt-2 min-h-11 underline">{t.retry}</button></div>
        ) : !businessWorkspace ? (
          <section className="mt-8 max-w-[680px] rounded-[24px] border border-dashed border-[var(--lp-outline)] bg-[var(--lp-card)] p-6 sm:p-8">
            <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[var(--lp-dark)]">{t.setupTitle}</h2>
            <p className="mt-3 text-[15px] leading-relaxed text-[var(--lp-text-sub)]">{t.setupBody}</p>
            <Link href="/profile/business/setup" className="mt-6 inline-flex min-h-[52px] w-full items-center justify-between gap-3 rounded-full bg-[var(--lp-accent)] px-6 py-3 text-[15px] font-bold text-[#10170b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-dark)] sm:w-auto sm:min-w-[250px]">{t.setup}<span aria-hidden>→</span></Link>
          </section>
        ) : null}
      </div>
    </main>
  );
}
