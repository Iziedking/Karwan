/// The market's categories (view 44, Figma D1), in the order the chips show
/// them. The frontend keeps the same list in features/market/marketModel.ts.
export const CATEGORY_IDS = ['design', 'tech', 'phones', 'fashion', 'food', 'farm', 'home', 'lessons', 'repairs', 'rentals'] as const;
export type CategoryId = (typeof CATEGORY_IDS)[number];

/// Words that place an offer, matched whole, the first category in list order
/// winning. The seller's own pick always wins over these.
const WORDS: Record<CategoryId, readonly string[]> = {
  design: ['logo', 'logos', 'brand', 'branding', 'flyer', 'flyers', 'poster', 'banner', 'design', 'designer', 'illustration', 'photo', 'photos', 'photography', 'photographer', 'video', 'editing', 'animation', 'menu design', 'business card', 'business cards', 'cards', 'printing'],
  tech: ['website', 'websites', 'landing page', 'app', 'apps', 'code', 'coding', 'developer', 'dashboard', 'software', 'web3', 'wordpress', 'shopify', 'api', 'bot', 'automation', 'smart contract', 'contract deployment', 'gas optimisation', 'gas optimization', 'solidity', 'seo'],
  phones: ['phone', 'phones', 'iphone', 'samsung', 'galaxy', 'tecno', 'infinix', 'itel', 'pixel', 'smartphone', 'android', 'charger', 'airpods'],
  fashion: ['ankara', 'fabric', 'fabrics', 'wax print', 'dress', 'dresses', 'shirt', 'shirts', 't-shirt', 't-shirts', 'shoes', 'sneakers', 'handbag', 'handbags', 'wig', 'wigs', 'tailoring', 'tailor', 'aso ebi', 'lace', 'clothes', 'clothing', 'jewellery', 'jewelry'],
  food: ['cake', 'cakes', 'jollof', 'catering', 'chef', 'meal', 'meals', 'snacks', 'small chops', 'pastries', 'soup', 'suya', 'food'],
  farm: ['rice', 'maize', 'yam', 'cassava', 'beans', 'garri', 'produce', 'farm', 'poultry', 'eggs', 'cocoa', 'cashew', 'sesame', 'palm oil', 'tomatoes', 'pepper', 'grain', 'cotton lint', 'fertiliser', 'fertilizer'],
  home: ['fridge', 'freezer', 'sofa', 'bed', 'mattress', 'furniture', 'table', 'chairs', 'curtains', 'generator', 'cooker', 'gas cooker', 'microwave', 'fan', 'television', 'tv', 'kitchen', 'cleaning'],
  lessons: ['lesson', 'lessons', 'tutor', 'tutoring', 'teacher', 'class', 'classes', 'course', 'coaching', 'waec', 'jamb', 'maths', 'math', 'english lessons', 'jss1', 'jss2', 'jss3', 'ss1', 'ss2', 'ss3'],
  repairs: ['repair', 'repairs', 'fix', 'fixing', 'plumber', 'plumbing', 'electrician', 'mechanic', 'servicing', 'installation', 'ac repair', 'screen replacement'],
  rentals: ['rent', 'rental', 'rentals', 'hire', 'for hire', 'lease', 'shortlet', 'apartment', 'car hire', 'canopy'],
};

const escape = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PATTERNS = CATEGORY_IDS.map((id) => [id, new RegExp(`(^|[^a-z0-9])(${WORDS[id].map(escape).join('|')})(?=$|[^a-z0-9])`)] as const);

export function inferCategory(text: string): CategoryId | null {
  const lower = text.toLowerCase();
  for (const [id, pattern] of PATTERNS) if (pattern.test(lower)) return id;
  return null;
}

export function categoryOf(listing: { category?: CategoryId; title: string; description: string }): CategoryId | null {
  return listing.category ?? inferCategory(`${listing.title} ${listing.description}`);
}

/// The category names as the assistant's cards say them (the web reads its own
/// copy in five languages).
export const CATEGORY_NAMES: Record<CategoryId, string> = {
  design: 'Design',
  tech: 'Tech',
  phones: 'Phones',
  fashion: 'Fashion',
  food: 'Food',
  farm: 'Farm produce',
  home: 'Home',
  lessons: 'Lessons',
  repairs: 'Repairs',
  rentals: 'Rentals',
};
