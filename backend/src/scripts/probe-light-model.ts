/// Proves the cheaper Bedrock model answers Karwan's simple checks correctly
/// before BEDROCK_LIGHT_MODEL is switched on. Calls that model directly, no
/// fallback, so a pass means the cheap model itself did the work.
///
///   docker exec -e BEDROCK_LIGHT_MODEL=us.amazon.nova-lite-v1:0 karwan-api node dist/scripts/probe-light-model.js
///
/// Prints one line per case and a final PASS or FAIL. Moves no money.

import { generateObject } from 'ai';
import { z } from 'zod';
import { bedrockLightModel } from '../llm/client.js';

const relevance = z.object({ relevant: z.boolean(), confidence: z.number(), reasoning: z.string() });
const keywords = z.object({ keywords: z.array(z.string()) });

const CASES: Array<{ brief: string; seller: string; expect: boolean }> = [
  { brief: 'I need a backend engineer to build an API for my app', seller: 'Backend developer, Node.js and Postgres APIs', expect: true },
  { brief: 'Design a logo for my coffee brand', seller: 'Brand designer, logos and identity', expect: true },
  { brief: 'Translate my contract from Arabic to English', seller: 'Legal translator, Arabic and English', expect: true },
  { brief: 'I need a backend engineer to build an API for my app', seller: 'Wood exporter, hardwood timber', expect: false },
  { brief: 'Design a logo for my coffee brand', seller: 'Spanish translator', expect: false },
  { brief: 'Build a game for my website', seller: 'Bookkeeping and payroll for small businesses', expect: false },
];

async function main() {
  if (!bedrockLightModel) {
    console.log('FAIL: set BEDROCK_ENABLED=1 and BEDROCK_LIGHT_MODEL to probe it.');
    process.exit(1);
  }
  let wrong = 0;
  for (const c of CASES) {
    const started = Date.now();
    try {
      const r = await generateObject({
        model: bedrockLightModel,
        schema: relevance,
        prompt: `Could this seller credibly fulfill this request? Answer relevant true or false, a confidence from 0 to 1, and one short reason.\nRequest: ${c.brief}\nSeller: ${c.seller}`,
      });
      const ok = r.object.relevant === c.expect;
      if (!ok) wrong += 1;
      console.log(`${ok ? 'ok  ' : 'WRONG'} ${Date.now() - started}ms  ${c.brief.slice(0, 40)} / ${c.seller.slice(0, 30)} -> ${r.object.relevant}`);
    } catch (err) {
      wrong += 1;
      console.log(`ERROR ${(err as Error).message.slice(0, 160)}`);
    }
  }
  try {
    const k = await generateObject({
      model: bedrockLightModel,
      schema: keywords,
      prompt: 'Extract up to 8 short lowercase skill tags for matching from: "I need a React developer to build a dashboard with charts and login"',
    });
    console.log(`tags: ${k.object.keywords.join(', ')}`);
  } catch (err) {
    wrong += 1;
    console.log(`ERROR tags ${(err as Error).message.slice(0, 160)}`);
  }
  console.log(wrong === 0 ? 'PASS' : `FAIL: ${wrong} wrong or failed`);
  process.exit(wrong === 0 ? 0 : 1);
}

void main();
