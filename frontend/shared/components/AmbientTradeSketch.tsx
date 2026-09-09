'use client';

/**
 * Decorative trade-flow sketch shared by every customer shell. It is
 * deliberately inert so it can never compete with controls or capture input.
 */
export function AmbientTradeSketch() {
  return <span aria-hidden="true" className="global-trade-sketch" />;
}
