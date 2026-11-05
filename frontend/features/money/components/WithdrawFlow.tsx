'use client';
import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';
import { useAuth } from '@/shared/hooks/useAuth';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { MoneyFrame } from '@/shared/components/MoneyFrame';
import { buttonClasses } from '@/shared/components/Button';
import { ChainLogo } from '@/shared/components/ChainLogo';
import { FactsConfirmSheet } from '@/shared/components/FactsConfirmSheet';
import { fill } from '@/features/deals/workspace/presentation';
import { useBridges } from '@/features/bridge/hooks/useBridge';
import { SOURCE_CHAINS, WITHDRAW_DEST_KEYS, type CctpChainKey } from '@/features/bridge/config';
import { routeSpeed, stepForPhase } from '@/features/bridge/routePlan';
import { TransferProgress } from '@/features/bridge/components/TransferProgress';
import { pressKey } from '../amountEntry';
import { chipAmount, parseAmount } from '../moneySheetModel';
import { useMoneyBalances } from '../hooks/useMoneyBalances';
import { shortAddr, withdrawCheck, withdrawSplit, withdrawTargets, ADDRESS_RE, type WithdrawStage, type WithdrawTarget } from '../withdrawFlow';
import { AmountHero } from './AmountHero';
import { Keypad } from './Keypad';
import { useMoneyText } from '../hooks/useMoneyText';

type DestKey = CctpChainKey | 'arc';

const ROW =
  'flex min-h-16 w-full items-center gap-3 rounded-[16px] border border-[var(--line)] bg-[var(--raised)] px-3.5 text-start transition-colors duration-[var(--dur-press)] hover:border-[var(--line-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]';
const CHIP =
  'inline-flex min-h-9 items-center rounded-full bg-[var(--raised)] px-3.5 text-[14px] font-medium text-[var(--ink)] hover:bg-[var(--line)] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]';
const LABEL = 'block text-[13px] font-medium text-[var(--ink-secondary)]';

function Circle({ children }: { children: React.ReactNode }) {
  return <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--surface)] text-[var(--ink)]">{children}</span>;
}
const TRANSFER = <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h13l-3-3M20 16H7l3 3" /></svg>;
const BANK = <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10 12 4l9 6M5 10v8M19 10v8M9.5 10v8M14.5 10v8M3 20h18" /></svg>;
const CARD = <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18v13H3zM3 10.5h18" /></svg>;

