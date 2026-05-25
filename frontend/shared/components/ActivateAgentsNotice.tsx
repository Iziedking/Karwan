'use client';
import { useState } from 'react';
import { useActivation } from '@/shared/hooks/useActivation';
import { ActivationModal } from './ActivationModal';
import { Band, SectionTag, HeroHeadline, Punc, CTAPill } from './Bands';

interface Props {
  /// Which agent the surrounding page is about. Tunes the copy so a seller
  /// reading the seller desk hears about bidding, not posting.
  role?: 'buyer' | 'seller' | 'both';
  /// Tone of the band, matching the section it sits between.
  tone?: 'light' | 'dark';
}

/// Catches the silent dead end: a signed-in user who saved a profile but never
/// activated. A saved profile does NOT provision a bidding agent, so the seller
/// (or buyer) agent never acts and nothing on the page says why. This names the
/// gap and gives a one-click activate. Self-rendering like PendingMatchesBand:
/// returns null once activated (or before the status loads), so it can be
/// dropped straight between bands without leaving an empty section behind.
export function ActivateAgentsNotice({ role = 'both', tone = 'light' }: Props) {
  const { isConnected, activated, loading, activate, renameAgents, activating, error, agents } =
    useActivation();
  const [open, setOpen] = useState(false);

  if (!isConnected || loading || activated) return null;

  const dark = tone === 'dark';
  const headline =
    role === 'seller' ? 'Activate to bid' : role === 'buyer' ? 'Activate to post' : 'Activate to begin';
  const body =
    role === 'seller'
      ? 'A saved seller profile does not start an agent. Activate to let your seller agent bid on matching requests.'
      : role === 'buyer'
        ? 'A saved buyer profile does not start an agent. Activate to post requests and run auctions.'
        : 'A saved profile does not start an agent. Activate to let your agents bid and post on your behalf.';

  return (
    <>
      <Band tone={tone} compact>
        <SectionTag tone={tone}>NOT ACTIVATED</SectionTag>
        <HeroHeadline size="md">
          {headline}
          <Punc>.</Punc>
        </HeroHeadline>
        <p
          className="mt-5 text-pretty text-[15px] leading-relaxed max-w-[52ch]"
          style={{ color: dark ? 'var(--lp-text-muted)' : 'var(--lp-text-sub)' }}
        >
          {body}
        </p>
        <div className="mt-7">
          <CTAPill onClick={() => setOpen(true)}>Activate agents</CTAPill>
        </div>
      </Band>
      <ActivationModal
        open={open}
        onClose={() => setOpen(false)}
        activate={activate}
        renameAgents={renameAgents}
        activating={activating}
        error={error}
        activated={activated}
        agents={agents}
      />
    </>
  );
}
