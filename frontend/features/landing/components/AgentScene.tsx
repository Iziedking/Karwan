'use client';

import { useCallback, useRef, useState } from 'react';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { landingCopy } from '@/shared/i18n/messages/landing';
import { stepAt } from '../motion';
import { clipFiles } from '../tradeClips';
import { useSceneProgress } from '../useLandingMotion';
import s from '../landing.module.css';

const TIMES = ['09:02', '09:04', '09:11', '09:15'];
const STEPS = 5;

/// Section 4: the agent walks the route, the best fit waits for your yes, and
/// +$50 is the one number to read (view 49). The card's buttons belong to the
/// picture; the scene is told in words for screen readers.
export function AgentScene() {
  const { locale } = useLocale();
  const t = (landingCopy[locale] ?? landingCopy.en).agent;
  const ref = useRef<HTMLElement>(null);
  const [step, setStep] = useState(STEPS - 1);
  const [moving, setMoving] = useState(false);
  const onProgress = useCallback((p: number) => {
    setMoving(true);
    setStep(stepAt(p, STEPS).index);
  }, []);
  useSceneProgress(ref, 'enter', { span: 0.9, onProgress });
  const current = moving ? step : STEPS - 1;
  const walked = Math.min(current, STEPS - 2);

  return (
    <section ref={ref} className={s.agent} aria-labelledby="landing-agent" data-step={current}>
      <div className={s.glow} aria-hidden />
      <span className={s.wordmarkTouch} aria-hidden>Karwan</span>
      <header className={s.sectionHead}>
        <div>
          <p className={s.eyebrow}>{t.eyebrow}</p>
          <h2 id="landing-agent" className={s.sectionTitle}><span>{t.titleFirst}</span> <span>{t.titleLast}</span></h2>
        </div>
      </header>
      <p className={s.srOnly}>{t.summary}</p>
      <div className={s.agentStage} aria-hidden>
        <ol className={s.steps} style={{ ['--walked' as string]: walked / (STEPS - 1) }}>
          {t.steps.map((label, i) => (
            <li key={label} data-on={i <= current ? '' : undefined} data-last={i === STEPS - 1 ? '' : undefined}>
              <i />
              <span>{TIMES[i] ?? t.now}</span>
              <strong>{label}</strong>
            </li>
          ))}
          <li className={s.mascotSpot} style={{ ['--at' as string]: walked / (STEPS - 1) }} />
        </ol>
        <div className={s.agentGrid}>
          <div className={s.fitCard} data-on={current >= 3 ? '' : undefined}>
            <img src={clipFiles('tailor').poster} alt="" loading="lazy" decoding="async" />
            <span className={s.fitChip}>{t.bestFit}</span>
            <div className={s.fitHead}>
              <div><strong>{t.tailorPlace}</strong><span>{t.tailorRecord}</span></div>
              <div className={s.fitAsk}><strong>$2,450</strong><span>{t.asks}</span></div>
            </div>
            <div className={s.price}>
              <i className={s.priceInside} />
              <i className={s.priceOver} />
              <i className={s.priceLimit} />
              <b />
              <span>{t.limit}</span>
            </div>
            <div className={s.fitActions}>
              <span className={s.fitAgree}>{t.agree}</span>
              <span className={s.fitKeep}>{t.keep}</span>
            </div>
          </div>
          <div className={s.overSide} data-on={current >= 4 ? '' : undefined}>
            <p className={s.over}>{t.over}</p>
            <p className={s.overCaption}>{t.overCaption}</p>
            <dl className={s.receipt}>
              <div><dt>{t.request}</dt><dd>{t.requestLine}</dd></div>
              <div data-passed=""><dt>{t.passed}</dt><dd>{t.passedOne}</dd></div>
              <div data-passed=""><dt>{t.passed}</dt><dd>{t.passedTwo}</dd></div>
            </dl>
          </div>
        </div>
      </div>
      <ul className={s.rules}>
        {t.rules.map((title, i) => (
          <li key={title}><span>0{i + 1}</span><strong>{title}</strong></li>
        ))}
      </ul>
    </section>
  );
}
