/// Proves the pass for Claude at Anthropic from inside the running API (view 89):
/// asks AWS for a note as the server's role, trades it for a pass, then makes
/// one short call with it. Run it after setting the pass settings:
///
///   docker compose exec -T karwan-api node dist/scripts/probe-anthropic-pass.js
///   docker compose --profile mainnet exec -T karwan-api-mainnet node dist/scripts/probe-anthropic-pass.js
///
/// Prints when the pass ends and the reply. Never prints the note or the pass.
/// Costs one short model call. Moves no money and stores nothing.
import { generateText } from 'ai';
import { config } from '../config.js';
import { anthropicHow, anthropicKeeper, anthropicModel } from '../llm/client.js';

async function main() {
  if (anthropicHow !== 'pass' || !anthropicKeeper) {
    console.log(`No pass is set up (Claude at Anthropic: ${anthropicHow ?? 'off'}). Set ANTHROPIC_FEDERATION_RULE_ID and ANTHROPIC_ORGANIZATION_ID.`);
    process.exit(1);
  }
  const started = Date.now();
  await anthropicKeeper.get();
  const endsAt = anthropicKeeper.expiresAt();
  console.log(`pass ok in ${Date.now() - started} ms, ends in ${endsAt ? Math.round((endsAt - Date.now()) / 1000) : '?'} s`);
  const model = anthropicModel(config.ASSISTANT_MODEL)!;
  const out = await generateText({ model, prompt: 'Reply with exactly: ok', maxOutputTokens: 20, maxRetries: 0 });
  console.log(`call ok with ${config.ASSISTANT_MODEL}: ${JSON.stringify(out.text.trim())}`);
  process.exit(0);
}

main().catch((e: unknown) => {
  console.log(`FAIL  ${((e as Error).message ?? String(e)).slice(0, 300)}`);
  process.exit(1);
});
