import assert from 'node:assert/strict';
import test from 'node:test';
import { generateText, stepCountIs, tool } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { z } from 'zod';
import { toolCallEvents, type TurnEvent } from './turnEvents.js';

const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } };

/// First step calls two tools, the second answers.
function twoToolModel() {
  let step = 0;
  return new MockLanguageModelV3({
    doGenerate: async () => {
      step += 1;
      if (step === 1) {
        return {
          content: [
            { type: 'tool-call', toolCallId: 'a', toolName: 'get_my_balance', input: '{}' },
            { type: 'tool-call', toolCallId: 'b', toolName: 'list_my_deals', input: '{}' },
          ],
          finishReason: { unified: 'tool-calls', raw: 'tool_use' },
          usage,
          warnings: [],
        };
      }
      return { content: [{ type: 'text', text: 'Done' }], finishReason: { unified: 'stop', raw: 'stop' }, usage, warnings: [] };
    },
  });
}

const tools = {
  get_my_balance: tool({ description: 'b', inputSchema: z.object({}), execute: async () => ({ usdc: '1' }) }),
  list_my_deals: tool({ description: 'd', inputSchema: z.object({}), execute: async () => ({ deals: [] }) }),
};

test('each tool call is reported in order', async () => {
  const events: TurnEvent[] = [];
  const out = await generateText({ model: twoToolModel(), prompt: 'hi', tools, stopWhen: stepCountIs(3), ...toolCallEvents((e) => events.push(e)) });
  assert.equal(out.text, 'Done');
  assert.deepEqual(events, [
    { kind: 'status', tool: 'get_my_balance' },
    { kind: 'status', tool: 'list_my_deals' },
  ]);
});

test('a callback that throws never breaks the turn', async () => {
  const out = await generateText({
    model: twoToolModel(), prompt: 'hi', tools, stopWhen: stepCountIs(3),
    ...toolCallEvents(() => { throw new Error('x'); }),
  });
  assert.equal(out.text, 'Done');
});

test('no callback, no hook', () => {
  assert.deepEqual(toolCallEvents(), {});
});
