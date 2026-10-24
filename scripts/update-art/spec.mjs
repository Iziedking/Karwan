/// Reads and checks a cards file for the update-image renderer, so a typo
/// fails before a browser starts.

export const LAYOUTS = ['logo', 'pair', 'screen', 'figure'];
export const GROUNDS = ['mist', 'sage', 'blush', 'lilac', 'paper'];

const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function checkCards(input) {
  const errors = [];
  const cards = Array.isArray(input?.cards) ? input.cards : null;
  if (!cards || cards.length === 0) return { cards: [], errors: ['the file needs a "cards" list with at least one card'] };
  const seen = new Set();
  const out = cards.map((raw, i) => {
    const at = `card ${i + 1}${raw?.name ? ` (${raw.name})` : ''}`;
    const card = {
      name: raw?.name,
      layout: raw?.layout,
      ground: raw?.ground ?? 'mist',
      theme: raw?.theme ?? 'light',
      tile: raw?.tile ?? 'light',
      mirror: raw?.mirror === true,
      logo: raw?.logo,
      screen: raw?.screen,
      figure: raw?.figure === undefined ? undefined : String(raw.figure),
      unit: raw?.unit,
    };
    if (typeof card.name !== 'string' || !NAME.test(card.name)) errors.push(`${at}: name must be lowercase words joined by hyphens`);
    else if (seen.has(card.name)) errors.push(`${at}: name is used twice`);
    else seen.add(card.name);
    if (!LAYOUTS.includes(card.layout)) errors.push(`${at}: layout must be one of ${LAYOUTS.join(', ')}`);
    if (!GROUNDS.includes(card.ground)) errors.push(`${at}: ground must be one of ${GROUNDS.join(', ')}`);
    if (!['light', 'dark'].includes(card.theme)) errors.push(`${at}: theme must be light or dark`);
    if (!['light', 'dark'].includes(card.tile)) errors.push(`${at}: tile must be light or dark`);
    if ((card.layout === 'logo' || card.layout === 'pair') && !card.logo) errors.push(`${at}: ${card.layout} needs a logo file`);
    if (card.layout === 'screen' && !card.screen) errors.push(`${at}: screen needs a screen file`);
    if (card.layout === 'figure') {
      if (!card.figure || card.figure.length > 7) errors.push(`${at}: figure needs 1 to 7 characters`);
      if (card.unit !== undefined && (typeof card.unit !== 'string' || card.unit.length > 8)) errors.push(`${at}: unit is at most 8 characters`);
    }
    return card;
  });
  return { cards: out, errors };
}

/// The smallest source that stays sharp in its slot at 1600x900.
export const MIN_SOURCE = { logo: 480, screen: 900 };

export function sharpnessWarning(card, kind, width, height, isVector) {
  if (isVector) return null;
  const long = Math.max(width, height);
  return long < MIN_SOURCE[kind] ? `${card.name}: the ${kind} is ${width}x${height}, under ${MIN_SOURCE[kind]}px on its long side, so it will look soft` : null;
}
