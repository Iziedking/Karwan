# Aman, the only guide

Since 17 Nov 2026 (view 57, "Aman is the only guide") there are no page tours.
Since 19 Nov ("Aman guides you") Aman explains one part of a page at a time, in
plain words, comes less as the person learns, and can be switched off. A
"where is it" question still gets a Show me button that lights the part.

## Pieces

- `AmanGuide` mounted once in `AppProviders`. It says the one next move, the
  day's hello, the part lines and, for `?point=<id>`, the lit part.
- `usePartGuide`: what Aman says on its own and when. The first hello once,
  part lines on visits 1, 2, 4 and 8 to a page (two at most a visit, each part
  once), and a check-in now and then for someone who knows Karwan. Visits and
  heard parts are kept on the account (`guideVisits`, `guideHeard`, `guideHi`,
  `guideCheckInAt`); the decisions are the pure functions in
  `features/guide/partPace.ts` and `features/guide/pickPart.ts`.
- `PartLine`: the line itself. Under its part on a phone and a tablet, where
  `partGap.ts` opens a gap so nothing is covered; beside the part on a laptop.
  The hello, the check-in and "switched off" open at the top of the page. A
  thin bar shows the time left; 8 s, or 10 with buttons; any tap ends it.
- `point.ts`: `pointFromUrl` reads only a plain id (`[a-z0-9-]{2,40}`),
  `withoutPoint` cleans the link once it shows, `POINT_MS` is 8 s.
- `PointRing`: the ring around a lit or explained part (Figma 355:4454). It
  never takes a tap.
- `GuideProvider`: what is left of the old page guide, the experience score fed
  by `recordAction` and the "tips off on this device" flag that coach notes read.

## Rules

1. **Every `data-guide` mark is a part Aman can explain and point at.** Put
   `data-guide="<id>"` on a real, visible element (a Settings row takes it as
   `guide="<id>"`). Then add the id to its page in
   `backend/src/assistant/guidePages.ts` and give it a line in
   `shared/i18n/messages/pointLines.ts` in all five languages, saying what the
   part is for and what changes if you use it. `guidePages.test.ts` fails until
   all three agree.
2. **Every new page is in the guide.** Add it to `GUIDE_PAGES` with what it is
   for, or to `NOT_GUIDED` with a reason. The same test fails otherwise.
3. **Lines are ours.** They come from `pointLines` and `guideCopy`, never from
   the model, so no one's words can appear on the page that way.
4. **Nothing is done for the person.** A line or Show me scrolls, rings and
   explains. It never presses, fills, submits or moves money.
5. **Never in the way.** No line on a money screen, over a dialog, while typing
   or scrolling fast, and none while help is off (`guide` is `face` or `off`).
6. **Plain language.** Sentence case, no em dashes, money in plain words.
   Reduced motion keeps everything still.
