/// Pages that exist only while their build switch is on. Off, they are the
/// plain 404 page (product audit, Batch 1). Business verification is not one:
/// the business switch closes new accounts, and existing ones still manage it.
export type GatedRoute = '/financier/po';

export const GATED_ROUTES: readonly GatedRoute[] = ['/financier/po'];

export interface GatedRouteFlags {
  poFinancing: boolean;
}

export function gatedRouteOpen(route: GatedRoute, flags: GatedRouteFlags): boolean {
  return route === '/financier/po' && flags.poFinancing;
}

/// The same switch as PO_FINANCING_ENABLED (features/profile/config.ts), read
/// here so a server page does not load the wallet setup that module imports.
export const GATED_ROUTE_FLAGS: GatedRouteFlags = {
  poFinancing: process.env.NEXT_PUBLIC_PO_FINANCING_ENABLED === '1',
};
