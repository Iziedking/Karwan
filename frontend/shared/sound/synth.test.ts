import assert from 'node:assert/strict';
import test from 'node:test';
import { createSynth, PEAK_GAIN, type MoneySoundKind, type SynthContext } from './synth';

type Automation = { method: 'set' | 'linear' | 'exp'; value: number; time: number };

class FakeParam {
  value = 0;
  events: Automation[] = [];
  setValueAtTime(value: number, time: number) { this.events.push({ method: 'set', value, time }); }
  linearRampToValueAtTime(value: number, time: number) { this.events.push({ method: 'linear', value, time }); }
  exponentialRampToValueAtTime(value: number, time: number) { this.events.push({ method: 'exp', value, time }); }
}

class FakeNode {
  outputs: FakeNode[] = [];
  connect(destination: FakeNode) {
    this.outputs.push(destination);
    return destination;
  }
}

class FakeSource extends FakeNode {
  startedAt: number | null = null;
  stops: number[] = [];
  start(when = 0) { this.startedAt = when; }
  stop(when = 0) { this.stops.push(when); }
}

class FakeOscillator extends FakeSource {
  type: OscillatorType = 'sine';
  frequency = new FakeParam();
}

class FakeGain extends FakeNode {
  gain = new FakeParam();
}

class FakeFilter extends FakeNode {
  type: BiquadFilterType = 'lowpass';
  frequency = new FakeParam();
  Q = new FakeParam();
}

class FakeBufferSource extends FakeSource {
  buffer: { getChannelData(channel: number): Float32Array } | null = null;
}

class FakeContext implements SynthContext {
  currentTime = 1;
  sampleRate = 8000;
  destination = new FakeNode();
  sources: FakeSource[] = [];
  gains: FakeGain[] = [];
  filters: FakeFilter[] = [];
  createOscillator() { const node = new FakeOscillator(); this.sources.push(node); return node; }
  createGain() { const node = new FakeGain(); this.gains.push(node); return node; }
  createBiquadFilter() { const node = new FakeFilter(); this.filters.push(node); return node; }
  createBuffer(_channels: number, length: number) {
    const data = new Float32Array(length);
    return { getChannelData: () => data };
  }
  createBufferSource() { const node = new FakeBufferSource(); this.sources.push(node); return node; }
}

const KINDS: MoneySoundKind[] = ['swoosh', 'coinDrop', 'coin', 'wave'];

function playOnce(kind: MoneySoundKind) {
  const ctx = new FakeContext();
  createSynth(ctx).play(kind);
  return ctx;
}

for (const kind of KINDS) {
  test(`${kind} ends within 600 ms and every source is told to stop`, () => {
    const ctx = playOnce(kind);
    assert.ok(ctx.sources.length > 0);
    for (const source of ctx.sources) {
      assert.notEqual(source.startedAt, null);
      assert.equal(source.stops.length, 1);
      assert.ok(source.stops[0] >= source.startedAt!);
      assert.ok(source.stops[0] - ctx.currentTime <= 0.6, `${kind} runs past 600 ms`);
    }
  });

  test(`${kind} never peaks above the kit's existing level`, () => {
    const ctx = playOnce(kind);
    const levels = ctx.gains.flatMap((node) => node.gain.events.map((event) => event.value));
    assert.ok(Math.max(...levels) > 0);
    assert.ok(Math.max(...levels) <= PEAK_GAIN);
  });
}

test('the coin drop is three clinks at 0, 90 and 150 ms', () => {
  const ctx = playOnce('coinDrop');
  const t0 = ctx.currentTime + 0.01;
  const starts = [...new Set(ctx.sources.map((source) => Math.round((source.startedAt! - t0) * 1000)))];
  assert.deepEqual(starts, [0, 90, 150]);
});

test('the swoosh sweeps up and the wave glides down', () => {
  const sweep = playOnce('swoosh').filters[0].frequency.events;
  assert.ok(sweep[sweep.length - 1].value > sweep[0].value);
  const wave = playOnce('wave');
  const glide = (wave.sources[0] as FakeOscillator).frequency.events;
  assert.ok(glide[glide.length - 1].value < glide[0].value);
});

test('a new sound cuts off the same kind still playing', () => {
  const ctx = new FakeContext();
  const synth = createSynth(ctx);
  synth.play('coin');
  const first = [...ctx.sources];
  ctx.currentTime = 1.1;
  synth.play('coin');
  for (const source of first) assert.equal(source.stops[source.stops.length - 1], 1.1);
});

test('a different kind leaves the playing one alone', () => {
  const ctx = new FakeContext();
  const synth = createSynth(ctx);
  synth.play('coin');
  const first = [...ctx.sources];
  synth.play('wave');
  for (const source of first) assert.equal(source.stops.length, 1);
});
