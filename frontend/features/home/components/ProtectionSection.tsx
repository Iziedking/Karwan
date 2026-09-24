'use client';

import type { ReactNode } from 'react';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { PROTECTION_TOPICS, type ProtectionTopic } from '../protectionTopics';
import styles from './ProtectionSection.module.css';

export function ProtectionSection() {
  const t = useTranslations().protection;

  return (
    <section
      id="protection"
      className={styles.section}
      aria-labelledby="protection-title"
      aria-describedby="protection-introduction"
    >
      <div className={styles.wrap}>
        <header className={styles.header}>
          <h2 id="protection-title">{t.title}</h2>
          <p id="protection-introduction" className={styles.introduction}>{t.introduction}</p>
        </header>
        <div className={styles.grid}>
          {PROTECTION_TOPICS.map(topic => (
            <article key={topic} className={styles.topic}>
              <ProtectionArtwork topic={topic} />
              <h3>{t.topics[topic].title}</h3>
              <p>{t.topics[topic].detail}</p>
            </article>
          ))}
        </div>
        <p className={styles.disclaimer}>{t.disclaimer}</p>
      </div>
    </section>
  );
}

/** Architectural studies, not diagrams of audited custody or permission logic. */
function ProtectionArtwork({ topic }: { topic: ProtectionTopic }) {
  const art: Record<ProtectionTopic, ReactNode> = {
    escrow: <>
      <g className={styles.receding}>
        <path d="M62 133 160 77 258 133 160 189Z M160 77v113 M62 231l98-56 98 56" />
        <path d="M88 148v67l72 42 72-42v-67" />
      </g>
      <path d="M62 133v98l98 56 98-56v-98 M62 133l98 56 98-56 M160 189v98" />
      <path d="m62 62 98-56 98 56-98 56Z M62 62v20l98 56 98-56V62 M160 118v20" />
      <path d="m91 62 69-39 69 39-69 40Z M110 51l69 40 M130 40l69 40 M111 74l68-40 M132 86l67-40" />
      <path d="m127 150 33-19 33 19v38l-33 19-33-19Z M127 150l33 19 33-19 M160 169v38" />
      <path className={styles.accent} d="m127 150 33 19 33-19 M160 169v38" />
    </>,
    milestones: <>
      <g className={styles.receding}>
        <path d="m58 231 98-57 105 61-98 57Z M77 220l105 61 M99 207l105 61 M122 194l105 61 M144 181l105 61" />
        <path d="m102 196 63 36 63-36 M165 232v30" />
      </g>
      <path d="m65 180 98-57 98 57-98 57Z M65 180v24l98 57 98-57v-24 M163 237v24" />
      <path d="m65 115 98-57 98 57-98 57Z M65 115v24l98 57 98-57v-24 M163 172v24" />
      <path d="m65 50 98-57 98 57-98 57Z M65 50v24l98 57 98-57V50 M163 107v24" transform="translate(0 24)" />
      <path d="m93 204 43 25 M192 229l43-25 M93 139l43 25 M192 164l43-25" />
      <path className={styles.accent} d="m65 74 98 57 98-57 M163 131v24" />
    </>,
    disputes: <>
      <g transform="translate(160 150) rotate(-30)">
        <g className={styles.receding} transform="translate(0 22)">
          <path d="M-24-108a111 111 0 0 0 0 216l8-36a74 74 0 0 1 0-144Z" />
          <path d="M24-108a111 111 0 0 1 0 216l-8-36a74 74 0 0 0 0-144Z" />
        </g>
        <path d="M-24 108v22 M-16 72v22 M24 108v22 M16 72v22" />
        <path className={styles.ribbon} d="M-24-108a111 111 0 0 0 0 216l8-36a74 74 0 0 1 0-144Z" />
        <path className={styles.ribbon} d="M24-108a111 111 0 0 1 0 216l-8-36a74 74 0 0 0 0-144Z" />
        <path d="M-30-17 0-34 30-17v34L0 34-30 17Z M-30-17 0 0l30-17 M0 0v34" />
        <path className={styles.accent} d="M-24-108-16-72 M24 108 16 72" />
      </g>
    </>,
    agents: <>
      <g className={styles.receding}>
        <path d="m52 239 97 56 119-69-97-56Z M77 254l97-56 M104 270l97-56 M132 286l97-56" />
        <path d="M82 155v86l67 39 87-50v-86" />
      </g>
      <path d="M54 97 168 31q12-7 24 0l23 13q18 10 18 31v131l-35 20V94q0-18-15-27l-12-7q-5-3-10 0L89 102v166l-35-20Z" />
      <path d="m54 97 35 20 94-54 M89 117v151 M198 94l35-20 M198 226l-22-13V99q0-9-8-14" />
      <path d="M28 177 111 129q7-4 14 0l112 65q7 4 14 0l40-23v27l-40 23q-7 4-14 0l-112-65q-7-4-14 0l-83 48Z" className={styles.ribbon} />
      <path d="m28 177 83-48q7-4 14 0l112 65q7 4 14 0l40-23 M111 129v27 M251 194v27" />
      <path className={styles.accent} d="m137 153 28 16 M148 147l28 16" />
    </>,
  };

  return (
    <svg className={styles.artwork} viewBox="0 0 320 320" width="320" height="320" fill="none" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {art[topic]}
    </svg>
  );
}
