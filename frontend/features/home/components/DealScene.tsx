'use client';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { useMoneyText } from '@/features/money/hooks/useMoneyText';
import { SCENE_METER, SCENE_MONEY, dealScenes, type DealSceneId } from '@/shared/i18n/messages/dealScenes';
import s from './dealScene.module.css';

/// The small Karwan card over a ways-to-deal photo (view 39, 18 Nov): the deal
/// at one moment, its amounts in the reader's own currency. It settles in line
/// by line, holds, and starts again; with reduced motion it rests complete.
/// The tile's own label names the card, so this stays out of the reading order.
export function DealScene({ scene }: { scene: DealSceneId }) {
  const { locale } = useLocale();
  const money = useMoneyText({ compact: true });
  const copy = (dealScenes[locale as keyof typeof dealScenes] ?? dealScenes.en)[scene];
  const fill = (text: string) => money.fill(text, SCENE_MONEY[scene]);
  const meter = SCENE_METER[scene];
  return (
    <span className={s.chip} aria-hidden dir="auto">
      <span className={s.row} data-step="0">
        <b>{copy.title}</b>
        {copy.pill ? <span className={s.pill}>{copy.pill}</span> : null}
      </span>
      {copy.rows.map((row, i) => (
        <span key={i} className={s.row} data-step={i + 1}>
          <span>{fill(row.label)}</span>
          {row.value ? <b>{fill(row.value)}</b> : row.pill ? <span className={s.pill}>{row.pill}</span> : null}
        </span>
      ))}
      {meter ? <span className={s.meter} data-step="1"><i style={{ '--to': meter } as React.CSSProperties} /></span> : null}
      <span className={s.row} data-step="last">
        <span>{fill(copy.done.label)}</span>
        <span className={s.done}>{copy.done.pill}</span>
      </span>
    </span>
  );
}
