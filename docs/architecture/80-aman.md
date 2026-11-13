# 80 · Aman, and the Home box that opens it

Track T6 (channels), roadmap item T6.5 (the assistant does everything a person can, view 31). It changes no money rule and no route: the assistant gets a name, and the box on Home becomes the way into assistant mode. Owner, 13 Nov 2026: "typing on this should open the full assistant bar we hid before.. from here not from a toggle but a toggle can switch it off back to normal view", "we need to give karwan assistant a name", then "use Aman".

## What is hard today

Read from the code on 13 Nov 2026.

- The box on Home ("Ask your assistant", `features/home/components/AskCard.tsx`) opens the Help panel with the words already sent (owner, 6 Nov 2026, view 39). Help is the support desk: it answers and hands over to a person. The full assistant, with its conversations, cards and files, lives at `/assistant`, and since the "Use assistant" switch was parked (`ASSISTANT_MODE_ENTRY = false`) nothing on Home leads there.
- The assistant has no name. The website calls it "your assistant", Telegram greets with "Hi, I'm the Karwan agent", the support email calls it "Karwan assistant", and the model is told it is "Karwan's in-app assistant". Fiverr, read on 13 Nov 2026, gives its agent a name and a box on its home page ("Mira · AI headhunter. Hi, what are you hiring for?") that opens a full chat page.

## The idea

The assistant is called **Aman**. In Arabic, and in Hindi and Urdu, *aman* means safety and protection; in old trade law it was the promise of safe passage given to a foreign merchant. That is what Karwan does for a trade, and it reads the same in all five languages.

Typing in the Home box, or tapping one of its three suggestions, opens assistant mode with that message already sent as a new conversation. The switch at the top of assistant mode ("Aman on") is the way back: off returns to the page the person came from, Home here. The "Use Aman" switch stays parked everywhere else, so the box is the one way in from Home, as the owner asked. Help stays as it is: the support desk, with a person a tap away.

```
Home box ──typed or a suggestion──▶ /assistant (Aman), message sent as a new conversation
   ▲                                         │
   └────────── "Aman on" switched off ◀───────┘   (back to the page it came from)
```

## Where the name shows

| Place | Before | After |
|---|---|---|
| Home box title and label | Ask your assistant | Ask Aman |
| Home box line | It can post, pay and check deals for you. | Your assistant. It can post, pay and check deals for you. |
| Assistant mode greeting | Tell me what you want to do... | I'm Aman, your assistant. Tell me what you want to do... |
| Assistant mode box | Ask or tell Karwan anything | Ask or tell Aman anything |
| The switch | Use assistant / Assistant on / Assistant | Use Aman / Aman on / Aman |
| Telegram first message | Hi, I'm the Karwan agent. | Hi, I'm Aman, your Karwan agent. |
| Support email transcript | Karwan assistant | Aman, Karwan assistant |
| What the model is told | You are Karwan's in-app assistant. | You are Aman, Karwan's in-app assistant. |

Legal pages and help answers keep "the assistant" where they describe what it is; the guide and the canon say once that the assistant is called Aman. Every language keeps "Aman" as written; Arabic writes it أمان, Hindi अमान.

## Where each piece lives

- `frontend/features/home/components/AskCard.tsx`: send carries the words (`carryAsk`), remembers Home (`rememberReturn`) and opens `/assistant`. `AssistantMode.tsx` already sends a carried ask on arrival.
- `frontend/shared/i18n/messages/startFlow.ts`, `assistantMode.ts`, `yourAgent.ts`: the copy above, five languages.
- `backend/src/assistant/knowledge.ts`: the name in what the model is told. `backend/src/channels/onboarding.ts`, `channels/dispatch.ts`: the Telegram greeting. `backend/src/emails/supportTranscript.ts`: the transcript label.
- `backend/src/assistant/platformGuide.ts` and the canon (content repo): the name, and that the Home box opens it.
- Tests: `features/home/litCards.test.ts` (the card opens assistant mode, no longer Help), `e2e/home-desktop.spec.ts` (typed and suggested asks land in assistant mode with the message sent; the switch brings the person back to Home), at phone, tablet and desktop.

## Not in this view

- Trademark and Telegram handle checks for the name, before any public announcement.
- Showing the assistant's steps as it works, rotating example asks in the Home box, and connecting Karwan to other AI tools (seen on Fiverr): each its own view.

## Status

| Piece | State |
|---|---|
| Name and Home box | Approved by the owner 13 Nov 2026 ("use Aman"). Built 13 Nov 2026, not deployed: server and website type checks clean, guide, canon and name tests 64/64, website unit tests 12/12, five-language check ok, browser tests 7/7 at phone, tablet and desktop |
