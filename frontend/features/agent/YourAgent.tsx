'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type SaidUsdc, type UserProfile } from '@/core/api';
import { rememberReturn } from '@/features/assistant/assistantReturn';
import { waysOf } from '@/features/profile/ways';
import { Row, RowGroup, ToggleRow } from '@/features/profile/ui/ProfileUi';
import { useLiveFeatures } from '@/shared/hooks/useLiveFeatures';
import { PROFILE_SAVED_EVENT } from '@/shared/hooks/useUserProfile';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { yourAgentCopy } from '@/shared/i18n/messages/yourAgent';
import { agentSwitchesCopy } from '@/shared/i18n/messages/agentSwitches';
import { currencySign } from '@/features/money/localAmount';
import type { DisplayCurrency } from '@/features/money/displayCurrency';
import { profilePagesFor } from '@/shared/i18n/messages/profilePages';
import { useMoneyBalances } from '@/features/money/hooks/useMoneyBalances';
import { useMoneyText } from '@/features/money/hooks/useMoneyText';
import { moneyHref } from '@/features/money/moneyRoutes';
import { ResearchRows } from '@/features/profile/components/ResearchRows';
import { fill } from '@/features/deals/workspace/presentation';
import { AgentPanel, type PanelKey } from './agentPanels';
import { LockSheet } from './LockSheet';
import { MANDATE_KEY, aloneRows } from './switches';
import { BeFoundPanel, NEEDS_KEY, ReachPanel, type FindPanelKey } from './findPanels';
import { beFoundOf, meetLine, meetOf, reachableOf } from './findModel';
import { daysOf, mainWay, paidKindOf, sellerUsualGiven } from './yourAgentModel';

const money = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

