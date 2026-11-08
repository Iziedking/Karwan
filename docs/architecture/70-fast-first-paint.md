# 70 · The right look on the first paint, and fewer round trips

Track: foundation (the whole product). Asked by the owner on 8 Nov 2026: "app seems slow, page flicks at times, shows old look first and comes back".

## What was wrong

Measured on testnet on 8 Nov 2026, from a slow line (0.2 s to open a connection anywhere):

| Step | Time |
|---|---|
| Page HTML, first byte (Vercel, function in `iad1`) | about 0.9 s |
| First data call starts (after the scripts run) | 2.8 s |
| `auth/bootstrap`, `features`, `money/rates`, `listings` as the browser saw them | 1.2 s to 3 s each |
| The same calls on the API host itself | 40 to 60 ms (`money/rates` 650 ms) |

So the server was quick and the time went on round trips, and on what the page drew while it waited.

1. **The signed-out frame came first.** The top bar, the rail, the phone tabs and the page column choose their shape from "signed in". That answer comes from `auth/bootstrap`, one to four seconds into a load on a slow line. Until then every signed-in person saw the public frame (no rail, a Sign in button, the narrow column), then the app frame jumped in. This is the "old look first".
2. **Four loading screens were the old pages.** `activity`, `buyer`, `seller` and `jobs/[id]` drew stat grids and dashboard cards in the old tokens while their route loaded.
3. **Every read asked leave first.** Each API call sent `content-type: application/json`, a body or not. That makes a cross-origin call non-simple, so the browser sent an `OPTIONS` request before each new address: one more round trip per call on a first visit.
4. **The connection to the API opened late.** Nothing told the browser about the API host until the first call, after the scripts had run, so DNS, TCP and TLS waited too.
5. **The rate read could block.** Once a minute a call to `money/rates` waited on CoinGecko (650 ms), and calls that met at that moment each read it again.

Reading the session on the server would fix 1 at the root, but the layout used to read a cookie and that made every route dynamic, with first bytes of 2 to 4 s (see the note in `app/layout.tsx`). That is not repeated.

## How it works now

```
first paint (server HTML)
  signed-in-only page (/app, /deals, /money, /profile …)  → app frame
  shared page (/, /market, /docs …)                        → public frame
after the scripts run, before the sign-in check answers
  browser note "signed in last time" (signedInHint)        → picks the frame
the sign-in check answers                                   → decides
```

- `shared/auth/shellSignedIn.ts` holds that rule; `ChromeFrame`, `TopNav` and `WorkspaceBottomNav` read it. It only picks the frame: data, actions and the sign-in gate still wait for the real answer, and the bell shows once there is an account.
- `shared/components/RouteLoading.tsx` is the one loader for a slow route: a title line and rows in the current look.
- `core/api.ts` sends the content type only with a body, so reads are simple requests with no `OPTIONS` before them.
- `app/layout.tsx` adds `preconnect` and `dns-prefetch` for the API origin (from `NEXT_PUBLIC_BACKEND_URL`), with credentials, so the connection is open when the first call goes.
- `backend/src/rates/usdcRates.ts` answers from the reading it holds while that reading is under 15 minutes old and reads the source behind it, one read at a time. Past 15 minutes it still waits, and an old figure is never shown.

## Not changed, for the owner

- The page functions run in Washington (`iad1`) and the API in Canada (`35.183.x`, AWS). Most people are in Nigeria. A region nearer to them is a hosting choice for later, measured first.
- `/market` is shared with visitors, so its first paint stays public; the browser note switches it as soon as the scripts run.

## Status

Built 8 Nov 2026.
