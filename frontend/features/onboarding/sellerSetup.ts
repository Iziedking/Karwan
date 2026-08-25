export interface MatchingRange {
  min: number;
  max: number;
}

export const SELLER_BUDGET_PRESETS: readonly MatchingRange[] = [
  { min: 50, max: 500 },
  { min: 500, max: 5_000 },
  { min: 5_000, max: 25_000 },
];

export const DEADLINE_PRESETS: readonly MatchingRange[] = [
  { min: 1, max: 7 },
  { min: 7, max: 30 },
  { min: 30, max: 90 },
];

export const BUYER_BUDGET_PRESETS = [500, 5_000, 25_000] as const;
export const MILESTONE_PRESETS = ['100', '50,50', '30,40,30'] as const;

export function selectedSkills(value: string): string[] {
  return value
    .split(',')
    .map((skill) => skill.trim())
    .filter(Boolean);
}

export function toggleSkill(value: string, skill: string): string {
  const skills = selectedSkills(value);
  const existing = skills.findIndex((entry) => entry.toLowerCase() === skill.toLowerCase());
  if (existing >= 0) skills.splice(existing, 1);
  else skills.push(skill);
  return skills.join(', ');
}

export function hasSkill(value: string, skill: string): boolean {
  return selectedSkills(value).some((entry) => entry.toLowerCase() === skill.toLowerCase());
}