/// Your agent (docs/architecture/45-your-agent.md): whether it is on, then five
/// plain questions, each changed in a panel on this page.
export function YourAgent({ profile, address, activated, activationLoading, onTurnOn, onSaved }: {
  profile: UserProfile;
  address: string;
  activated: boolean;
  activationLoading: boolean;
  onTurnOn: () => void;
  onSaved: (p: UserProfile) => void;
}) {
  const { locale } = useLocale();
  const t = yourAgentCopy[locale as keyof typeof yourAgentCopy] ?? yourAgentCopy.en;
  const sw = agentSwitchesCopy[locale] ?? agentSwitchesCopy.en;
  const parts = profilePagesFor(locale).agent;
  // Its money (view 83): the total at both agents, kept and moved on Money > Agent.
  const agentMoney = useMoneyBalances();
  const mt = useMoneyText();
  const atAgents = agentMoney.buyer == null && agentMoney.seller == null ? null : (agentMoney.buyer ?? 0) + (agentMoney.seller ?? 0);
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState<PanelKey | null>(null);
  const offers = useQuery({
    queryKey: ['your-agent-offers', address],
    queryFn: () => api.seller(address).then((d) => d.activeBids ?? []),
    enabled: activated && !!profile.seller,
    staleTime: 30_000,
  });

  const ways = waysOf(profile);
  const main = mainWay(ways);
  const kind = paidKindOf(ways);
  const days = daysOf(main);
  const given = sellerUsualGiven(profile);
  const waiting = offers.data?.length ?? 0;
  // The agent switch (view 75). One change at a time; a failure leaves it as it was.
  const features = useLiveFeatures();
  const agentOn = profile.agentPrefs?.agentOn !== false;
  const [switching, setSwitching] = useState(false);
  const [switchFailed, setSwitchFailed] = useState(false);
  async function setPower(on: boolean) {
    if (switching) return;
    setSwitching(true);
    setSwitchFailed(false);
    try {
      await api.changeMandate({ part: 'power', on }, `page:${crypto.randomUUID()}`);
      saved({ ...profile, agentPrefs: { ...(profile.agentPrefs ?? {}), agentOn: on } });
      void client.invalidateQueries({ queryKey: MANDATE_KEY });
    } catch {
      setSwitchFailed(true);
    } finally {
      setSwitching(false);
    }
  }

  const changeClass = 'inline-flex min-h-11 shrink-0 items-center rounded-full border border-[var(--lp-border-light)] px-4 text-[14px] font-semibold text-[var(--lp-dark)] hover:bg-[var(--lp-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]';
  const change = (key: PanelKey) => (
    <button type="button" onClick={() => setOpen(key)} className={changeClass}>
      {t.change}
    </button>
  );
  // Be found and be reached (view 72).
  const [findOpen, setFindOpen] = useState<FindPanelKey | null>(null);
  const needs = useQuery({ queryKey: NEEDS_KEY, queryFn: () => api.standingNeeds().then((r) => r.needs), staleTime: 30_000 });
  const place = [profile.location?.area, profile.location?.city].filter(Boolean).join(', ') || null;
  const meetText = meetLine(meetOf(profile), t.find);
  const beFoundLine = beFoundOf(profile) ? fill(t.find.onWays, { ways: meetText }) : t.find.off;
  const needCount = needs.data?.length ?? 0;
  const reachLine = !reachableOf(profile) ? t.find.off : needCount === 0 ? t.find.onNoNeeds : needCount === 1 ? t.find.onOneNeed : fill(t.find.onNeeds, { n: needCount });
  const answer = (label: string, value: string, key: PanelKey) => (
    <Row inline label={<span className="block"><span className="block text-[13px] font-medium text-[var(--lp-text-sub)]">{label}</span><span className="block text-[15px] font-semibold text-[var(--lp-dark)]">{value}</span></span>}>
      {change(key)}
    </Row>
  );
  const daysLine = days ? (days.min === days.max ? fill(t.daysOne, { n: days.min }) : fill(t.daysRange, { min: days.min, max: days.max })) : '';

  // What it does alone (view 87): the switches and their limits, as the server holds them.
  const client = useQueryClient();
  const read = useQuery({ queryKey: MANDATE_KEY, queryFn: api.mandate, retry: false, enabled: activated });
  const mandate = read.data?.mandate ?? null;
  const lockIsOpen = read.data?.lockOpen === true && features.autopilotLock === true;
  const [lockOpen, setLockOpen] = useState(false);
  const [resuming, setResuming] = useState(false);
  const rereadMandate = () => void client.invalidateQueries({ queryKey: MANDATE_KEY });
  const amount = (a: SaidUsdc) => (a.said ? `${currencySign(a.said.currency as DisplayCurrency, locale)}${Number(a.said.amount).toLocaleString(locale)}` : mt.text(a.usdc));
  const alone = mandate ? aloneRows(mandate, lockIsOpen, sw.agent, { amount, weeklyLimit: mt.text(mandate.weeklyLimitUsdc), sells: !!profile.seller && !!main }) : null;
  const idle = !agentOn || !!mandate?.stopped;
  async function turnBackOn() {
    if (resuming) return;
    setResuming(true);
    setSwitchFailed(false);
    try {
      await api.changeMandate({ part: 'resume' }, `page:${crypto.randomUUID()}`);
      rereadMandate();
      if (typeof window !== 'undefined') window.dispatchEvent(new Event(PROFILE_SAVED_EVENT));
    } catch {
      setSwitchFailed(true);
    } finally {
      setResuming(false);
    }
  }
  const opened = (opens: 'price' | 'lock' | 'reach') => (opens === 'price' ? setOpen('price') : opens === 'lock' ? setLockOpen(true) : setFindOpen('reach'));

  function saved(next: UserProfile) {
    onSaved(next);
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(PROFILE_SAVED_EVENT));
  }

  return (
    <div data-your-agent className="space-y-7">
      {mandate?.stopped ? (
        <section data-agent-stopped role="status" className="rounded-[20px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] p-5">
          <p className="text-[15px] font-semibold text-[var(--lp-dark)]">{fill(sw.agent.stopped[mandate.stopped.reason], { n: mandate.lock?.perDay ?? 3 })}</p>
          <button type="button" disabled={resuming} onClick={() => void turnBackOn()} className="mt-4 inline-flex min-h-11 items-center rounded-full bg-[var(--lp-accent)] px-5 text-[14px] font-semibold text-[var(--accent-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-dark)] disabled:opacity-40">
            {sw.agent.turnBackOn}
          </button>
        </section>
      ) : null}

      {activationLoading ? null : activated ? (
        <p data-agent-state={agentOn ? 'on' : 'switched-off'} className="flex items-center gap-2 text-[15px] font-semibold text-[var(--lp-dark)]">
          <span aria-hidden className={`size-2.5 rounded-full ${agentOn ? 'bg-[var(--lp-accent)]' : 'bg-[var(--lp-text-sub)]'}`} />
          {agentOn ? t.on : t.power.offState}
          {agentOn && profile.seller && waiting > 0 ? <span className="font-medium text-[var(--lp-text-sub)]">· {waiting === 1 ? t.oneOfferWaiting : fill(t.offersWaiting, { n: waiting })}</span> : null}
        </p>
      ) : (
        <section data-agent-state="off" className="rounded-[20px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] p-5">
          <h2 className="text-[17px] font-semibold text-[var(--lp-dark)]">{t.off}</h2>
          <p className="mt-1 text-[15px] font-medium text-[var(--lp-text-sub)]">{t.offBody}</p>
          <button type="button" onClick={onTurnOn} className="mt-4 inline-flex min-h-11 items-center rounded-full bg-[var(--lp-accent)] px-5 text-[14px] font-semibold text-[var(--accent-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-dark)]">
            {t.turnOn}
          </button>
        </section>
      )}

      {activated && !activationLoading && features.agentSwitch ? (
        <div data-agent-power>
          <RowGroup>
            <ToggleRow label={t.power.label} note={agentOn ? t.power.onNote : t.power.offNote} checked={agentOn && !mandate?.stopped} onChange={(next) => (mandate?.stopped ? void turnBackOn() : void setPower(next))} />
          </RowGroup>
          {switchFailed ? <p role="alert" className="mt-2 text-[14px] font-medium text-[var(--lp-dark)]">{t.failed}</p> : null}
        </div>
      ) : null}

      {profile.seller && !given && main ? (
        <section data-price-notice className="rounded-[20px] border border-[var(--lp-accent)] bg-[var(--offer-surface)] p-5">
          <p className="text-[15px] font-semibold text-[var(--lp-dark)]">{t.priceNotice}</p>
          <button type="button" onClick={() => setOpen('price')} className="mt-3 inline-flex min-h-11 items-center rounded-full bg-[var(--lp-accent)] px-5 text-[14px] font-semibold text-[var(--accent-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-dark)]">
            {t.setPrice}
          </button>
        </section>
      ) : null}

      <RowGroup title={sw.agent.trade}>
        {profile.seller ? (
          <>
            {answer(t.rows.sell, profile.seller.skills.length ? profile.seller.skills.join(', ') : t.notSet, 'sell')}
            {main ? answer(t.rows.price, given ? fill(t.priceLine, { usual: money(main.priceUsual), lowest: money(main.priceMin) }) : t.priceNotGiven, 'price') : null}
            {answer(t.rows.paid, kind ? fill(t.paidLine, { kind: t.kinds[kind], days: daysLine }) : t.otherKind, 'paid')}
          </>
        ) : null}
        {profile.buyer ? answer(t.rows.buy, fill(t.buyLine, { max: money(profile.buyer.maxBudgetUsdc), days: profile.buyer.maxDeadlineDays }), 'buy') : null}
      </RowGroup>

      {alone ? (
        <div data-does-alone className={idle ? 'opacity-50' : undefined}>
          <RowGroup title={sw.title}>
            {alone.on.map((row) =>
              row.opens === 'money' ? (
                <Row key={row.name} label={row.label} value={row.value} href={moneyHref('agent')} />
              ) : row.opens && !idle ? (
                <Row key={row.name} label={row.label} value={row.value} onClick={() => opened(row.opens as 'price' | 'lock' | 'reach')} />
              ) : (
                <Row key={row.name} label={row.label} value={row.value} />
              ),
            )}
            {alone.off.map((row) => (
              <Row key={row.name} label={<span className="text-[var(--ink-secondary)]">{fill(sw.agent.offLine, { label: row.label })}</span>} value={sw.agent.settings} href="/settings?group=agent" />
            ))}
          </RowGroup>
        </div>
      ) : null}

      {activated && !activationLoading ? (
        <div data-its-money className="space-y-7">
          <RowGroup title={parts.itsMoney}>
            <Row label={parts.agentMoney} value={atAgents == null ? undefined : mt.text(atAgents)} href={moneyHref('agent')} />
          </RowGroup>
          <ResearchRows />
        </div>
      ) : null}

      <RowGroup title={parts.reaches}>
        {profile.seller ? (
          <Row inline label={<span className="block"><span className="block text-[13px] font-medium text-[var(--lp-text-sub)]">{t.find.beFound}</span><span className="block text-[15px] font-semibold text-[var(--lp-dark)]">{beFoundLine}</span></span>}>
            <button type="button" onClick={() => setFindOpen('beFound')} className={changeClass}>{t.change}</button>
          </Row>
        ) : null}
        <Row inline label={<span className="block"><span className="block text-[13px] font-medium text-[var(--lp-text-sub)]">{t.find.reach}</span><span className="block text-[15px] font-semibold text-[var(--lp-dark)]">{reachLine}</span></span>}>
          <button type="button" onClick={() => setFindOpen('reach')} className={changeClass}>{t.change}</button>
        </Row>
      </RowGroup>

      <RowGroup>
        {profile.seller ? <Row label={t.moreWays} href="/profile/ways" /> : null}
        <Row label={<span className="block"><span className="block">{t.askAssistant}</span><span className="block text-[14px] font-medium text-[var(--lp-text-sub)]">{t.assistant}</span></span>} onClick={() => { rememberReturn(pathname); router.push('/assistant'); }} />
      </RowGroup>

      {open ? <AgentPanel key={open} open={open} profile={profile} t={t} onClose={() => setOpen(null)} onSaved={saved} /> : null}
      {lockOpen && mandate ? <LockSheet mandate={mandate} copy={sw} onClose={() => setLockOpen(false)} onSaved={rereadMandate} /> : null}
      {findOpen === 'beFound' ? <BeFoundPanel profile={profile} t={t} place={place} onClose={() => setFindOpen(null)} onSaved={saved} /> : null}
      {findOpen === 'reach' ? <ReachPanel profile={profile} t={t} onClose={() => setFindOpen(null)} onSaved={saved} /> : null}
    </div>
  );
}
