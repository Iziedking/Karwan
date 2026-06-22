'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, type AdminDealRow, type AdminProfileRow } from '@/core/api';

/// Admin overview: at-a-glance counts across deals and profiles, with links
/// into the detail tables.
export default function AdminOverview() {
  const [deals, setDeals] = useState<AdminDealRow[] | null>(null);
  const [profiles, setProfiles] = useState<AdminProfileRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.adminDeals(), api.adminProfiles()])
      .then(([d, p]) => {
        if (cancelled) return;
        setDeals(d.deals);
        setProfiles(p.profiles);
      })
      .catch((e) => !cancelled && setErr(e instanceof Error ? e.message : 'Failed to load'));
    return () => {
      cancelled = true;
    };
  }, []);

  const byStage = (stage: string) => deals?.filter((d) => d.stage === stage).length ?? 0;
  const cards = [
    { label: 'Deals', value: deals?.length, href: '/admin/deals' },
    { label: 'Open', value: deals ? byStage('open') + byStage('accepted') + byStage('delivered') : undefined, href: '/admin/deals' },
    { label: 'Settled', value: deals ? byStage('settled') : undefined, href: '/admin/deals' },
    { label: 'Disputed', value: deals ? byStage('disputed') : undefined, href: '/admin/deals' },
    { label: 'Profiles', value: profiles?.length, href: '/admin/profiles' },
    { label: 'Businesses', value: profiles?.filter((p) => p.accountType === 'business').length, href: '/admin/profiles' },
    { label: 'Research on', value: profiles?.filter((p) => p.researchActive).length, href: '/admin/profiles' },
    { label: 'Email verified', value: profiles?.filter((p) => p.emailVerified).length, href: '/admin/profiles' },
  ];

  return (
    <div>
      <h1 className="font-sans text-[26px] font-extrabold tracking-[-0.01em]">Overview</h1>
      {err && <p className="mt-3 text-[13px] text-[#e0794f]">{err}</p>}
      <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="bg-[#161616] border border-white/10 rounded-xl px-4 py-4 hover:border-white/25 transition"
          >
            <p className="mono text-[10px] uppercase tracking-[0.14em] text-white/40">{c.label}</p>
            <p className="mt-1.5 font-sans text-[28px] font-extrabold tabular-nums leading-none">
              {c.value === undefined ? '—' : c.value.toLocaleString()}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
