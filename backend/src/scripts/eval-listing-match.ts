/// The listing matcher against the live model, on cases taken from real
/// requests (26 Oct 2026: a "four-email sequence for developers" matched a
/// request for a backend engineer at 0.95, and real offers came back as
/// "mis-posted as a request"). A few model calls; nothing is written.
///
///   node dist/scripts/eval-listing-match.js

import { generateObject } from 'ai';
import { llmModel } from '../llm/client.js';
import { buildListingMatchPrompt, matchDecisionSchema } from '../routes/listings.js';

const BACKEND = { briefText: 'Backend engineer to build an API service for our app, Node.js and Postgres', budgetUsdc: '120', termsHash: '0x' };

const cases: Array<{ name: string; title: string; description: string; brief?: typeof BACKEND; expect: boolean }> = [
  { name: 'email sequence for developers', title: 'Developer onboarding email sequence', description: 'I write a four-email sequence that onboards developers to your API.', expect: false },
  { name: 'developer emails, second wording', title: 'Emails for developer audiences', description: 'Four emails written for developers: welcome, docs, first call, upgrade.', expect: false },
  { name: 'backend developer offer', title: 'Backend API development', description: 'I build REST APIs in Node.js with Postgres. Auth, payments, deploys.', expect: true },
  { name: 'full-stack developer offer', title: 'Full-stack web developer', description: 'Next.js front end and Node.js back end, databases and hosting set up.', expect: true },
  { name: 'game concept art', title: 'Game character concept art', description: 'Concept art for game characters, three poses.', expect: false },
  { name: 'request posted as a listing', title: 'Looking for a backend developer', description: 'I need someone to build my API. Hiring now.', expect: false },
  {
    name: 'Spanish to Arabic translation',
    title: 'ES to AR translation',
    description: 'I translate Spanish documents into Arabic, 2,000 words a day.',
    brief: { briefText: 'Need a Spanish to Arabic translator for a 5,000 word contract', budgetUsdc: '60', termsHash: '0x' },
    expect: true,
  },
];

async function main() {
  let passed = 0;
  for (const c of cases) {
    const listing = { title: c.title, description: c.description, askingPriceUsdc: '100' } as never;
    const { object } = await generateObject({ model: llmModel, schema: matchDecisionSchema, prompt: buildListingMatchPrompt(listing, c.brief ?? BACKEND) });
    const matched = object.match && object.confidence >= 0.4;
    const ok = matched === c.expect;
    if (ok) passed += 1;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.name}: match=${object.match} (${object.confidence}) needs="${object.briefNeeds ?? ''}" delivers="${object.listingDelivers ?? ''}"`);
  }
  console.log(`\n${passed}/${cases.length} as expected`);
  return passed === cases.length ? 0 : 1;
}

// The route module starts timers on import, so the exit is explicit.
main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
