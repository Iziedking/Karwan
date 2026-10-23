# 05 · Sign-in and motion

A person gets in with an email and a passkey, or a wallet. The sign-in page shows a short looping film of Karwan's own objects. The film never slows the sign-in down.

## Sign-in

```mermaid
sequenceDiagram
  autonumber
  actor P as Person
  participant SI as /start
  participant API as Karwan API
  participant CPK as Circle passkey service
  participant W as Wallet (web3)

  P->>SI: Opens /start
  SI-->>P: Card renders first (email, Continue, Connect a wallet)
  alt Email and passkey
    P->>SI: Email, Continue
    SI->>API: Account lookup / invite check (mainnet is invitation only)
    SI->>CPK: Register or sign in with passkey
    CPK-->>SI: Smart account
    SI->>API: Session
  else Wallet
    P->>SI: Connect a wallet
    SI->>W: Sign-in message (SIWE)
    W-->>SI: Signature
    SI->>API: Verify, session
  end
  API-->>SI: Terms, then workspace
```

## Confirming it is you

After sign-in, a person is asked to be present for three things only: setting up their record and their buying agent's limits, putting up deal insurance, and money leaving Karwan for an address that is not one of their own Karwan wallets. Every other step, paying into a deal, accepting, delivering and releasing, is signed by their agents without asking (view 27).

```mermaid
sequenceDiagram
  autonumber
  actor P as Person
  participant APP as Karwan page
  participant API as Karwan API
  participant AG as Agent wallet

  P->>APP: Sends money out, or puts up deal insurance
  APP->>API: The step
  API-->>APP: 428, confirm it is you (the action and its fingerprint)
  APP-->>P: Sheet: what will happen, then passkey or PIN
  P->>APP: Face or fingerprint, or the 6-digit PIN
  APP->>API: Confirmation for that challenge
  API-->>APP: A grant for that one action, two minutes, once
  APP->>API: The step again, with the grant
  API->>AG: Signs
  API-->>APP: Done
```

Notes: `backend/src/presence/` and `/api/confirm`. The PIN is stored only as a slow salted hash (scrypt) and locks for 15 minutes after five wrong tries; a passkey still works while it is locked. A sign-in passkey also confirms. The first PIN or passkey needs a code sent to the person's email, or a one-time link from their chat agent opened in the last 10 minutes. A forgotten PIN is reset by email code. A chat never asks for a PIN: the agent sends a one-time Karwan link and the person confirms on the page. An account that signs in with its own wallet confirms by signing the action text, with a one-time nonce, in that wallet. A grant fits one action, one amount and one recipient, and is spent once.

## Motion loading

```mermaid
sequenceDiagram
  participant SI as /start
  participant V as Video element
  participant CDN as Static assets

  SI->>V: Render poster image first
  SI->>SI: Reduced motion? Keep poster, stop
  SI->>SI: Panel visible? (IntersectionObserver)
  SI->>CDN: Fetch WebM, else MP4 (about 1.5 MB)
  CDN-->>V: Stream
  V->>V: Play muted, loop 14 s, pause when hidden
```

## The film

14 seconds, seamless: deal cards drift in; two meet and fold into a capsule sealed with a lime line; the capsule opens and a coin settles on the record stack, which grows by one; everything drifts back. Four objects modelled once in 3D in code, one matte material, palette colours only. No AI imagery or stock 3D.

Approval gates: still frames, then a 6 to 8 second motion study, then the full loop.

## Status

| Part | Status |
|---|---|
| Email, passkey and wallet sign-in | Live |
| Confirming it is you, passkey or Karwan PIN | Built, not deployed |
| Redesigned sign-in layout | Planned (spec Part C) |
| Poster-first, visible-only film loading | Planned |
| 3D objects and film | Planned, gated |
