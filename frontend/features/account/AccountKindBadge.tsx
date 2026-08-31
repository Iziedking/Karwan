'use client';
import type { UserProfile } from '@/core/api';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { isBusinessAccount } from './accountKind';
import { AccountKindIcon } from './AccountKindIcon';

/// Which account someone is operating as, said out loud.
///
/// The two rails behave differently — a business reaches the SME lane, finance
/// and the registry; an individual does not — and until this badge existed
/// nothing on screen told you which one you were in. Two accounts on the same
/// machine looked identical.
///
/// Three states, not two, because `accountKind` (the onboarding choice) and
/// `business.status` (registry approval) are different facts. Collapsing them
/// would put "verified" in front of a business that never passed the registry,
/// which is exactly the kind of claim this product has been burned by.
type Kind = 'individual' | 'business' | 'verified';

function kindOf(profile?: Parameters<typeof isBusinessAccount>[0] & Pick<UserProfile, 'business'>): Kind {
  if (!isBusinessAccount(profile)) return 'individual';
  return profile?.business?.status === 'verified' ? 'verified' : 'business';
}

const TONE: Record<Kind, string> = {
  // Inherits the badge's own colour rather than picking one: being an individual
  // is a state, not an achievement, and a fixed value here would be invisible on
  // one of the two themes.
  individual: 'currentColor',
  // Amber: registered, but the registry has not approved it yet.
  business: '#FFC857',
  // Fallback is load-bearing, not belt-and-braces. This badge rides in TopNav on
  // every route, and TopNav is styled from the --color-* family; the --lp-*
  // family is not in scope everywhere. Where it is missing the bare var() falls
  // back to the inherited colour, which rendered a VERIFIED business in the same
  // ink as an individual and silently dropped the whole signal.
  verified: 'var(--lp-accent, #afc95b)',
};

export function AccountKindBadge({
  profile,
  detailed = false,
  tone = 'auto',
}: {
  profile?: Parameters<typeof kindOf>[0];
  /// Compact (nav) shows one word. Detailed (profile hero) spells out an
  /// unverified business rather than leaving it to a hover title nobody reads.
  detailed?: boolean;
  /// 'dark' for the always-dark hero bands, where the theme tokens would put
  /// near-black hairlines on a near-black surface. 'auto' follows the theme.
  tone?: 'auto' | 'dark';
}) {
  const t = useTranslations().account.kind;
  const kind = kindOf(profile);

  const label =
    kind === 'individual' ? t.individual
    : kind === 'verified' ? `${t.business} · ${t.verified}`
    : detailed ? `${t.business} · ${t.notVerified}`
    : t.business;

  const title =
    kind === 'individual' ? t.titleIndividual
    : kind === 'verified' ? t.titleVerified
    : t.titleBusiness;

  return (
    <span
      // The words are the label for a screen reader either way; sighted users in
      // the nav get the mark alone, which is why the same mark heads the account
      // cards at sign-up.
      aria-label={title}
      role="img"
      className="inline-flex items-center gap-1.5 mono text-[10px] uppercase tracking-[0.14em] whitespace-nowrap px-2 py-1 border"
      style={{
        borderColor: tone === 'dark' ? 'var(--lp-workspace-border)' : 'var(--color-line)',
        color: tone === 'dark' ? 'var(--lp-workspace-muted)' : 'var(--lp-text-muted)',
        borderTopLeftRadius: 7,
        borderTopRightRadius: 7,
        borderBottomLeftRadius: 7,
        borderBottomRightRadius: 2,
      }}
    >
      {/* Tinted by state, so verification still carries when the words are gone:
          grey individual, amber business awaiting the registry, lime verified. */}
      <span style={{ color: TONE[kind] }}>
        <AccountKindIcon kind={kind === 'individual' ? 'individual' : 'business'} />
      </span>
      {detailed && label}
    </span>
  );
}
