/// What kind of work a card is, read from its own words, so the market shows
/// a logo job and a box of tape with different marks. Physical goods are
/// checked first: if it ships, it is goods, whatever it is printed with.

export type WorkKind =
  | 'device'
  | 'apparel'
  | 'goods'
  | 'ai'
  | 'code'
  | 'design'
  | 'translation'
  | 'writing'
  | 'media'
  | 'marketing'
  | 'money'
  | 'research'
  | 'teaching'
  | 'advice'
  | 'general';

const RULES: Array<[Exclude<WorkKind, 'general'>, RegExp]> = [
  ['device', /\b(i?phones?|smartphones?|laptops?|tablets?|ipads?|android|macbook|electronics|chargers?|headphones?)\b/],
  ['apparel', /\b(t-?shirts?|shirts?|hoodies?|clothes|clothing|apparel|fabric|dress(es)?|shoes|sneakers|caps?|uniforms?)\b/],
  ['goods', /\b(rolls?|tape|packs?|packaging|units|pieces|pcs|cartons?|crates?|boxes|bags|bottles|bulk|wholesale|shipping|ship|kg|tonnes?|supplies|supply)\b/],
  ['ai', /\b(chat ?bots?|bots?|ai|gpt|llm|agents?|automation|automate)\b/],
  ['code', /\b(websites?|web ?apps?|apps?|dashboards?|apis?|smart contracts?|code|coding|software|github|frontend|backend|scripts?|plugins?|web3|integrations?|developers?|landing pages?|bugs?)\b/],
  ['design', /\b(logos?|designs?|designer|branding|brand identity|figma|illustrations?|ui|ux|mock-?ups?|posters?|flyers?|icons?)\b/],
  ['translation', /\b(translat\w*|interpret\w*|subtitles?|localis\w*|localiz\w*)\b/],
  ['writing', /\b(writ\w*|articles?|blogs?|copy|copywriting|content|question banks?|questions|e-?books?|proofread\w*|resumes?|cvs?|newsletters?)\b/],
  ['media', /\b(videos?|editing|photos?|photography|animations?|audio|podcasts?|music|voice ?overs?|reels?)\b/],
  ['marketing', /\b(marketing|seo|ads|advert\w*|social media|campaigns?|growth|leads?|outreach)\b/],
  ['money', /\b(budgets?|accounting|bookkeeping|tax(es)?|invoices?|payroll|financial models?|forecasts?)\b/],
  ['research', /\b(research|analysis|analy[sz]e|reports?|data|spreadsheets?|surveys?|market study)\b/],
  ['teaching', /\b(tutor\w*|lessons?|courses?|coaching|training|teach\w*|classes)\b/],
  ['advice', /\b(consult\w*|calls?|advice|advisory|interviews?|strategy|mentor\w*|sessions?)\b/],
];

function match(text: string): WorkKind | null {
  const words = text.toLowerCase();
  for (const [kind, pattern] of RULES) if (pattern.test(words)) return kind;
  return null;
}

/// The title decides when it can; the description only breaks a tie the title
/// left open.
export function workKind(title: string, body = ''): WorkKind {
  return match(title) ?? match(body) ?? 'general';
}
