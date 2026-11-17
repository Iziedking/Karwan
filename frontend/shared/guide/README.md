# Aman, the only guide

Since 17 Nov 2026 (view 57, "Aman is the only guide") there are no page tours.
Aman answers and points: someone new is asked one question line, and a "where
is it" question gets a Show me button that lights the part of the page.

## Pieces

- `AmanGuide` mounted once in `AppProviders`. It says the one next move, the
  day's hello, the New here line and, for `?point=<id>`, the lit part.
- `point.ts`: `pointFromUrl` reads only a plain id (`[a-z0-9-]{2,40}`),
  `withoutPoint` cleans the link once it shows, `POINT_MS` is 8 s.
- `PointRing`: the ring around a lit part (Figma 355:4454). It never takes a tap.
- `newHere.ts`: who sees New here (a newcomer on Home, the market, a deal or
  Money, not seen this visit, nothing urgent) and its three questions per page,
  taken from `guideCopy.questions`. Not now saves `guideNewHere: 'off'`; an old
  `guideTourOffer: 'off'` counts too.
- `newcomer.ts` / `useNewcomer`: who is new. One with a deal, or set up more
  than a day ago, is known.
- `GuideProvider`: what is left of the old page guide, the experience score fed
  by `recordAction` and the "tips off on this device" flag that coach notes read.

## Rules

1. **Every `data-guide` mark is a point.** Put `data-guide="<id>"` on a real,
   visible element. Then add the id to its page in
   `backend/src/assistant/guidePages.ts` and give it a line in
   `shared/i18n/messages/pointLines.ts` in all five languages.
   `guidePages.test.ts` fails until all three agree.
2. **Every new page is in the guide.** Add it to `GUIDE_PAGES` with what it is
   for, or to `NOT_GUIDED` with a reason. The same test fails otherwise.
3. **The line beside a lit part is ours.** It comes from `pointLines`, never
   from the model, so no one's words can appear on the page that way.
4. **Show me does nothing on its own.** It scrolls to a part and rings it. It
   never presses, fills, submits or moves money.
5. **Plain language.** Sentence case, no em dashes, money in plain words.
   Reduced motion keeps Aman still beside the part.
