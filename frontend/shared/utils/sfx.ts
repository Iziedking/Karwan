/// Tiny synthesized UI sound kit. No audio files: short, soft tones through the
/// Web Audio API. The context is created lazily and only after the first user
/// gesture. Browsers refuse to start audio before one, and a context made too
/// early only earns a console warning and queues sounds that would all play at
/// once on the first click.

import { createSynth, type MoneySoundKind, type Synth } from '@/shared/sound/synth';

let ctx: AudioContext | null = null;
let synth: Synth | null = null;
let muted = false;
const listeners = new Set<(muted: boolean) => void>();

if (typeof window !== 'undefined') {
  try {
    muted = window.localStorage.getItem('karwan-sfx') === 'off';
  } catch {
    /* ignore */
  }
}

/// Has this page had a tap or a key press yet? A browser without the User
/// Activation API is let through; its own autoplay policy still applies.
function hasUserGesture(): boolean {
  const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  return activation ? activation.hasBeenActive : true;
}

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined' || !hasUserGesture()) return null;
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function isRunning(context: AudioContext): boolean {
  return context.state === 'running';
}

/// One soft tone. `when` is an offset in seconds so notes can be sequenced.
function tone(
  freq: number,
  dur: number,
  when: number,
  type: OscillatorType,
  gain: number,
) {
  const c = getCtx();
  if (!c) return;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = c.currentTime + when;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

export const sfx = {
  get muted() {
    return muted;
  },
  setMuted(v: boolean) {
    muted = v;
    try {
      window.localStorage.setItem('karwan-sfx', v ? 'off' : 'on');
    } catch {
      /* ignore */
    }
    listeners.forEach((fn) => fn(muted));
  },
  toggle() {
    this.setMuted(!muted);
    return muted;
  },
  /// Subscribe to mute-state changes. Returns an unsubscribe fn.
  subscribe(fn: (muted: boolean) => void) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  /// Soft tick. a confirm or a small action.
  tap() {
    if (muted) return;
    tone(440, 0.11, 0, 'triangle', 0.05);
  },
  /// Two-note rise. something sent: a deal opened, a tx broadcast.
  send() {
    if (muted) return;
    tone(330, 0.1, 0, 'sine', 0.05);
    tone(495, 0.17, 0.06, 'sine', 0.05);
  },
  /// Major-chord arpeggio up. completion: settled, bridged, minted.
  success() {
    if (muted) return;
    tone(523.25, 0.14, 0, 'sine', 0.055); // C5
    tone(659.25, 0.14, 0.08, 'sine', 0.055); // E5
    tone(783.99, 0.32, 0.16, 'sine', 0.055); // G5
  },
  /// One of the four money sounds. Only shared/sound/moneySounds calls this. A
  /// sound that cannot start within a second of being asked for is dropped,
  /// never played late.
  playMoney(kind: MoneySoundKind) {
    if (muted) return;
    const c = getCtx();
    if (!c) return;
    const play = () => {
      synth ??= createSynth(c);
      synth.play(kind);
    };
    if (isRunning(c)) {
      play();
      return;
    }
    const askedAt = Date.now();
    c.resume()
      .then(() => {
        if (isRunning(c) && Date.now() - askedAt < 1000) play();
      })
      .catch(() => {});
  },
};
