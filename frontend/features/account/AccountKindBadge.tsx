'use client';
import type { UserProfile } from '@/core/api';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { isBusinessAccount } from './accountKind';

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
  // Neutral: being an individual is a state, not an achievement.
  individual: 'rgba(255,255,255,0.45)',
  // Amber: registered but the registry has not approved it yet.
  business: '#FFC857',
  verified: 'var(--lp-accent)',
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
      title={title}
      className="inline-flex items-center gap-1.5 mono text-[10px] uppercase tracking-[0.14em] whitespace-nowrap px-2 py-1 border"
      style={{
        borderColor: tone === 'dark' ? 'rgba(255,255,255,0.18)' : 'var(--color-line)',
        color: tone === 'dark' ? 'rgba(255,255,255,0.72)' : 'var(--lp-text-muted)',
        borderTopLeftRadius: 7,
        borderTopRightRadius: 7,
        borderBottomLeftRadius: 7,
        borderBottomRightRadius: 2,
      }}
    >
      <span aria-hidden className="block w-[6px] h-[6px]" style={{ background: TONE[kind] }} />
      {label}
    </span>
  );
}
