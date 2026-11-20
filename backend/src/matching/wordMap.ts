/// The word map (view 95): the names people use for the same work, so a buyer who
/// asks for a fashion designer meets a seller who calls themselves a tailor, with
/// no model. A group holds close names only; work that is related but different
/// (a tailor and a fabric seller) sits in its own group.
///
/// To add a name, put it in its group here. A name in a language other than
/// English goes in only once a speaker on the team has checked it.

export type NameLang = 'en' | 'fr' | 'ar' | 'hi' | 'sw' | 'ha' | 'yo' | 'ig' | 'pcm';

export interface WordGroup {
  id: string;
  names: Array<{ text: string; lang: NameLang }>;
}

const en = (...texts: string[]) => texts.map((text) => ({ text, lang: 'en' as const }));

export const WORD_GROUPS: readonly WordGroup[] = [
  {
    id: 'tailoring',
    names: [
      ...en('tailor', 'fashion designer', 'dressmaker', 'seamstress', 'clothier', 'clothes maker'),
      { text: 'couturier', lang: 'fr' },
      { text: 'couturière', lang: 'fr' },
      { text: 'tailleur', lang: 'fr' },
      { text: 'tela', lang: 'ha' },
      { text: 'fundi cherehani', lang: 'sw' },
      { text: 'darzi', lang: 'hi' },
      { text: 'दर्ज़ी', lang: 'hi' },
      { text: 'خياط', lang: 'ar' },
    ],
  },
  { id: 'hair', names: en('hairdresser', 'hair stylist', 'hairstylist', 'braider', 'hair braiding', 'salon') },
  { id: 'barbing', names: en('barber', 'barbing', 'haircut') },
  { id: 'makeup', names: en('makeup artist', 'mua', 'beautician') },
  { id: 'photography', names: en('photographer', 'photography', 'photoshoot') },
  { id: 'video', names: en('videographer', 'video coverage', 'cinematographer') },
  { id: 'video-editing', names: en('video editor', 'video editing') },
  { id: 'graphic-design', names: en('graphic designer', 'graphic design', 'logo designer', 'logo design', 'brand designer', 'flyer design') },
  { id: 'websites', names: en('web developer', 'website developer', 'website designer', 'web designer', 'website', 'wordpress developer') },
  { id: 'mobile-apps', names: en('app developer', 'mobile developer', 'android developer', 'ios developer', 'flutter developer') },
  { id: 'writing', names: en('writer', 'copywriter', 'content writer', 'article writer', 'ghostwriter') },
  { id: 'social-media', names: en('social media manager', 'social media management', 'community manager') },
  { id: 'translation', names: en('translator', 'translation', 'interpreter') },
  { id: 'tutoring', names: en('tutor', 'lesson teacher', 'home lessons', 'private teacher') },
  { id: 'electrical', names: en('electrician', 'electrical work', 'wiring') },
  { id: 'plumbing', names: en('plumber', 'plumbing') },
  { id: 'carpentry', names: en('carpenter', 'furniture maker', 'carpentry', 'woodwork') },
  { id: 'auto-repair', names: en('mechanic', 'auto repair', 'car repair', 'panel beater') },
  { id: 'phone-repair', names: en('phone repair', 'phone technician', 'phone engineer') },
  { id: 'generator-repair', names: en('generator repair', 'gen repair', 'generator mechanic') },
  { id: 'cooling', names: en('ac repair', 'air conditioner repair', 'refrigeration', 'fridge repair') },
  { id: 'painting', names: en('house painter', 'painting work', 'wall painting') },
  { id: 'tiling', names: en('tiler', 'tiling', 'floor tiles') },
  { id: 'welding', names: en('welder', 'welding', 'fabricator', 'metal fabrication') },
  { id: 'masonry', names: en('mason', 'bricklayer', 'block work') },
  { id: 'catering', names: en('caterer', 'catering', 'cook', 'chef', 'small chops') },
  { id: 'baking', names: en('baker', 'cake maker', 'cakes', 'pastry') },
  { id: 'events', names: en('event planner', 'event planning', 'event decorator') },
  { id: 'music', names: en('dj', 'disc jockey') },
  { id: 'hosting', names: en('mc', 'compere', 'master of ceremony', 'hype man') },
  { id: 'driving', names: en('driver', 'chauffeur') },
  { id: 'delivery', names: en('dispatch rider', 'delivery rider', 'dispatch', 'courier', 'logistics') },
  { id: 'cleaning', names: en('cleaner', 'cleaning', 'house cleaning') },
  { id: 'laundry', names: en('laundry', 'dry cleaner', 'dry cleaning') },
  { id: 'bookkeeping', names: en('accountant', 'bookkeeper', 'bookkeeping') },
];

