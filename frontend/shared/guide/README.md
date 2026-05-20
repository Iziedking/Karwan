# Guided tours (coachmarks)

In-app, experience-weighted tours that teach newcomers and fade as they gain
mastery. This is the convention to follow for **every** new page or feature so
tours stay consistent and never collide.

## Pieces

- `GuideProvider` — context + the spotlight overlay (rendered once, mounted in `AppProviders`). Owns the experience score, the per-tour "seen" set, the global "skip all tips" flag, and the 5-consecutive-skips cutoff.
- `PageTour` — drop on a page with `id` + `steps`. Auto-opens once for newcomers, re-opens at random while they learn, stops at mastery, and leaves a quiet replay pill.
- `GuideWelcome` — first-run "start here" tour. Skips public/marketing routes; fires on the first app page after sign-in.
- `tours.ts` — all step definitions in one place.

## Rules (read before adding a tour)

1. **One auto-tour per page.** Two tours opening on the same page is the bug we keep hitting. If a page has a primary tour, nothing else on it may auto-open.

2. **Shared, tour-bearing components must be opt-out.** Any component that renders its own `<PageTour>` AND can appear on more than one page (today: `StakeCard`, `BridgeCard`) must expose `tour?: boolean` (default `true`). The page where it's a secondary element passes `tour={false}`, and that page's own tour explains the embedded feature instead.
   - `StakeCard`: tour on `/stake`, `tour={false}` inside `/profile`.
   - `BridgeCard`: `tour={false}` on `/buyer` and `/profile`; bridging is taught by the Profile tour.
   - **Future builds:** if you embed a tour-bearing component somewhere new, pass `tour={false}` and add a step to the host page's tour.

3. **Role-aware copy when behavior differs.** If a step's truth depends on wallet type (Circle vs web3) or role, build steps with a function and pass per-page, e.g. `buildProfileSteps(isCircleUser)`. Don't ship one body that's wrong for half the users (bridging and agent funding differ for Circle).

4. **Spotlights vs overview.** Add `data-guide="<value>"` to the element a step points at and set `target` on the step. Steps with no `target` render as centered overview cards. Anchor real, visible elements (not zero-height markers).

5. **Plain language, Karwan UI law.** Terse, no jargon (USDC = "digital dollars ~$1", escrow = "held safely", gas = "network fee"). No em dashes. Lime accent, bracket-tag metadata, asymmetric corners, reduced-motion honored.

6. **Feed experience from real actions.** Call `recordAction('<distinct-type>')` from genuine successes (post-job, post-listing, stake-deposit, bridge). Experience is quality-weighted: distinct tools advance mastery; spamming one action plateaus. Don't bump on trivial/UI events.

7. **Never on public routes.** The landing, docs, how-it-works, feedback, and terms pages get no tours (`GuideWelcome` + page tours just aren't mounted there).

## Adding a tour to a new page

```tsx
// 1. tours.ts
export const FOO_TOUR_ID = 'foo-v1';
export const FOO_STEPS: TourStep[] = [
  { target: 'foo-thing', title: '…', body: '…' },  // spotlight
  { title: '…', body: '…' },                        // centered overview
];

// 2. the page/component
<PageTour id={FOO_TOUR_ID} steps={FOO_STEPS} />
<div data-guide="foo-thing">…</div>
```

Bump the `-vN` suffix on a tour id when its steps change enough that returning
users should see it again.
