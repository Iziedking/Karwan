// Used by both creation forms and their no-network regression tests.
export function validAmount(value: number | '', max = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= max;
}

export function validWhole(value: number | '', min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

export function authorisedPrice(budget: number, tolerance: number | ''): number {
  // Display precision only. The existing backend remains the pricing authority.
  return Number((budget * (1 + (tolerance === '' ? 0 : tolerance) / 100)).toFixed(6));
}
