'use client';

import { AgentScene } from './components/AgentScene';
import { AskChips } from './components/AskChips';
import { Closing } from './components/Closing';
import { Hero } from './components/Hero';
import { StackedPanels } from './components/StackedPanels';
import { TradeCases } from './components/TradeCases';
import s from './landing.module.css';

/// The landing as the advert before sign-in (view 49): six scenes, then the
/// footer revealed under the page. It signs nobody in and opens no live stream.
export function LandingPage() {
  return (
    <div className={s.page}>
      <Hero />
      <StackedPanels />
      <TradeCases />
      <AgentScene />
      <AskChips />
      <Closing />
    </div>
  );
}
