/// What a message sent from a market ad is about (view 32): a listing or a
/// request, read from ?about=listing:<id> on the conversation link.

export interface MessageAbout {
  kind: 'listing' | 'request';
  id: string;
}

export function parseAbout(value: string | undefined | null): MessageAbout | null {
  const m = /^(listing|request):([A-Za-z0-9_-]{1,120})$/.exec(value ?? '');
  return m ? { kind: m[1] as MessageAbout['kind'], id: m[2]! } : null;
}

export function aboutHref(about: MessageAbout): string {
  return about.kind === 'listing' ? `/listings/${encodeURIComponent(about.id)}` : `/jobs/${encodeURIComponent(about.id)}`;
}
