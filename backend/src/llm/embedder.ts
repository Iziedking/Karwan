import { config } from '../config.js';
import { logger } from '../logger.js';

/// Meaning vectors from the embedding model on Bedrock in Karwan's own AWS
/// account (view 95 phase 2). A failure, a slow model or an odd reply gives
/// null and matching goes on without vectors. Only counts and timings are
/// logged, never the text.

export type InputType = 'search_document' | 'search_query';
export type EmbedFn = (texts: string[], inputType: InputType, signal: AbortSignal) => Promise<number[][]>;

/// Cohere's limit per call on Bedrock.
export const EMBED_BATCH_MAX = 96;
const DEFAULT_TIMEOUT_MS = 15_000;

type Log = { info: (obj: object, msg?: string) => void; warn: (obj: object, msg?: string) => void };

/// The live model: Cohere through the installed Bedrock provider. Throws when
/// Bedrock or the model is not set, which embedTexts turns into null.
export const liveEmbed: EmbedFn = async (texts, inputType, signal) => {
  const [{ embedMany }, { bedrockEmbeddingModel }] = await Promise.all([import('ai'), import('./client.js')]);
  const model = config.MEANING_MODEL ? bedrockEmbeddingModel(config.MEANING_MODEL) : null;
  if (!model) throw new Error('no embedding model');
  const { embeddings } = await embedMany({
    model,
    values: texts,
    abortSignal: signal,
    maxRetries: 0,
    providerOptions: { bedrock: { inputType, outputDimension: config.MEANING_DIMENSION } },
  });
  return embeddings;
};

function withTimeout<T>(work: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const ctl = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ctl.abort();
      reject(Object.assign(new Error('timed out'), { name: 'TimeoutError' }));
    }, ms);
  });
  return Promise.race([work(ctl.signal), late]).finally(() => clearTimeout(timer));
}

export async function embedTexts(
  texts: string[],
  inputType: InputType,
  opts: { timeoutMs?: number; embed?: EmbedFn; log?: Log } = {},
): Promise<Float32Array[] | null> {
  if (texts.length === 0) return [];
  const embed = opts.embed ?? liveEmbed;
  const log = opts.log ?? logger;
  const started = Date.now();
  try {
    const out: Float32Array[] = [];
    for (let i = 0; i < texts.length; i += EMBED_BATCH_MAX) {
      const chunk = texts.slice(i, i + EMBED_BATCH_MAX);
      const got = await withTimeout((signal) => embed(chunk, inputType, signal), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      if (got.length !== chunk.length) throw Object.assign(new Error('count'), { name: 'BadReply' });
      out.push(...got.map((v) => Float32Array.from(v)));
    }
    const width = out[0]?.length ?? 0;
    if (width === 0 || out.some((v) => v.length !== width)) throw Object.assign(new Error('width'), { name: 'BadReply' });
    log.info({ count: texts.length, ms: Date.now() - started, inputType }, 'meaning vectors made');
    return out;
  } catch (err) {
    // The error's name only: a provider message may echo the input.
    log.warn({ count: texts.length, ms: Date.now() - started, inputType, error: (err as Error)?.name ?? 'Error' }, 'meaning vectors failed');
    return null;
  }
}
