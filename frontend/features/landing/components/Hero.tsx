'use client';

import Link from 'next/link';
import { useCallback, useRef, useState } from 'react';
import { DEALS_AVAILABLE } from '@/core/arcNetwork';
import { Icon } from '@/shared/components/Icon';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { landingCopy, type LandingCopy, type Platform } from '@/shared/i18n/messages/landing';
import { landingEntryRoutes } from '@/features/home/landingEntry';
import { heroStage, heroView, type HeroStage } from '../heroStages';
import { useSceneProgress } from '../useLandingMotion';
import { PlatformIcon } from './PlatformIcon';
import s from '../landing.module.css';

const PLATFORMS: Platform[] = ['tiktok', 'instagram', 'facebook', 'x', 'linkedin'];

function Row({ k, v }: { k: string; v: string }) {
  return <div className={s.phoneRow}><span>{k}</span><strong>{v}</strong></div>;
}

function Value() {
  return <p className={s.phoneValue}><span>1,240</span> <small>USDC</small></p>;
}

/// The front of the phone: the chat with its draft, the full terms, or the
/// review both sides see.
function Screen({ view, platform, t, side, sellerAgreed }: { view: 'chat' | 'terms' | 'review'; platform: Platform; t: LandingCopy; side: 'buyer' | 'seller'; sellerAgreed: boolean }) {
  const p = t.phone;
  return (
    <div className={s.screen}>
      <div className={s.island} />
      <div className={s.phoneTop}><span>9:41</span></div>
      <div className={s.phoneHead}><strong>Karwan</strong>{view === 'review' && <span>{side === 'seller' ? p.sellerPhone : p.buyerPhone}</span>}</div>
      {view === 'chat' && (
        <>
          <div className={s.platformLine}><PlatformIcon platform={platform} size={16} /><div><strong>{t.hero.platformNames[platform]}</strong><span>{p.conversation}</span></div></div>
          <p className={s.bubble}>{t.hero.messages[platform]}</p>
          <p className={s.bring}><Icon name="arrow-down" size={16} aria-hidden />{p.bring}</p>
          <p className={s.phoneLabel}>{p.draft}</p>
          <p className={s.phoneItem}>{p.item}</p>
          <p className={s.phoneLabel}>{p.value}</p>
          <Value />
          <Row k={p.delivery} v={p.deliveryDays} />
          <p className={s.phoneLabel}>{p.milestones}</p>
          <ol className={s.milestones}><li><span>{p.sample}</span><strong>30%</strong></li><li><span>{p.delivered}</span><strong>70%</strong></li></ol>
          <p className={s.phoneNote}>{p.forReview}</p>
        </>
      )}
      {view === 'terms' && (
        <>
          <p className={s.phoneLabel}>{p.draft}</p>
          <p className={s.phoneSub}>{p.fromChat.replace('{platform}', t.hero.platformNames[platform])}</p>
          <p className={s.phoneItem}>{p.item}</p>
          <Value />
          <Row k={p.buyer} v="Tunde Bello" />
          <Row k={p.seller} v="Ada Obi" />
          <Row k={p.delivery} v={p.deliveryDays} />
          <Row k={p.reviewTime} v={p.reviewDays} />
          <ol className={s.milestones}><li><span>{p.sample}</span><strong>30%</strong></li><li><span>{p.delivered}</span><strong>70%</strong></li></ol>
          <span className={s.phoneAction}>{p.send}</span>
        </>
      )}
      {view === 'review' && (
        <>
          <p className={s.phoneLabel}>{p.draft}</p>
          <p className={s.phoneItem}>{p.item}</p>
          <Value />
          <Row k={p.delivery} v={p.deliveryDays} />
          <Row k={p.reviewTime} v={p.reviewDays} />
          <Row k={p.milestones} v={p.milestoneSplit} />
          <p className={s.phoneLabel}>{p.bothSides}</p>
          <div className={s.sideRow}><span>{p.buyerLine}</span><em data-on="">{p.agreed}</em></div>
          <div className={s.sideRow}><span>{p.sellerLine}</span><em data-on={sellerAgreed ? '' : undefined}>{sellerAgreed ? p.agreed : p.reviewing}</em></div>
          <span className={s.phoneAction} data-quiet={side === 'buyer' && !sellerAgreed ? '' : undefined} data-quiet-seller={side === 'seller' && sellerAgreed ? '' : undefined}>
            {side === 'seller' ? (sellerAgreed ? p.waitingPay : p.accept) : sellerAgreed ? p.pay : p.waitingSeller}
          </span>
        </>
      )}
    </div>
  );
}