/// The endings a name may take and still be that name: tailor, tailors,
/// tailoring; mason, masonry; baker, bakery. Never any other ending, so
/// "tutorial" is not "tutor".
const ENDINGS = ['', 's', 'es', 'y', 'ry', 'ries', 'ing', 'ings', 'er', 'ers'];

/// Every word, any length, in any script, lower case. Unlike textWords this keeps
/// short words, so "dj", "mc" and "ac" can be names.
function wordsOf(text: string): string[] {
  return text.normalize('NFC').toLowerCase().split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean);
}

interface Name {
  group: string;
  words: string[];
  forms: Array<Set<string>>;
}

const NAMES: Name[] = WORD_GROUPS.flatMap((g) =>
  g.names.map((n) => {
    const words = wordsOf(n.text);
    return { group: g.id, words, forms: words.map((w) => new Set(ENDINGS.map((e) => w + e))) };
  }),
);

/// Names by every form of their first word, so a tag is read in one pass.
const BY_FIRST = new Map<string, Name[]>();
for (const name of NAMES) {
  for (const form of name.forms[0] ?? []) {
    const list = BY_FIRST.get(form) ?? [];
    list.push(name);
    BY_FIRST.set(form, list);
  }
}

export interface MapHits {
  /// The groups the tags hit.
  groups: Set<string>;
  /// For each group, the words of the tags that hit it.
  words: Map<string, Set<string>>;
}

/// The runs of words a phrase may sit in. Tags of one word in a row are read
/// as one run, because find passes a need as its words in order; a tag of
/// several words is its own run, so unrelated tags never join into a phrase.
function runsOf(tags: readonly string[]): string[][] {
  const runs: string[][] = [];
  let run: string[] = [];
  for (const tag of tags) {
    const words = wordsOf(tag);
    const [only] = words;
    if (words.length === 1 && only !== undefined) { run.push(only); continue; }
    if (run.length) { runs.push(run); run = []; }
    if (words.length) runs.push(words);
  }
  if (run.length) runs.push(run);
  return runs;
}

const cache = new Map<string, MapHits>();
const CACHE_MAX = 5000;

/// The groups a set of tags hits. A name hits when its words stand next to each
/// other, in order, inside one tag; where names overlap, the longest wins, so
/// "dry cleaner" is laundry and not cleaning.
export function mapHits(tags: readonly string[]): MapHits {
  const key = tags.join('\u0001');
  const kept = cache.get(key);
  if (kept) return kept;
  const hits: MapHits = { groups: new Set(), words: new Map() };
  for (const words of runsOf(tags)) {
    const spans: Array<{ at: number; len: number; group: string }> = [];
    for (let i = 0; i < words.length; i++) {
      for (const name of BY_FIRST.get(words[i] ?? '') ?? []) {
        const len = name.words.length;
        if (i + len > words.length) continue;
        let all = true;
        for (let k = 1; k < len; k++) {
          if (!name.forms[k]?.has(words[i + k] ?? '')) { all = false; break; }
        }
        if (all) spans.push({ at: i, len, group: name.group });
      }
    }
    spans.sort((a, b) => b.len - a.len || a.at - b.at);
    const taken = new Array<boolean>(words.length).fill(false);
    for (const s of spans) {
      let free = true;
      for (let k = s.at; k < s.at + s.len; k++) if (taken[k]) { free = false; break; }
      if (!free) continue;
      for (let k = s.at; k < s.at + s.len; k++) taken[k] = true;
      hits.groups.add(s.group);
      const set = hits.words.get(s.group) ?? new Set<string>();
      for (const w of words.slice(s.at, s.at + s.len)) set.add(w);
      hits.words.set(s.group, set);
    }
  }
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, hits);
  return hits;
}
