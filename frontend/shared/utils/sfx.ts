/// Tiny synthesized UI sound kit. No audio files. short, soft sine tones via
/// the Web Audio API. The context is created lazily and resumed on the first
/// user gesture (browsers block autoplay until then), so sounds that fire from
/// a click work, and SSE-driven ones work once the user has interacted.

let ctx: AudioContext | null = null;
let muted = false;
const listeners = new Set<(muted: boolean) => void>();

if (typeof window !== 'undefined') {
  try {
    muted = window.localStorage.getItem('karwan-sfx') === 'off';
  } catch {
    /* ignore */
  }
}

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
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
};
