# 20 · The assistant remembers you

This is track T6, roadmap item T6.4 (assistant memory). The owner agreed it on 22 Oct 2026.

## What is hard today

As of 22 Oct 2026:

- **Web.** Each conversation is saved: up to 50 per account and 40 messages each. A new conversation starts blank, and the assistant cannot see earlier ones.
- **Telegram.** It keeps a short rolling history of its own.
- **Account tools.** Money and deal records come back through tools such as `recall_activity`, but nothing remembers what was *said*.

So "where are we on the tape order we talked about last week?" has no answer.

## The idea in one line

One memory per account, shared by every channel. The assistant writes short notes about what matters, reads them at the start of every turn and can search past conversations. The person can see each note, delete it, or turn memory off.

## How it works

```
person ── web / Help / Telegram ──> runAssistantTurn (assistant/turn.ts)
                                       │ 1. read memory (db/assistantMemory.ts)
                                       │    off → nothing is read or written
                                       │ 2. notes go into the system prompt as background,
                                       │    fenced as data, never as instructions
                                       │ 3. the agent runs, with three memory tools:
                                       │      recall_conversations  search saved web conversations
                                       │      remember_this         "remember I ship to Lagos"
                                       │      forget_memory         "forget that" / "forget everything"
                                       │ 4. after a good reply, the note writer runs
                                       │    (light model, does not hold up the reply)
                                       ▼
                         assistant_memory_v1 (one row per account)
```

**Notes.** A note is one line of up to 200 characters with the date it was written. An account keeps at most 50, and the oldest goes first. The note writer keeps only:

- what the person is looking for or selling;
- preferences (language, budget, delivery place);
- open threads, and anything the assistant said it would follow up.

The writer also replaces notes that a newer one makes stale.

**Never stored.** These rules are checked in code (`assistant/memoryRules.ts`) as well as in the prompt:

- passwords, PINs, seed phrases and keys;
- long digit runs such as card, account and phone numbers;
- wallet addresses and email addresses;
- anything said in a turn where the person asked not to be remembered.

**Control.**

- **Settings, "What Karwan remembers":** every note with its date, a delete button on each, "Forget everything", and an on/off switch.
- **Turning memory off** stops reading and writing at once. The notes are kept until the person deletes them, so turning it back on brings them back.
- **Deleting the account** removes the memory with everything else.

**API.** All four endpoints are session-scoped, under `/api/assistant/memory`:

- `GET /` returns `{ enabled, notes }`;
- `POST /enabled` takes `{ on }`;
- `DELETE /notes/:id` deletes one note;
- `DELETE /` forgets everything.

## What it does not do

- It does not remember other people's messages to you. Direct messages keep their own privacy rules.
- It does not use memory as proof of anything: balances, deals and money always come from a fresh read.
- It does not share notes with anyone, including the other person in a deal.

## Status

| Part | State |
|---|---|
| Store, rules, writer, recall, tools, API, settings, guide | Built 22 Oct 2026, uncommitted |
