/// The two account-kind marks: one for an individual, one for a business.
///
/// Both are built from the same square block, the unit this product's whole
/// visual system is made of (the LED cells on the activity counters, the status
/// squares on event rows). An individual is one block. A business is three,
/// stacked into a structure: the same material, organised.
///
/// The signal is COUNT and ARRANGEMENT, never silhouette. A drawn person or
/// building turns to mush at the 14px the nav chip needs, and a rounded figure
/// would fight a system made of squares and hairlines.
///
/// Two things were tried and rejected against real renders:
///   - Three blocks of STEPPED heights read unmistakably as a bar chart, which
///     in a settlement product says "analytics", not "account type".
///   - A hairline baseline under both marks (the trade lane, constant while what
///     stands on it changes) was a better story than it was an icon. It spanned
///     the full box while the single block filled half of it, so at 14px the
///     line dominated and the block shrank to a speck. Dropping it let both
///     marks grow into the box.
///
/// Flat filled rects in `currentColor`, no stroke: crisp at any size, inherits
/// the badge tone, and never needs a light and dark variant.
///
/// Learned at sign-up, where the same mark heads each account card at 28px, then
/// carried into the nav badge where the words would be too long.
export function AccountKindIcon({
  kind,
  size = 14,
}: {
  kind: 'individual' | 'business';
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden
      focusable="false"
      style={{ display: 'block', flexShrink: 0 }}
    >
      {kind === 'individual' ? (
        <rect x="3.5" y="3.5" width="9" height="9" />
      ) : (
        <>
          <rect x="4.75" y="1" width="6.5" height="6.5" />
          <rect x="0.5" y="8.5" width="6.5" height="6.5" />
          <rect x="9" y="8.5" width="6.5" height="6.5" />
        </>
      )}
    </svg>
  );
}
