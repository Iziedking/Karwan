export interface LandingEditorialCopy {
  kicker: string; titleFirst: string; titleLast: string; lead: string;
  open: string; trade: string; startLink: string;
  introLabel: string; introTitle: string; introBody: string; marketLink: string;
  bringLabel: string; bringTitle: string; bringBody: string;
  findLabel: string; findTitle: string; findBody: string;
  recordLabel: string; recordTitle: string; recordBody: string;
  terms: string; funded: string; delivery: string; reviewed: string; released: string;
  both: string; buyer: string; seller: string; receipt: string; exampleNote: string;
  limitTitle: string; limitBody: string; rulesLink: string; closeTitle: string; closeBody: string;
  routes: {
    label: string; title: string; body: string;
    cities: Record<'kano' | 'hamburg' | 'lagos' | 'london' | 'johannesburg' | 'shenzhen' | 'nairobi' | 'dubai' | 'toronto'
      | 'dakar' | 'casablanca' | 'cairo' | 'addisAbaba' | 'kinshasa', string>;
  };
}
