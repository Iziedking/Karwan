import { wrapLanguageModel, type LanguageModel } from 'ai';
import type { LanguageModelV3, LanguageModelV3Prompt } from '@ai-sdk/provider';

/// Bedrock refuses a cache point on a model that has no prompt caching, so a
/// link like that gets the call with the Bedrock cache points taken out.
/// Other providers' options are left as they are (view 84).
export function withoutCachePoints(model: LanguageModel): LanguageModel {
  return wrapLanguageModel({
    model: model as LanguageModelV3,
    middleware: {
      specificationVersion: 'v3',
      transformParams: async ({ params }) => ({ ...params, prompt: stripped(params.prompt) }),
    },
  });
}

/// The hour-long cache is for Claude only; Bedrock refuses the whole call when
/// another model gets it. Those models keep the ordinary five-minute cache.
export function fitCachePoints(model: LanguageModel): LanguageModel {
  if (/anthropic\./.test((model as LanguageModelV3).modelId ?? '')) return model;
  return wrapLanguageModel({
    model: model as LanguageModelV3,
    middleware: {
      specificationVersion: 'v3',
      transformParams: async ({ params }) => ({ ...params, prompt: withoutHour(params.prompt) }),
    },
  });
}

function withoutHour(prompt: LanguageModelV3Prompt): LanguageModelV3Prompt {
  return prompt.map((message) => {
    const point = message.providerOptions?.bedrock?.cachePoint as Record<string, unknown> | undefined;
    if (!point || !('ttl' in point)) return message;
    const { ttl: _drop, ...rest } = point;
    return { ...message, providerOptions: { ...message.providerOptions, bedrock: { ...message.providerOptions!.bedrock, cachePoint: rest } } } as typeof message;
  });
}

function stripped(prompt: LanguageModelV3Prompt): LanguageModelV3Prompt {
  return prompt.map((message) => {
    const bedrock = message.providerOptions?.bedrock;
    if (!bedrock || !('cachePoint' in bedrock)) return message;
    const { cachePoint: _drop, ...rest } = bedrock;
    return { ...message, providerOptions: { ...message.providerOptions, bedrock: rest } };
  });
}
