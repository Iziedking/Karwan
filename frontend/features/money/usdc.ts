/// USDC in the six-decimal units every Karwan amount settles in. Numbers come
/// in and go out at the edges; comparisons happen in whole micros.
const SCALE = 1_000_000;

export function toMicros(value: number): number {
  return Math.round(value * SCALE);
}

export function fromMicros(micros: number): number {
  return micros / SCALE;
}
