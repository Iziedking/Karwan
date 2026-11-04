'use client';

import Link from 'next/link';
import { useRef, type ReactNode } from 'react';
import { Icon } from '@/shared/components/Icon';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { landingCopy, type LandingCopy } from '@/shared/i18n/messages/landing';
import { useSceneProgress } from '../useLandingMotion';
import s from '../landing.module.css';

type Panels = LandingCopy['panels'];

/// A diagram on a 600 × 520 board: nodes are placed in percent, lines are an
/// SVG in the same box, and both draw in from the panel's --p.
function Board({ flow, lines, children }: { flow: string; lines: string[]; children: ReactNode }) {
  return (
    <div className={s.board} aria-hidden="true">
      <p className={s.boardFlow}>{flow}</p>
      <svg className={s.boardLines} viewBox="0 0 600 520" preserveAspectRatio="none">
        {lines.map((d, i) => <path key={d} d={d} pathLength={1} style={{ ['--i' as string]: i }} />)}
      </svg>
      {children}
    </div>
  );
}

function Node({ x, y, w, title, line, tone, order }: { x: number; y: number; w: number; title: string; line?: string; tone?: 'green' | 'quiet'; order: number }) {
  return (
    <div className={s.node} data-tone={tone} style={{ left: `${(x / 600) * 100}%`, top: `${(y / 520) * 100}%`, width: `${(w / 600) * 100}%`, ['--i' as string]: order }}>
      <strong>{title}</strong>
      {line && <span>{line}</span>}
    </div>
  );
}

function FindBoard({ t }: { t: Panels['find'] }) {
  return (
    <Board flow={t.flow} lines={['M168 128 C200 128 210 88 262 88', 'M168 128 C210 128 220 178 262 178', 'M168 128 C210 128 220 268 262 268', 'M448 88 C520 88 530 140 530 260 C530 340 520 400 470 400']}>
      <Node x={30} y={96} w={140} title={t.request} line={t.requestWhere} order={0} />
      <Node x={262} y={58} w={186} title="Ada Obi" line="1,240 USDC" order={1} />
      <Node x={262} y={148} w={186} title="Kemi Ade" line="1,310 USDC" tone="quiet" order={2} />
      <Node x={262} y={238} w={186} title="Musa Bello" line="1,180 USDC" tone="quiet" order={3} />
      <Node x={300} y={376} w={250} title={t.agreedTerms} line={t.agreedLine} tone="green" order={4} />
    </Board>
  );
}

function ProtectBoard({ t, p }: { t: Panels['protect']; p: LandingCopy['phone'] }) {
  return (
    <Board flow={t.flow} lines={['M178 110 L212 110', 'M388 110 L420 110']}>
      <Node x={30} y={80} w={150} title="Tunde Bello" line={p.buyer} order={0} />
      <div className={s.escrow} style={{ ['--i' as string]: 1 }}>
        <span>{t.held}</span>
        <strong>1,240 <small>USDC</small></strong>
      </div>
      <Node x={420} y={80} w={150} title="Ada Obi" line={p.seller} order={2} />
      <div className={s.bars} style={{ ['--i' as string]: 3 }}>
        <span className={s.barsLabel}>{p.milestones}</span>
        <div className={s.bar}><p><strong>{p.sample}</strong><em data-on="">{t.paid}</em></p><i style={{ ['--w' as string]: 1 }} /></div>
        <div className={s.bar}><p><strong>{p.delivered}</strong><em>{t.heldShort}</em></p><i data-held="" style={{ ['--w' as string]: 0.3 }} /></div>
        <span className={s.barsFoot}>{t.released}</span>
      </div>
    </Board>
  );
}

function RecordBoard({ t, item }: { t: Panels['record']; item: string }) {
  return (
    <Board flow={t.flow} lines={['M190 110 L236 110', 'M330 264 C330 300 210 290 200 360', 'M440 264 C440 300 470 300 470 360']}>
      <Node x={30} y={80} w={160} title={t.dealPaid} line={item} order={0} />
      <div className={s.recordCard} style={{ ['--i' as string]: 1 }}>
        <strong>Ada Obi</strong>
        <span>{t.sellerWhere}</span>
        <dl>
          <div><dt>{t.completed}</dt><dd data-on="">48</dd></div>
          <div><dt>{t.onTime}</dt><dd>96%</dd></div>
          <div><dt>{t.disputes}</dt><dd>0</dd></div>
        </dl>
      </div>
      <Node x={90} y={360} w={200} title={t.shared} line={t.sharedLine} order={2} />
      <Node x={370} y={360} w={200} title={t.early} line={t.earlyLine} tone="green" order={3} />
    </Board>
  );
}

function Panel({ index, label, title, body, points, href, learnMore, children }: { index: number; label: string; title: string; body: string; points: readonly string[]; href: string; learnMore: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useSceneProgress(ref, 'enter', { span: 0.7 });
  return (
    <section ref={ref} className={s.panel} style={{ zIndex: index + 1 }} aria-labelledby={`landing-panel-${index}`}>
      <div className={s.glow} aria-hidden />
      <span className={s.wordmarkTouch} aria-hidden>Karwan</span>
      <div className={s.panelCopy}>
        <ol className={s.panelSteps} aria-hidden>
          {[0, 1, 2].map((i) => <li key={i} data-on={i === index ? '' : undefined}>0{i + 1}</li>)}
        </ol>
        <p className={s.eyebrow}>{label}</p>
        <h2 id={`landing-panel-${index}`} className={s.panelTitle}>{title}</h2>
        <p className={s.lead}>{body}</p>
        <ul className={s.points}>{points.map((point) => <li key={point}>{point}</li>)}</ul>
        <Link className={s.textLink} href={href}>{learnMore}<Icon name="arrow-right" size={16} directional aria-hidden /></Link>
      </div>
      {children}
    </section>
  );
}

/// Section 2: find and agree, protected deals, a record that travels. Each
/// panel sticks and the next one rises over it (view 49).
export function StackedPanels() {
  const { locale } = useLocale();
  const t = landingCopy[locale] ?? landingCopy.en;
  const p = t.panels;
  return (
    <div className={s.panels}>
      <Panel index={0} {...p.find} href="/docs/deals" learnMore={p.learnMore}><FindBoard t={p.find} /></Panel>
      <Panel index={1} {...p.protect} href="/docs/escrow" learnMore={p.learnMore}><ProtectBoard t={p.protect} p={t.phone} /></Panel>
      <Panel index={2} {...p.record} href="/docs/reputation" learnMore={p.learnMore}><RecordBoard t={p.record} item={p.find.request} /></Panel>
    </div>
  );
}
