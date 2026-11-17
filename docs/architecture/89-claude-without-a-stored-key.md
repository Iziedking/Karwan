# 89 · Claude without a stored key

Track: foundation (security and reliability), roadmap F.3. Approved 17 Nov 2026 as drafted. Built 17 Nov 2026, not deployed.

## What is wrong today

Karwan reaches Claude two ways. Claude on Bedrock uses the server's own AWS identity, so no secret is stored for it. Claude at Anthropic uses a fixed key that sits in the server's settings file and never expires. Anyone who reads that file can spend on the account until someone notices and deletes the key.

The order of the chain also puts Bedrock first (view 81). Bedrock has refused Claude before with no warning, and it trails Anthropic on new models and features.

## The idea in one line

The server proves to Anthropic that it is Karwan's server, gets a pass that lasts minutes, and asks Claude at Anthropic first. Bedrock is the backup, and OpenRouter stays last where it is allowed.

## How the server proves who it is

```mermaid
sequenceDiagram
  participant K as Karwan API
  participant A as AWS
  participant C as Anthropic
  K->>A: Who am I? (the server's AWS role)
  A-->>K: A signed note, good for 15 minutes
  K->>C: Here is the note
  C-->>K: A pass for Claude, good for 10 minutes
  K->>C: Question, with the pass
  C-->>K: Answer
  Note over K,C: Before the pass runs out, the API asks AWS for a new note and trades it again
```

1. **AWS signs a note.** The API asks AWS for a short note that says which AWS role is asking. AWS signs it. Nothing is stored: the API asks again each time it needs one.
2. **Anthropic trades the note for a pass.** Anthropic checks the signature against AWS's public keys and checks that the role is the one Karwan registered. It returns a pass tied to a Karwan service account at Anthropic.
3. **The pass is renewed before it ends.** The API keeps one pass in memory and replaces it two minutes before it runs out. A note is used once.
4. **Every call to Claude at Anthropic carries the pass.** The assistant, the agents, negotiation, delivery checks, research, the supervisor and the dispute judge all take it from the same place.

## The order of the chain

```mermaid
flowchart LR
  A[Claude at Anthropic, with a pass] -->|refused, no credit, timeout, no pass| B[Claude on Bedrock]
  B -->|refused| D[A model that is not Claude, on Bedrock]
  D -->|refused| O[OpenRouter, only where allowed]
  O -->|all failed| X[Alert to the team, plain error to the person]
```

- Anthropic moves from second to first. The rest of view 81 holds: the model that is not Claude, the cleaning of model text, the ten minute rest for a link refused for good, and the alert when every link fails.
- Failing to get a pass counts as that link failing. The call moves to Bedrock and the person waits no longer than for any other refusal.
- A chat that carries a person's own data still never goes to OpenRouter.

## What stays the same

- On a developer's machine there is no AWS role, so a key in the local settings still works. The server never needs one once this is live.
- Testnet and mainnet run on the same server and the same AWS role. Each names its own Anthropic workspace, so spend and limits show apart.

## Moving over without a gap

1. Set up the trust: AWS is told to issue notes, the server's role is allowed to ask for them, and Anthropic is told which AWS account and role to accept.
2. Prove it from the server with one real question, before any code ships.
3. Ship the code with the key still in place. The pass is used when it works and the key is not read.
4. After a week with no key use, remove the key from both servers and delete it at Anthropic.

## Sources checked

Read on 17 Nov 2026:

- Anthropic: Authentication, Workload Identity Federation, the reference for it, and the AWS guide (`platform.claude.com/docs/en/manage-claude/`).
- AWS: the `GetWebIdentityToken` call in the STS reference. A note lasts 60 seconds to one hour, the account must switch the feature on, and the call is not offered on the global endpoint.

## As built

- **The trust.** The AWS account issues notes, the server's role `karwan-mainnet-backup` may ask for one (policy in `scripts/ops/iam/anthropic-pass.json`), and Anthropic accepts that exact role for the service account `karwan-api`. The pass lasts 10 minutes. The Console offers no scope narrower than the developer scope, so the pass carries that. `scripts/ops/prove-anthropic-pass.sh` proved it from the server on 17 Nov: a pass, then one answer from Claude.
- **The pass.** `backend/src/llm/anthropicPass.ts` asks AWS for a note on the regional endpoint, trades it, keeps one pass in memory and renews it two minutes before it ends. Calls that arrive together share one trade. If a renewal fails while the old pass still has more than 30 seconds, the old pass is used.
- **Settings.** `ANTHROPIC_FEDERATION_RULE_ID` and `ANTHROPIC_ORGANIZATION_ID` turn the pass on, with `ANTHROPIC_WORKSPACE_ID`, `ANTHROPIC_SERVICE_ACCOUNT_ID` and `ANTHROPIC_STS_REGION` optional. The server refuses to start when only one of the first two is set. With neither set, the key is used as before.
- **The chain.** Every chain in `backend/src/llm/client.ts` and the assistant's own provider list in `routes/assistant.ts` now start with Claude at Anthropic. A refused pass (401, 402, 403) rests that link for ten minutes like any refused link.
- **Checks.** The health check behind `/admin/diagnostics` names the first link as `anthropic (pass)` or `anthropic (key)`. `scripts/probe-anthropic-pass.ts` prints when the pass ends and one answer, never the pass. `scripts/probe-models.ts` lists the link as `Claude at Anthropic, pass`.

## Not done

- The settings are not on testnet or mainnet yet, so both still use the key.
- The key is removed only after a week on the pass with no key use.

## Not in this view

- Signing GitHub's deploy steps in the same way. No deploy step calls Claude.
- Changing which Claude model each job uses.