/// Section 1: the hero. Pinned while scrolling, the phone turns once and the
/// chat becomes terms, then the seller's phone joins and both agree (view 49).
export function Hero() {
  const { locale } = useLocale();
  const t = landingCopy[locale] ?? landingCopy.en;
  const h = t.hero;
  const entry = landingEntryRoutes(DEALS_AVAILABLE);
  const ref = useRef<HTMLElement>(null);
  const [stage, setStage] = useState<HeroStage>(0);
  const [platform, setPlatform] = useState<Platform>('tiktok');
  const onProgress = useCallback((p: number) => setStage(heroStage(p)), []);
  useSceneProgress(ref, 'pinned', { onProgress });
  const view = heroView(stage);

  const block = (name: 'hero' | 'terms' | 'agree') => (view.copy === name ? {} : { 'aria-hidden': true, inert: true });

  return (
    <section ref={ref} className={s.hero} aria-labelledby="landing-title" data-stage={stage}>
      <div className={s.heroSticky}>
        <div className={s.glow} aria-hidden />
        <div className={s.heroCopy}>
          <div className={s.copyBlock} data-on={view.copy === 'hero' ? '' : undefined} {...block('hero')}>
            <p className={s.eyebrow}>{h.kicker}</p>
            <h1 id="landing-title" className={s.heroTitle}><span>{h.titleFirst}</span> <span>{h.titleLast}</span></h1>
            <p className={s.lead}>{h.lead}</p>
            <div className={s.actions}>
              <Link className={s.primary} href={DEALS_AVAILABLE ? entry.agreement : '/waitlist'}>{DEALS_AVAILABLE ? h.create : h.waitlist}</Link>
              <Link className={s.textLink} href={entry.market}>{DEALS_AVAILABLE ? h.explore : h.tryTestnet}<Icon name="arrow-right" size={16} directional aria-hidden /></Link>
            </div>
            <p className={s.platformsLabel} id="landing-platforms">{h.platformsLabel}</p>
            <div className={s.platforms} role="tablist" aria-labelledby="landing-platforms">
              {PLATFORMS.map((name) => (
                <button key={name} type="button" role="tab" aria-selected={platform === name} aria-label={h.platformNames[name]} className={s.platform} onClick={() => setPlatform(name)}>
                  <PlatformIcon platform={name} />
                  {platform === name && <span>{h.platformNames[name]}</span>}
                </button>
              ))}
            </div>
          </div>
          <div className={s.copyBlock} data-on={view.copy === 'terms' ? '' : undefined} {...block('terms')}>
            <p className={s.eyebrow}>{h.termsLabel}</p>
            <h2 className={s.chapterTitle}>{h.termsTitle}</h2>
            <p className={s.lead}>{h.termsBody}</p>
            <span className={s.sceneBar} aria-hidden><span /></span>
          </div>
          <div className={s.copyBlock} data-on={view.copy === 'agree' ? '' : undefined} {...block('agree')}>
            <p className={s.eyebrow}>{h.agreeLabel}</p>
            <h2 className={s.chapterTitle}>{h.agreeTitle}</h2>
            <p className={s.lead}>{h.agreeBody}</p>
            <span className={s.sceneBar} aria-hidden><span /></span>
          </div>
        </div>
        <div className={s.stage} role="group" aria-label={h.phoneLabel}>
          <div className={s.buyerPhone}>
            <div className={s.turn}>
              <div className={s.face}><Screen view={view.screen} platform={platform} t={t} side="buyer" sellerAgreed={view.sellerAgreed} /></div>
              <div className={`${s.face} ${s.back}`} aria-hidden><span className={s.camera} /><strong>Karwan</strong></div>
            </div>
          </div>
          <div className={s.sellerPhone} aria-hidden={!view.sellerPhone} data-on={view.sellerPhone ? '' : undefined}>
            <div className={s.face}><Screen view="review" platform={platform} t={t} side="seller" sellerAgreed={view.sellerAgreed} /></div>
          </div>
        </div>
      </div>
    </section>
  );
}
