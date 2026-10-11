import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';

/// The chat core serves every channel, so it never reaches into one.
test('the chat core imports no channel adapter', () => {
  const dir = new URL('./', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));
  for (const core of ['dispatch.ts', 'executor.ts', 'identity.ts', 'inProcess.ts', 'openLink.ts', 'openRoute.ts', 'render.ts', 'media.ts', 'sender.ts', 'notifier.ts', 'types.ts']) {
    assert.ok(files.includes(core), `chat/${core} exists`);
  }
  for (const f of files) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    assert.equal(/from '\.\.\/(whatsapp|telegram)\//.test(src), false, `chat/${f} imports a channel`);
  }
});