/// Withdraw as a page (view 51, fourth round): where to, then the address and
/// network, then how much, a review, the progress, and a Sent card that stays
/// until Done. The money moves through the same rails as before: Karwan signs
/// for an email account, a wallet account signs in its own wallet.
export function WithdrawFlow({ prefillAmount, prefillAddress, onClose }: { prefillAmount?: number; prefillAddress?: string; onClose: () => void }) {
  const all = useTranslations();
  const w = all.moneyPages.withdraw;
  const pages = all.moneyPages;
  const mp = all.moneyPage;
  const sheetCopy = all.money.sheet;
  const entry = all.money.entry;
  const money = useMoneyText();
  const moves = useTranslations().dealPage.release.moves;
  const router = useRouter();
  const auth = useAuth();
  const { connector } = useAccount();
  const balances = useMoneyBalances();
  const { bridges, startCircleOut, startWeb3Out, startArcSend, startWeb3ArcSend, recheck } = useBridges();
  const keypad = useMediaQuery('(pointer: coarse)');
  const titleId = useId();
  const amountId = useId();
  const sentAt = useRef(0);

  const isCircle = auth.method === 'circle';
  const targets = withdrawTargets(isCircle ? 'email' : 'wallet');
  const agents = (balances.buyer ?? 0) + (balances.seller ?? 0);
  const split = withdrawSplit({ ready: balances.balance, pool: balances.pool, agents });

  const [stage, setStage] = useState<WithdrawStage>(prefillAddress ? 'amount' : 'where');
  const [target, setTarget] = useState<WithdrawTarget | null>(prefillAddress ? 'otherWallet' : null);
  const [address, setAddress] = useState(prefillAddress ?? '');
  const [dest, setDest] = useState<DestKey>(WITHDRAW_DEST_KEYS[0]);
  const [netOpen, setNetOpen] = useState(false);
  const [typed, setTyped] = useState(prefillAmount ? String(prefillAmount) : '');
  const [reviewing, setReviewing] = useState(false);
  const [followFrom, setFollowFrom] = useState<number | null>(null);
  const [sent, setSent] = useState<{ amount: number; address: string; network: string; seconds: number | null } | null>(null);

  const outBridges = bridges.filter((b) => b.direction === 'out');
  const followed = followFrom === null ? null : outBridges.find((b) => b.startedAt >= followFrom) ?? null;
  const sending = outBridges.some((b) => b.phase === 'switching' || b.phase === 'approving' || b.phase === 'burning');
  const destName = dest === 'arc' ? 'Arc' : SOURCE_CHAINS[dest].name;
  const amount = parseAmount(typed);
  const check = withdrawCheck({ address, amount, ready: split.ready });
  // The networks a withdrawal can reach; your own wallet is already on Arc, so it goes elsewhere.
  const destKeys: DestKey[] = target === 'ownWallet' ? [...WITHDRAW_DEST_KEYS] : ['arc', ...WITHDRAW_DEST_KEYS];

  const landed = followed?.phase === 'done';
  useEffect(() => {
    if (!landed || !followed || sent) return;
    balances.refetch();
    setSent({ amount: Number(followed.amountUsdc) || amount || 0, address: address.trim(), network: destName, seconds: Math.max(1, Math.round((Date.now() - followed.startedAt) / 1000)) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landed, followed?.id]);

  function choose(next: WithdrawTarget) {
    if (next === 'karwan') { router.push(typed ? `/send?amount=${encodeURIComponent(typed)}` : '/send'); return; }
    setTarget(next);
    if (next === 'ownWallet' && auth.address) { setAddress(auth.address); setDest(WITHDRAW_DEST_KEYS[0]); }
    else if (address === auth.address) setAddress('');
    setStage('address');
  }

  function back() {
    if (sending) return;
    if (sent || followed) { onClose(); return; }
    if (stage === 'amount') { setStage('address'); return; }
    if (stage === 'address') { setStage('where'); return; }
    onClose();
  }

  function send() {
    if (!check.ok || !auth.address || amount === null) return;
    setReviewing(false);
    sentAt.current = Date.now();
    setFollowFrom(sentAt.current);
    const recipient = address.trim() as `0x${string}`;
    if (dest === 'arc') {
      const args = { amountUsdc: amount, recipient, userAddress: auth.address };
      if (isCircle) startArcSend(args);
      else startWeb3ArcSend(args);
      return;
    }
    const args = { destChainKey: dest, amountUsdc: amount, recipient, userAddress: auth.address };
    if (isCircle) startCircleOut(args);
    else startWeb3Out({ ...args, getEvmProvider: () => connector?.getProvider() ?? Promise.reject(new Error('Wallet provider unavailable')) });
  }

  const heading = sent || followed ? w.title : stage === 'address' ? (target === 'ownWallet' ? w.yourWallet : w.anotherWallet) : stage === 'amount' ? fill(w.toLine, { address: shortAddr(address), network: destName }) : w.title;
  const targetRow = (id: WithdrawTarget) => {
    const words = { ownWallet: [w.yourWallet, auth.address ? shortAddr(auth.address) : ''], otherWallet: [w.anotherWallet, w.anotherNote], karwan: [w.karwan, w.karwanNote] }[id];
    return (
      <button key={id} type="button" data-withdraw-target={id} onClick={() => choose(id)} className={ROW}>
        <Circle>{id === 'karwan' ? <span className="text-[17px] font-semibold">@</span> : TRANSFER}</Circle>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-[var(--ink)]">{words[0]}</span>
          <span dir="auto" className="block truncate text-[13px] font-medium text-[var(--ink-secondary)]">{words[1]}</span>
        </span>
        <span aria-hidden className="text-[20px] text-[var(--ink-muted)] rtl:rotate-180">›</span>
      </button>
    );
  };
  const soonRow = (title: string, icon: React.ReactNode) => (
    <div key={title} aria-disabled className={`${ROW} cursor-not-allowed opacity-50`}>
      <Circle>{icon}</Circle>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-[var(--ink)]">{title}</span>
        <span className="block text-[13px] font-medium text-[var(--ink-secondary)]">{w.soon}</span>
      </span>
    </div>
  );

  return (
    <MoneyFrame page labelledBy={titleId} busy={sending} onClose={back}>
      <div data-withdraw-flow data-stage={sent ? 'sent' : followed ? 'progress' : stage} className="space-y-5">
        {!sent ? <h1 id={titleId} className="text-[26px] font-semibold tracking-[-0.02em] text-[var(--ink)]" dir="auto">{heading}</h1> : null}

        {sent ? (
          <div data-sent-card className="space-y-6 text-center">
            <span aria-hidden className="mx-auto grid size-16 place-items-center rounded-full bg-[var(--raised)] text-[var(--ink)]">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5 10 17.5 19 7" /></svg>
            </span>
            <div className="space-y-1.5">
              <h1 id={titleId} role="status" className="text-[26px] font-semibold tracking-[-0.02em] text-[var(--ink)]" dir="auto">{money.fill(w.sentTitle, { amount: sent.amount }, {}, { exact: true })}</h1>
              <p className="text-[15px] text-[var(--ink-secondary)]" dir="auto">{fill(w.sentLine, { address: shortAddr(sent.address), network: sent.network })}</p>
            </div>
            <dl className="divide-y divide-[var(--line)] rounded-[16px] bg-[var(--raised)] px-4 text-start">
              {([[mp.toLabel, shortAddr(sent.address)], [mp.networkLabel, sent.network], ...(sent.seconds ? [[w.took, fill(pages.added.seconds, { n: sent.seconds })]] : [])] as [string, string][]).map(([k, v]) => (
                <div key={k} className="flex min-h-12 items-center justify-between gap-3 text-[14px]">
                  <dt className="text-[var(--ink-secondary)]">{k}</dt>
                  <dd dir="auto" className="font-semibold text-[var(--ink)]">{v}</dd>
                </div>
              ))}
            </dl>
            <Link href="/activity" className="inline-flex min-h-11 items-center text-[15px] font-semibold text-[var(--ink)] hover:underline">{pages.added.allActivity}</Link>
            <div className="grid gap-2.5">
              <button type="button" data-sent-done onClick={onClose} className={buttonClasses({ size: 'lg', className: 'w-full' })}>{pages.added.done}</button>
              <button type="button" onClick={() => { setSent(null); setFollowFrom(null); setTyped(''); setStage('where'); }} className={buttonClasses({ variant: 'secondary', size: 'lg', className: 'w-full' })}>{w.another}</button>
            </div>
          </div>
        ) : followed ? (
          <TransferProgress
            direction="out"
            chainName={destName}
            signer={isCircle ? 'account' : 'wallet'}
            step={stepForPhase(followed.phase)}
            leftSource={!!followed.burnTxHash}
            startedAt={followed.startedAt}
            speed={routeSpeed(dest === 'arc' ? 'arc' : 'cctpOut')}
            onCheckAgain={() => void recheck(followed.id)}
            onTryAgain={() => setFollowFrom(null)}
            onAnother={() => { setFollowFrom(null); setStage('where'); }}
            onDone={onClose}
          />
        ) : stage === 'where' ? (
          <div className="space-y-5">
            <div className="space-y-2">
              <span className={LABEL}>{w.sendTo}</span>
              {targets.map(targetRow)}
            </div>
            <div className="space-y-2">
              <span className={LABEL}>{w.comingSoon}</span>
              {soonRow(w.bank, BANK)}
              {soonRow(w.card, CARD)}
            </div>
          </div>
        ) : stage === 'address' ? (
          <div className="space-y-5">
            {target === 'otherWallet' ? (
              <label className="block space-y-2">
                <span className={LABEL}>{w.address}</span>
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  dir="ltr"
                  spellCheck={false}
                  autoComplete="off"
                  placeholder="0x"
                  className="form-input block w-full font-mono text-[15px]"
                />
                {address.trim() && !ADDRESS_RE.test(address.trim()) ? <span role="alert" className="block text-[14px] text-[var(--color-critical)]">{w.badAddress}</span> : null}
              </label>
            ) : null}
            <div className="relative space-y-2">
              <span className={LABEL}>{w.network}</span>
              <button
                type="button"
                aria-expanded={netOpen}
                onClick={() => setNetOpen((v) => !v)}
                className="flex min-h-16 w-full items-center gap-3 rounded-[16px] border-[1.5px] border-[var(--ink)] bg-[var(--raised)] px-3.5 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]"
              >
                <ChainLogo chain={dest} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold text-[var(--ink)]">{destName}</span>
                  <span className="block text-[13px] font-medium text-[var(--ink-secondary)]">{dest === 'arc' ? all.moneyMove.pool.inSeconds : all.moneyMove.add.arrivesTwenty}</span>
                </span>
                <span className="inline-flex min-h-9 items-center rounded-full bg-[var(--surface)] px-3 text-[13px] font-semibold text-[var(--ink)]">{all.moneyMove.add.change}</span>
              </button>
              {netOpen ? (
                <ul role="listbox" aria-label={w.network} className="absolute inset-x-0 z-20 mt-1 max-h-[300px] overflow-y-auto rounded-[14px] border border-[var(--line-strong)] bg-[var(--raised)] p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.35)]">
                  {destKeys.map((k) => (
                    <li key={k} role="option" aria-selected={k === dest}>
                      <button type="button" onClick={() => { setDest(k); setNetOpen(false); }} className={`flex min-h-11 w-full items-center gap-2.5 rounded-[10px] px-3 text-start hover:bg-[var(--surface)] ${k === dest ? 'bg-[var(--surface)]' : ''}`}>
                        <ChainLogo chain={k} size={22} />
                        <span className="text-[15px] font-medium text-[var(--ink)]">{k === 'arc' ? 'Arc' : SOURCE_CHAINS[k].name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <button type="button" disabled={!ADDRESS_RE.test(address.trim())} onClick={() => setStage('amount')} className={buttonClasses({ size: 'lg', className: 'w-full' })}>{w.continue}</button>
          </div>
        ) : (
          <div className="space-y-4">
            <AmountHero id={amountId} label={sheetCopy.amountLabel} value={typed} onChange={setTyped} keypad={keypad} />
            <p data-withdraw-ready className="text-center text-[14px] font-medium text-[var(--ink-secondary)]">{money.fill(w.ready, { amount: split.ready })}</p>
            <div className="flex justify-center gap-2">
              {(['quarter', 'half', 'max'] as const).map((chip) => (
                <button key={chip} type="button" className={CHIP} disabled={split.ready <= 0} onClick={() => setTyped(String(chipAmount(split.ready, chip)))}>{sheetCopy[chip]}</button>
              ))}
            </div>
            {keypad ? <Keypad onKey={(key) => setTyped((v) => pressKey(v, key))} label={entry.keypad} backLabel={entry.back} /> : null}
            {!check.ok && check.reason === 'over' ? <p className="text-center text-[14px] font-medium text-[var(--ink)]">{money.fill(sheetCopy.short, { amount: (amount ?? 0) - split.ready }, {}, { exact: true })}</p> : null}
            {split.elsewhere > 0 ? (
              <p data-withdraw-elsewhere className="text-center text-[13px] font-medium text-[var(--ink-secondary)]">
                {money.fill(w.elsewhere, { amount: split.elsewhere })}{' '}
                <Link href="/account?where=1" className="font-semibold text-[var(--ink)] underline underline-offset-4">{w.bringIt}</Link>
              </p>
            ) : null}
            <button type="button" disabled={!check.ok} onClick={() => setReviewing(true)} className={buttonClasses({ size: 'lg', className: 'w-full' })}>
              {amount !== null && amount > 0 ? money.fill(w.review, { amount: amount ?? 0 }, {}, { exact: true }) : sheetCopy.ctaNoAmount}
            </button>
          </div>
        )}
      </div>

      <FactsConfirmSheet
        open={reviewing}
        title={money.fill(mp.reviewTitle, { amount: amount ?? 0 }, {}, { exact: true })}
        note={mp.cannotUndo}
        rows={[
          [moves, money.usdc(amount ?? 0, { exact: true })],
          [mp.toLabel, address.trim()],
          [mp.networkLabel, destName],
        ]}
        primaryLabel={money.fill(mp.withdrawCta, { amount: amount ?? 0 }, {}, { exact: true })}
        busyLabel={money.fill(mp.withdrawing, { amount: amount ?? 0 }, {}, { exact: true })}
        quietLabel={mp.notNow}
        busy={sending}
        onConfirm={send}
        onClose={() => setReviewing(false)}
      />
    </MoneyFrame>
  );
}
