import assert from 'node:assert/strict';
import test from 'node:test';
import { initRun, nextStep, runBusy, runFinished, setStep } from './startRun';

test('steps run strictly in order', () => {
  let run = initRun(['setup', 'move', 'post']);
  assert.equal(nextStep(run), 'setup');
  run = setStep(run, 'setup', 'running');
  assert.equal(nextStep(run), null);
  assert.equal(runBusy(run), true);
  run = setStep(run, 'setup', 'done');
  assert.equal(nextStep(run), 'move');
});

test('post never starts while the move is slow, and starts once it is done', () => {
  let run = initRun(['move', 'post']);
  run = setStep(run, 'move', 'slow');
  assert.equal(nextStep(run), null);
  assert.equal(runBusy(run), true);
  run = setStep(run, 'move', 'done');
  assert.equal(nextStep(run), 'post');
});

test('a failed step stops the run and nothing after it starts', () => {
  let run = initRun(['move', 'post']);
  run = setStep(run, 'move', 'failed');
  assert.equal(nextStep(run), null);
  assert.equal(runBusy(run), false);
  assert.equal(runFinished(run), false);
});

test('a finished run carries what it created', () => {
  let run = initRun(['post']);
  run = setStep(run, 'post', 'done', '0xjob');
  assert.equal(runFinished(run), true);
  assert.equal(run.createdId, '0xjob');
});

test('a done step never goes back to running (no second post)', () => {
  let run = initRun(['post']);
  run = setStep(run, 'post', 'done', '0xjob');
  run = setStep(run, 'post', 'running');
  assert.equal(run.steps[0].status, 'done');
});

test('only a refusal or a definite revert fails a post; anything unclear waits', async () => {
  const { postOutcome } = await import('./startRun');
  assert.equal(postOutcome({ status: 400, message: 'invalid body' }), 'failed');
  assert.equal(postOutcome({ status: 409, message: 'insufficient buyer balance' }), 'failed');
  assert.equal(postOutcome({ status: 502, message: 'postJob reverted' }), 'failed');
  assert.equal(postOutcome({ status: 502, message: 'postJob failed' }), 'slow');
  assert.equal(postOutcome({ status: 500, message: 'x' }), 'slow');
  assert.equal(postOutcome(null), 'slow');
});

test('the sheet can close while a step waits, never while one is running', async () => {
  const { runClosable } = await import('./startRun');
  let run = initRun(['move', 'post']);
  assert.equal(runClosable(run), true);
  run = setStep(run, 'move', 'running');
  assert.equal(runClosable(run), false);
  run = setStep(run, 'move', 'slow');
  assert.equal(runClosable(run), true);
});

test('a started run owns the sheet, whatever the live plan now says', async () => {
  const { sheetMode } = await import('./startRun');
  const ready = { kind: 'ready' as const, steps: ['move' as const, 'post' as const], moveUsdc: 100, source: 'balance' as const };
  assert.equal(sheetMode({ kind: 'loading' }, null), 'loading');
  assert.equal(sheetMode({ kind: 'needsMoney', shortfall: 5 }, null), 'needsMoney');
  assert.equal(sheetMode(ready, null), 'begin');
  let run = initRun(['move', 'post']);
  run = setStep(run, 'move', 'done');
  run = setStep(run, 'post', 'slow');
  assert.equal(sheetMode({ kind: 'needsMoney', shortfall: 5 }, run), 'checkAgain');
  run = setStep(run, 'post', 'failed');
  assert.equal(sheetMode({ kind: 'loading' }, run), 'tryAgain');
  assert.equal(sheetMode(ready, setStep(initRun(['post']), 'post', 'running')), 'running');
});
