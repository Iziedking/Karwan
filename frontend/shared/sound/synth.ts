/// Karwan's four money sounds, synthesised with Web Audio: no files, no
/// licences. Every voice schedules its own stop, peaks at or below PEAK_GAIN
/// and ends within 600 ms. A new sound of one kind cuts off the same kind still
/// playing, so a burst of events never stacks into noise.

export type MoneySoundKind = 'swoosh' | 'coinDrop' | 'coin' | 'wave';

/// The kit's existing tones peak at 0.055. The money sounds never go louder.
export const PEAK_GAIN = 0.055;

/// The slice of Web Audio the voices use, stated structurally so a test can
/// hand in a recording fake. A real AudioContext satisfies it as it is.
export interface ParamLike {
  value: number;
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, time: number): unknown;
  exponentialRampToValueAtTime(value: number, time: number): unknown;
}
export interface NodeLike {
  connect(destination: NodeLike): NodeLike;
}
export interface SourceLike extends NodeLike {
  start(when?: number): void;
  stop(when?: number): void;
}
export interface OscillatorLike extends SourceLike {
  type: OscillatorType;
  frequency: ParamLike;
}
export interface GainLike extends NodeLike {
  gain: ParamLike;
}
export interface FilterLike extends NodeLike {
  type: BiquadFilterType;
  frequency: ParamLike;
  Q: ParamLike;
}
export interface BufferLike {
  getChannelData(channel: number): Float32Array;
}
export interface BufferSourceLike extends SourceLike {
  buffer: BufferLike | null;
}
export interface SynthContext {
  readonly currentTime: number;
  readonly sampleRate: number;
  readonly destination: NodeLike;
  createOscillator(): OscillatorLike;
  createGain(): GainLike;
  createBiquadFilter(): FilterLike;
  createBuffer(channels: number, length: number, sampleRate: number): BufferLike;
  createBufferSource(): BufferSourceLike;
}

type Voice = (ctx: SynthContext, out: NodeLike, t0: number) => SourceLike[];

function envelope(ctx: SynthContext, out: NodeLike, t0: number, peak: number, attack: number, end: number): GainLike {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(peak, t0 + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + end);
  gain.connect(out);
  return gain;
}

function partial(
  ctx: SynthContext,
  out: NodeLike,
  t0: number,
  freq: number,
  type: OscillatorType,
  peak: number,
  attack: number,
  end: number,
): SourceLike {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  osc.connect(envelope(ctx, out, t0, peak, attack, end));
  osc.start(t0);
  osc.stop(t0 + end + 0.02);
  return osc;
}

/// Filtered noise sweeping upward, about 220 ms: air moving as money leaves the hand.
const swoosh: Voice = (ctx, out, t0) => {
  const length = Math.floor(ctx.sampleRate * 0.24);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.setValueAtTime(0.9, t0);
  filter.frequency.setValueAtTime(500, t0);
  filter.frequency.exponentialRampToValueAtTime(3400, t0 + 0.2);
  source.connect(filter);
  filter.connect(envelope(ctx, out, t0, PEAK_GAIN * 0.8, 0.03, 0.22));
  source.start(t0);
  source.stop(t0 + 0.24);
  return [source];
};

/// Three metallic clinks settling at 0, 90 and 150 ms: a coin landing and
/// coming to rest. The quiet inharmonic partial is what reads as metal.
const coinDrop: Voice = (ctx, out, t0) =>
  [
    { at: 0, freq: 2349, level: 1 },
    { at: 0.09, freq: 2217, level: 0.7 },
    { at: 0.15, freq: 2093, level: 0.5 },
  ].flatMap(({ at, freq, level }) => [
    partial(ctx, out, t0 + at, freq, 'sine', PEAK_GAIN * level, 0.004, 0.16),
    partial(ctx, out, t0 + at, freq * 2.76, 'sine', PEAK_GAIN * level * 0.35, 0.004, 0.1),
  ]);

/// A bright two-note ching with a short shimmer, about 350 ms: money in.
const coin: Voice = (ctx, out, t0) => [
  partial(ctx, out, t0, 1319, 'triangle', PEAK_GAIN * 0.8, 0.005, 0.1),
  partial(ctx, out, t0 + 0.07, 1976, 'triangle', PEAK_GAIN, 0.005, 0.26),
  partial(ctx, out, t0 + 0.07, 3952, 'sine', PEAK_GAIN * 0.25, 0.005, 0.2),
];

/// A soft downward glide with a gentle wobble, about 450 ms: money out.
const wave: Voice = (ctx, out, t0) => {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  const pitch = osc.frequency;
  pitch.setValueAtTime(660, t0);
  pitch.linearRampToValueAtTime(560, t0 + 0.12);
  pitch.linearRampToValueAtTime(590, t0 + 0.2);
  pitch.linearRampToValueAtTime(450, t0 + 0.32);
  pitch.linearRampToValueAtTime(470, t0 + 0.38);
  pitch.exponentialRampToValueAtTime(330, t0 + 0.45);
  osc.connect(envelope(ctx, out, t0, PEAK_GAIN * 0.9, 0.04, 0.45));
  osc.start(t0);
  osc.stop(t0 + 0.47);
  return [osc];
};

const VOICES: Record<MoneySoundKind, Voice> = { swoosh, coinDrop, coin, wave };

export interface Synth {
  play(kind: MoneySoundKind): void;
}

export function createSynth(ctx: SynthContext): Synth {
  const playing = new Map<MoneySoundKind, SourceLike[]>();
  return {
    play(kind) {
      for (const source of playing.get(kind) ?? []) {
        try {
          source.stop(ctx.currentTime);
        } catch {
          /* already finished */
        }
      }
      playing.set(kind, VOICES[kind](ctx, ctx.destination, ctx.currentTime + 0.01));
    },
  };
}
