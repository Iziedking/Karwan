/// Joins class names, dropping falsy values. Minimal by design: no
/// tailwind-merge dedup, so do not pass conflicting utilities for the same
/// property.
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
