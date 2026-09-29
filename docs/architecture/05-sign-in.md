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
| Redesigned sign-in layout | Planned (spec Part C) |
| Poster-first, visible-only film loading | Planned |
| 3D objects and film | Planned, gated |
