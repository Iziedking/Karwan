# Karwan inbound-email Worker (free, Cloudflare)

Turns email sent to `tickets@inbound.karwan.site` into Karwan support tickets.
Does NOT touch `karwan.site` MX / your Google Group — it only uses the
`inbound.karwan.site` subdomain.

The webhook URL (which embeds the secret) is NOT in the code. It lives in
`env.WEBHOOK_URL`, set as an encrypted Cloudflare secret. Nothing secret is
committed.

## One-time setup

### 1. Pick a secret
```
openssl rand -hex 24
```
Your webhook URL is `https://api.karwan.site/api/support/inbound/<secret>`.
Set the same `<secret>` on the backend as `INBOUND_EMAIL_SECRET`.

### 2. Add the subdomain in Cloudflare (dashboard)
Cloudflare → `karwan.site` zone → **Email** → **Email Routing** → **Settings**
→ **Add subdomain** → `inbound`. Wait for verification. (Records land on
`inbound.karwan.site` only; your Google email is untouched.)

### 3. Deploy the Worker + set the secret
```
cd cloudflare-email-worker
npm install
npx wrangler login                 # opens the browser once
npx wrangler deploy
npx wrangler secret put WEBHOOK_URL # paste the full https://…/inbound/<secret> URL
```
`wrangler secret put` stores the value encrypted in Cloudflare — not in any
file. (For local `wrangler dev`, copy `.dev.vars.example` to `.dev.vars`.)

### 4. Route the address to the Worker (dashboard)
Email → Email Routing → **Routing rules** → **Custom addresses** →
**Create address** → `tickets@inbound.karwan.site` → Action: **Send to a Worker**
→ pick `karwan-email-inbound`.

### 5. Backend env (then redeploy the api)
```
INBOUND_EMAIL_SECRET=<the secret from step 1>
SUPPORT_REPLY_TO=tickets@inbound.karwan.site
```

## Test
Email `tickets@inbound.karwan.site` (or reply to a Karwan support email). A
ticket should appear in `/admin` → Support within a few seconds.
