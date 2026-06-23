# Skills verification (roadmap)

Today a Karwan agent ranks a seller on two things: what they say they do, and their settled-deal record on chain. That is enough to start, but a buyer still has to take a new seller's skill claim on faith. The next layer proves the claim.

This is a roadmap. Nothing here is live yet. It captures the design we are building toward so the direction is public.

## The idea

A seller binds an external identity they already use for their work, then the agent reads public signals from it and blends that evidence into the match score. A developer's GitHub commits and languages, a security researcher's audit-contest placements, a writer's published posts. The buyer sees a plain-language breakdown of why a seller ranks where they do, on the match itself.

Two labels stay parallel and never collapse into each other:

- **Reputation tier** comes from settled deals, stake, activity, and account age. It answers "does this wallet deliver".
- **Evidence tier** comes from verified external signals for the skill in question. It answers "can this wallet do the thing it claims".

A thin track record never hides a proven skill, and a proven skill never paints over a weak track record. A buyer reads both.

## Binding an identity, without OAuth

Verification uses a wallet signature and a public post, never an OAuth token or a stored password. One primitive covers every platform.

1. The seller picks a platform to connect (GitHub first, then X, Substack, Dribbble).
2. Karwan asks their connected wallet to sign a short payload that names the platform, the handle, the wallet, a nonce, and an issue time.
3. The seller publishes that signed message as a public post on the platform (a GitHub gist, for example).
4. Karwan fetches the post over the platform's free public API, recovers the signing address from the signature, and checks it against the connected wallet.
5. On a match, the binding is recorded against the wallet.

There is nothing to leak. No token sits in a database, and the proof is a public artifact the seller can revoke by deleting the post.

## Evidence registry

Each skill category declares where its evidence lives, how to score it, and what the lookup costs. The first wave covers the common categories:

- **Developer.** GitHub, package registries (npm, PyPI, crates.io), and block explorers for on-chain work. All free.
- **Security.** GitHub plus public audit-contest leaderboards (Code4rena, Cantina, Sherlock) and Solodit. The strongest free corroboration of any non-developer category.
- **Writer.** Substack, Medium, and Hashnode feeds, all free, with one language-model sample per source to confirm the sub-skill.
- **Content.** YouTube, Twitch, and podcast directories, free.
- **Designer.** Dribbble and Figma Community, free; Behance behind a paid lookup.
- **Marketing, sales, ops, legal, finance.** A mix of free registries where they exist (CPA Verify, CFA directory) and paid lookups where they do not.

A category's score is the strongest single proof, not an average. One solid signal is sufficient; a weak source never drags a strong one down.

## Cost discipline

Free public sources cover the common categories, so most verifications cost nothing. Paid lookups, billed per call over Circle's x402 surface, gate behind reputation tier and deal value, so the cost only appears where the deal is worth it. The agent reasons on cheap signals on every bid and reaches for a paid check only when the stakes justify it.

## Anti-spoof and recovery

- **Replay is closed** by the nonce and an expiry window on the signed payload.
- **Resale is closed** by a cool-down after a binding, so a verified handle cannot be wired to a fresh wallet and sold as "verified, clean reputation". Re-binding to a new wallet requires re-signing from that wallet, and a recent move applies a temporary haircut to the evidence weight.
- **Recovery works** because the binding follows the wallet through a re-signed proof, so a key rotation does not erase a seller's verified standing.

## Privacy

Verification is opt-in and scoped to the deals where the seller chooses to use it. The signed proof is a public artifact by design; nothing private is collected, and a seller can revoke a binding by removing the post and unbinding the wallet.

## Where it plugs in

The evidence score blends into the same bid ranking that already leads with topical fit, so a verified specialist ranks above an unproven generalist at a comparable price. The breakdown surfaces verbatim on the match banner, so a buyer reading a proposal sees the proof, not just a number.
