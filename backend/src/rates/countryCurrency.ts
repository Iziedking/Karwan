import type { DisplayCurrency } from './usdcRates.js';

/// The currency a country reads amounts in by default (view 54). A country
/// whose currency Karwan does not show yet reads in USDC.

const EURO = ['AT', 'BE', 'HR', 'CY', 'EE', 'FI', 'FR', 'DE', 'GR', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PT', 'SK', 'SI', 'ES', 'AD', 'MC', 'SM', 'VA', 'ME', 'XK'];
const WEST_AFRICAN_CFA = ['BJ', 'BF', 'CI', 'GW', 'ML', 'NE', 'SN', 'TG'];

const BY_COUNTRY: Record<string, Exclude<DisplayCurrency, 'USDC'>> = {
  NG: 'NGN',
  US: 'USD',
  GB: 'GBP',
  CN: 'CNY',
  IN: 'INR',
  AE: 'AED',
  KE: 'KES',
  ...Object.fromEntries(EURO.map((c) => [c, 'EUR' as const])),
  ...Object.fromEntries(WEST_AFRICAN_CFA.map((c) => [c, 'XOF' as const])),
};

export function currencyForCountry(country: string | null | undefined): DisplayCurrency {
  return (country && BY_COUNTRY[country.toUpperCase()]) || 'USDC';
}
