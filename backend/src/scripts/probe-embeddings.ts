/// Which embedding model and threshold to use for matching by meaning (view 95
/// phase 2). Embeds the fixed eval set with each model and prints how close
/// every pair is. Read-only: stores nothing, logs no text beyond the fixed
/// eval phrases. Needs BEDROCK_ENABLED and the models enabled in the Bedrock
/// console. Run on the testnet server:
///
///   docker compose exec -T karwan-api node dist/scripts/probe-embeddings.js
///   docker compose exec -T karwan-api node dist/scripts/probe-embeddings.js cohere.embed-v4:0
///
/// Pick the model with the widest gap between the lowest "meet" pair and the
/// highest "not" pair, cross-language pairs included, and set the threshold
/// inside that gap. Write both into the phase 2 spec with the date.
import { embedMany } from 'ai';
import { bedrockEmbeddingModel } from '../llm/client.js';
import { config } from '../config.js';
import { cosine } from '../matching/meaning.js';
import { MEANING_EVAL } from '../matching/meaningEval.js';

const DEFAULT_MODELS = ['cohere.embed-multilingual-v3', 'cohere.embed-v4:0'];

async function vectors(id: string, values: string[], inputType: 'search_query' | 'search_document'): Promise<Float32Array[]> {
  const model = bedrockEmbeddingModel(id);
  if (!model) throw new Error('Bedrock is off: set BEDROCK_ENABLED');
  const bedrock = id.includes('v4') ? { inputType, outputDimension: config.MEANING_DIMENSION } : { inputType };
  const { embeddings } = await embedMany({ model, values, maxRetries: 1, providerOptions: { bedrock } });
  return embeddings.map((v) => Float32Array.from(v));
}

async function probe(id: string): Promise<void> {
  const started = Date.now();
  const queries = await vectors(id, MEANING_EVAL.map((p) => p.a), 'search_query');
  const docs = await vectors(id, MEANING_EVAL.map((p) => p.b), 'search_document');
  console.log(`\n${id}  (${queries[0]?.length ?? 0} dimensions, ${Date.now() - started} ms)`);
  const rows = MEANING_EVAL.map((p, i) => ({ ...p, sim: cosine(queries[i]!, docs[i]!) }));
  for (const r of rows) {
    console.log(`  ${r.meet ? 'meet' : 'not '}  ${r.sim.toFixed(3)}  ${r.a}${r.lang ? ` (${r.lang})` : ''} / ${r.b}`);
  }
  const lowestMeet = Math.min(...rows.filter((r) => r.meet).map((r) => r.sim));
  const highestNot = Math.max(...rows.filter((r) => !r.meet).map((r) => r.sim));
  const gap = lowestMeet - highestNot;
  console.log(`  lowest meet ${lowestMeet.toFixed(3)}  highest not ${highestNot.toFixed(3)}  gap ${gap.toFixed(3)}`);
  console.log(gap > 0 ? `  threshold inside the gap: ${((lowestMeet + highestNot) / 2).toFixed(3)}` : '  no clean gap: this model does not separate the set');
}

async function main() {
  const ids = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_MODELS;
  let failed = 0;
  for (const id of ids) {
    try {
      await probe(id);
    } catch (e) {
      failed += 1;
      console.log(`\nFAIL  ${id}  ${((e as Error).name ?? 'Error')}: ${((e as Error).message ?? '').slice(0, 160)}`);
    }
  }
  process.exit(failed === ids.length ? 1 : 0);
}

void main();
