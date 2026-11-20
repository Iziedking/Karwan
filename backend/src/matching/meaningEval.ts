/// The eval set for matching by meaning (view 95 phase 2 spec, decided 20 Nov
/// 2026). The probe embeds side a as a search query and side b as a document
/// and prints how close each pair is; the model and the threshold are picked
/// from that, never guessed. Extendable: add pairs, keep the counts honest.

export interface EvalPair {
  a: string;
  b: string;
  /// Should a request for a reach a seller of b?
  meet: boolean;
  /// The language of side a when it is not English.
  lang?: string;
}

export const MEANING_EVAL: readonly EvalPair[] = [
  { a: 'fashion designer', b: 'tailor', meet: true },
  { a: 'someone to sew aso ebi for my wedding', b: 'tailor, native wears', meet: true },
  { a: 'tela', b: 'tailor', meet: true, lang: 'ha' },
  { a: 'couturière', b: 'dressmaker', meet: true, lang: 'fr' },
  { a: 'logo for my bakery', b: 'graphic designer', meet: true },
  { a: 'fix my generator', b: 'generator mechanic', meet: true },
  { a: 'someone to wire my new flat', b: 'electrician', meet: true },
  { a: 'small chops for 50 guests', b: 'caterer', meet: true },
  { a: 'خياط', b: 'tailor', meet: true, lang: 'ar' },
  { a: 'website for my shop', b: 'web developer', meet: true },
  { a: 'graphic designer', b: 'tailor', meet: false },
  { a: 'fabric seller', b: 'tailor', meet: false },
  { a: 'photographer', b: 'videographer', meet: false },
  { a: 'spare parts seller', b: 'mechanic', meet: false },
  { a: 'logo design', b: 'bookkeeper', meet: false },
  { a: 'house cleaning', b: 'dry cleaning', meet: false },
];
