/// Which models answer right now (view 81). One short plain call and one tool
/// call to every model a chain can reach, each on its own with no fallback.
/// Run it after any key, setting or AWS permission change:
///
///   docker compose exec -T karwan-api node dist/scripts/probe-models.js
///   docker compose --profile mainnet exec -T karwan-api-mainnet node dist/scripts/probe-models.js
///
/// Prints one line per model and call, then which links answered. Costs a few
/// hundred tokens per model. Moves no money and stores nothing.
import { generateText, tool } from 'ai';
import { z } from 'zod';
import { cleanModelText } from '../llm/cleanText.js';
import { modelLinks } from '../llm/client.js';

const balanceTool = tool({
  description: "Get the person's balance in a currency",
  inputSchema: z.object({ currency: z.string() }),
});

async function probe(name: string, run: () => Promise<string>): Promise<boolean> {
  const started = Date.now();
  try {
    const out = await run();
    console.log(`ok    ${name}  ${Date.now() - started} ms  ${out}`);
    return true;
  } catch (e) {
    console.log(`FAIL  ${name}  ${((e as Error).message ?? String(e)).slice(0, 160)}`);
    return false;
  }
}

async function main() {
  const links = modelLinks();
  if (links.length === 0) {
    console.log('No model is configured. Set BEDROCK_ENABLED, ANTHROPIC_API_KEY or OPENROUTER_API_KEY.');
    process.exit(1);
  }
  const answered: string[] = [];
  for (const { name, model } of links) {
    const plain = await probe(`${name} plain`, async () => {
      const r = await generateText({ model, prompt: 'Reply with exactly: ok', maxOutputTokens: 20, maxRetries: 0 });
      return JSON.stringify(cleanModelText(r.text));
    });
    const withTool = await probe(`${name} tool`, async () => {
      const r = await generateText({
        model,
        prompt: 'What is my USDC balance?',
        tools: { get_balance: balanceTool },
        maxOutputTokens: 120,
        maxRetries: 0,
      });
      const call = r.toolCalls[0];
      if (!call) throw new Error(`no tool call, replied ${JSON.stringify(cleanModelText(r.text).slice(0, 80))}`);
      return `${call.toolName} ${JSON.stringify(call.input)}`;
    });
    if (plain && withTool) answered.push(name);
  }
  console.log(answered.length > 0 ? `\n${answered.length} of ${links.length} answer: ${answered.join('; ')}` : '\nNo model answered.');
  process.exit(answered.length > 0 ? 0 : 1);
}

void main();
