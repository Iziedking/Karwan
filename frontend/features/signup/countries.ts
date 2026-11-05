import type { DisplayCurrency } from '@/features/money/displayCurrency';

/// Every country a person can pick under their tag (view 54), named in their
/// language by the browser, A to Z.
const CODES = (
  'AF AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BY BE BZ BJ BT BO BA BW BR BN BG BF BI CV KH CM CA CF TD CL CN CO KM CG CD CR CI HR CU CY CZ ' +
  'DK DJ DM DO EC EG SV GQ ER EE SZ ET FJ FI FR GA GM GE DE GH GR GD GT GN GW GY HT HN HK HU IS IN ID IR IQ IE IL IT JM JP JO KZ KE KI XK KW KG ' +
  'LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MR MU MX FM MD MC MN ME MA MZ MM NA NR NP NL NZ NI NE NG KP MK NO OM PK PW PS PA PG PY PE ' +
  'PH PL PT PR QA RO RU RW KN LC VC WS SM ST SA SN RS SC SL SG SK SI SB SO ZA KR SS ES LK SD SR SE CH SY TW TJ TZ TH TL TG TO TT TN TR TM TV UG ' +
  'UA AE GB US UY UZ VU VA VE VN YE ZM ZW'
).split(' ');

export function countryOptions(locale: string): { code: string; name: string }[] {
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames([locale, 'en'], { type: 'region' });
  } catch {
    names = null;
  }
  return CODES.map((code) => ({ code, name: names?.of(code) ?? code })).sort((a, b) => a.name.localeCompare(b.name, locale));
}

/// The country from the browser's language region ("en-NG" is Nigeria), or null.
export function browserCountry(languages: readonly string[]): string | null {
  for (const tag of languages) {
    const region = tag.split('-').find((part, i) => i > 0 && /^[A-Za-z]{2}$/.test(part));
    if (region && CODES.includes(region.toUpperCase())) return region.toUpperCase();
  }
  return null;
}

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

/// The currency a country reads amounts in; the same map the server uses
/// (backend/src/rates/countryCurrency.ts). USDC where Karwan has none yet.
export function currencyForCountry(country: string | null | undefined): DisplayCurrency {
  return (country && BY_COUNTRY[country.toUpperCase()]) || 'USDC';
}
