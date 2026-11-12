/// Old desk addresses, sent to the page that took them over (view 79). Kept
/// temporary (307) so bookmarks follow if a page moves again.
export const DESK_REDIRECTS = [
  { source: '/admin/profiles', destination: '/admin/accounts', permanent: false },
  { source: '/admin/approvals', destination: '/admin/waiting', permanent: false },
  { source: '/admin/runtime', destination: '/admin/agents', permanent: false },
  { source: '/admin/signals', destination: '/admin/agents?tab=signals', permanent: false },
  { source: '/admin/diagnostics', destination: '/admin/health', permanent: false },
  { source: '/admin/events', destination: '/admin/activity', permanent: false },
  { source: '/admin/log', destination: '/admin/activity?tab=log', permanent: false },
  { source: '/admin/usyc', destination: '/admin/treasury?tab=yield', permanent: false },
  { source: '/admin/survey', destination: '/admin/waitlist?tab=survey', permanent: false },
  { source: '/admin/access', destination: '/admin/team?tab=pages', permanent: false },
  { source: '/admin/team-keys', destination: '/admin/keys?tab=team', permanent: false },
  { source: '/admin/payments', destination: '/admin/money', permanent: false },
];

/// Where an old desk address now lives, or null. Called by the middleware
/// after the desk gate, never from next.config: config redirects run before
/// the gate and would tell the public site the desk exists.
export function deskRedirectFor(pathname) {
  return DESK_REDIRECTS.find((r) => r.source === pathname)?.destination ?? null;
}
