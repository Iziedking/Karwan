/// How long the assistant makes a person wait (view 84). Runs the same ten
/// turns for one test account and prints, per turn: the time to the first
/// tool call, the whole turn, and the cache tokens read and written.
///
///   docker compose exec -T karwan-api node dist/scripts/measure-assistant-wait.js --account 0x... [--provider bedrock|anthropic] [--model <id>] [--no-cache]
///
/// Testnet only: it reads the account like the assistant does and prepares
/// cards it never confirms, so nothing moves. Costs about ten assistant turns
/// of model tokens per run.
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { createAnthropic } from '@ai-sdk/anthropic';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import { wrapLanguageModel, type LanguageModel } from 'ai';
import type { LanguageModelV3, LanguageModelV3Prompt } from '@ai-sdk/provider';
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
  const provider = arg('--provider') ?? 'bedrock';
  if (provider !== 'bedrock' && provider !== 'anthropic') throw new Error('--provider is bedrock or anthropic');
  if (provider === 'anthropic' && !config.ANTHROPIC_API_KEY) throw new Error('no Anthropic key set');
  const modelId = arg('--model') ?? (provider === 'bedrock' ? config.BEDROCK_MODEL : config.ASSISTANT_MODEL);
  const cache = !process.argv.includes('--no-cache');
  const base =
    provider === 'bedrock'
      ? createAmazonBedrock({ region: config.BEDROCK_REGION, credentialProvider: fromNodeProviderChain() })(modelId)
      : createAnthropic({ apiKey: config.ANTHROPIC_API_KEY })(modelId);

  // Keeps the cache usage of every call this turn makes.
  let usage = { read: 0, write: 0 };
  const counted = wrapLanguageModel({
    model: base as LanguageModelV3,
    middleware: {
      specificationVersion: 'v3',
      wrapGenerate: async ({ doGenerate }) => {
        const out = await doGenerate();
        usage.read += out.usage.inputTokens.cacheRead ?? 0;
        usage.write += out.usage.inputTokens.cacheWrite ?? 0;
        return out;
      },
    },
  });
  const model: LanguageModel = cache ? counted : withoutAnthropicCache(withoutCachePoints(counted));

  console.log(`${provider} ${modelId}, cache ${cache ? 'on' : 'off'}`);
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

/// For --no-cache on the direct Anthropic path: drops the cache marks the
/// assistant puts on its system message.
function withoutAnthropicCache(model: LanguageModel): LanguageModel {
  const strip = (prompt: LanguageModelV3Prompt): LanguageModelV3Prompt =>
    prompt.map((message) => {
      const anthropic = message.providerOptions?.anthropic;
      if (!anthropic || !('cacheControl' in anthropic)) return message;
      const { cacheControl: _drop, ...rest } = anthropic;
      return { ...message, providerOptions: { ...message.providerOptions, anthropic: rest } };
    });
  return wrapLanguageModel({
    model: model as LanguageModelV3,
    middleware: { specificationVersion: 'v3', transformParams: async ({ params }) => ({ ...params, prompt: strip(params.prompt) }) },
  });
}

main().then(() => process.exit(0), (e) => {
  console.error((e as Error).message);
  process.exit(1);
});
