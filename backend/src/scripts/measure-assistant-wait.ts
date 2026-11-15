/// How long the assistant makes a person wait (view 84). Runs the same ten
/// turns for one test account and prints, per turn: the time to the first
/// tool call, the whole turn, and the cache tokens read and written.
///
///   docker compose exec -T karwan-api node dist/scripts/measure-assistant-wait.js --account 0x... [--model <bedrock id>] [--no-cache]
///
/// Testnet only: it reads the account like the assistant does and prepares
/// cards it never confirms, so nothing moves. Costs about ten assistant turns
/// of model tokens per run.
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import { wrapLanguageModel, type LanguageModel } from 'ai';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import { config } from '../config.js';
import { runAssistantAgent } from '../assistant/agent.js';
import { withoutCachePoints } from '../llm/cachePoints.js';

const TURNS = [
  'What is my balance?',
  'Show my deals.',
  'Where does my most recent deal stand?',
  'What is waiting on me?',
  'Find me someone who makes websites.',
  'How does a deal keep my money safe?',
  'How do I withdraw to my bank?',
  'What does my record say?',
  'I need a logo for 50 USDC by Friday.',
  'And what did my agent do this week?',
];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main() {
  if (config.ARC_NETWORK === 'mainnet') throw new Error('testnet only');
  const account = arg('--account');
  if (!account) throw new Error('--account 0x... is required');
  const modelId = arg('--model') ?? config.BEDROCK_MODEL;
  const cache = !process.argv.includes('--no-cache');
  const bedrock = createAmazonBedrock({ region: config.BEDROCK_REGION, credentialProvider: fromNodeProviderChain() });

  // Keeps the cache usage of every call this turn makes.
  let usage = { read: 0, write: 0 };
  const counted = wrapLanguageModel({
    model: bedrock(modelId) as LanguageModelV3,
    middleware: {
      specificationVersion: 'v3',
      wrapGenerate: async ({ doGenerate }) => {
        const out = await doGenerate();
        const u = (out.providerMetadata?.bedrock?.usage ?? {}) as { cacheReadInputTokens?: number; cacheWriteInputTokens?: number };
        usage.read += u.cacheReadInputTokens ?? 0;
        usage.write += u.cacheWriteInputTokens ?? 0;
        return out;
      },
    },
  });
  const model: LanguageModel = cache ? counted : withoutCachePoints(counted);

  console.log(`model ${modelId}, cache ${cache ? 'on' : 'off'}`);
  console.log('turn  first tool ms  total ms  cache read  cache write');
  for (const [i, question] of TURNS.entries()) {
    usage = { read: 0, write: 0 };
    const started = Date.now();
    let firstTool: number | null = null;
    try {
      await runAssistantAgent({
        address: account.toLowerCase(),
        method: 'web3',
        messages: [{ role: 'user', content: question }],
        mode: 'assistant',
        model,
        onStep: (e) => {
          if (e.kind === 'status' && firstTool === null) firstTool = Date.now() - started;
        },
      });
      console.log(`${String(i + 1).padStart(4)}  ${String(firstTool ?? '-').padStart(13)}  ${String(Date.now() - started).padStart(8)}  ${String(usage.read).padStart(10)}  ${String(usage.write).padStart(11)}`);
    } catch (e) {
      console.log(`${String(i + 1).padStart(4)}  FAIL ${((e as Error).message ?? String(e)).slice(0, 120)}`);
    }
  }
}

main().then(() => process.exit(0), (e) => {
  console.error((e as Error).message);
  process.exit(1);
});
