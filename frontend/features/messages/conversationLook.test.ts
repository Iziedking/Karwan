import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/// Messages, notifications, settings, setup and sign-in in the new look (view
/// 48, batch 9g, Figma page "Batch 9 · Messages, alerts, sign-in, setup").
///
///   npx tsx --test features/messages/conversationLook.test.ts

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const FILES = {
  conversation: source('./ConversationView.tsx'),
  bell: source('../notifications/components/NotificationBell.tsx'),
  settings: source('../settings/components/SettingsBand.tsx'),
  memory: source('../settings/components/AssistantMemoryRows.tsx'),
  setup: source('../setup/SetupFlow.tsx'),
  setupParts: source('../setup/SetupParts.tsx'),
  auth: source('../signup/components/AuthCard.tsx'),
  login: source('../../shared/components/LoginModal.tsx'),
  email: source('../profile/components/ProfileEmailButton.tsx'),
  telegram: source('../telegram/components/TelegramConnectCard.tsx'),
};

test('no old landing tokens, nothing bold, small or in mono capitals', () => {
  for (const [name, s] of Object.entries(FILES)) {
    assert.doesNotMatch(s, /--lp-|--color-accent|var\(--accent\)|--accent-ink|--tint\b/, name);
    assert.doesNotMatch(s, /font-(extra)?bold/, name);
    assert.doesNotMatch(s, /text-\[(9|1[0-3])(\.\d+)?px\]/, name);
    assert.doesNotMatch(s, /uppercase tracking-\[/, name);
  }
});

test('your own messages are ink, Start a deal is a quiet button, and Send is the green one', () => {
  const { conversation } = FILES;
  assert.match(conversation, /rounded-ee-\[6px\] bg-\[var\(--ink\)\]/);
  assert.match(conversation, /buttonClasses\(\{ variant: 'secondary'/);
  assert.match(conversation, /rounded-full bg-\[var\(--action\)\]/);
});

test('an unread notification keeps its green dot, never a green row', () => {
  const { bell } = FILES;
  assert.doesNotMatch(bell, /color-mix\(in_srgb,var\(--action\)/);
  assert.match(bell, /group\.read \? '' : 'bg-\[var\(--ash\)\]'/);
  assert.match(bell, /size-2\.5 shrink-0 rounded-full bg-\[var\(--action\)\]/);
});

test('a picked setup card is marked in ink, and the question reads at 26px', () => {
  const { setup, setupParts } = FILES;
  assert.match(setupParts, /on \? 'border-\[var\(--ink\)\]/);
  assert.match(setupParts, /border-\[var\(--ink\)\] bg-\[var\(--ink\)\] text-\[var\(--canvas\)\]/);
  assert.doesNotMatch(setup, /text-\[28px\]/);
  assert.match(setup, /text-\[26px\] font-semibold/);
});
