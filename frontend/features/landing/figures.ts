/// The one green figure on each kind of trade counts up once. These keep the
/// figure's own shape ("$2,400", "2 400 $") while the number changes.

export interface FigureParts {
  prefix: string;
  value: number;
  suffix: string;
  group: string;
}

export function figureParts(figure: string): FigureParts | null {
  const match = figure.match(/^(\D*?)(\d{1,3}(?:([,\s ])\d{3})*|\d+)(\D*)$/);
  if (!match) return null;
  const [, prefix, digits, group = '', suffix] = match;
  return { prefix, value: Number(digits.replace(/\D/g, '')), suffix, group };
}

export function formatFigure(parts: FigureParts, value: number): string {
  const whole = String(Math.round(value));
  const grouped = parts.group ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, parts.group) : whole;
  return parts.prefix + grouped + parts.suffix;
}
