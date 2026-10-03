/// The split a matched deal funds with: the buyer's stated split for this
/// request when it is valid, otherwise their profile default. One part (100)
/// is a valid split; both escrows accept 1 to 5 parts summing to 100.
export function effectiveMilestonePcts(stated: unknown, profileDefault: number[]): number[] {
  if (
    Array.isArray(stated) &&
    stated.length >= 1 &&
    stated.length <= 5 &&
    stated.every((n) => Number.isInteger(n) && n >= 1 && n <= 100) &&
    stated.reduce((sum: number, n: number) => sum + n, 0) === 100
  ) {
    return stated as number[];
  }
  return profileDefault;
}
