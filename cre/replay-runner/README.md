# Karwan replay runner

This folder becomes the public repository `karwan-replay`. It holds one GitHub
Actions workflow, `.github/workflows/replay.yml`, which re-runs the items two
parties agreed at deal setup on the exact commit the seller delivered.

## How a run is started and read

1. The seller marks a delivery on Arc. The CRE workflow `karwan-check` reads
   the deal's terms, checks that the agreed policy and the delivery reference
   match the fingerprints on Arc, and dispatches this workflow with the
   delivered repository, the commit, the deal key (`<dealId>-r<revision>`) and
   the policy's items.
2. Each item runs in its own job, named `item:<id>`, on a fresh
   GitHub-hosted runner.
3. `karwan-check` finds the run by its name, `karwan <deal key> <commit>`,
   reads each job's conclusion and decides pass or fail with the fixed rules
   in `cre/shared/verdict.ts`.

## What it can and cannot do

- **Permissions.** It has `contents: read` only, references no secrets, and
  checks out with `persist-credentials: false`.
- **Commit guard.** Each job confirms that the checked-out commit equals the
  delivered commit before running anything.
- **Commands.** The agreed commands reach the shell through environment
  variables, never interpolated into the workflow file.
- **Pinning.** A deal's policy names this file's blob sha. A run of any other
  version of the file gives no result.
- **What a pass means.** It runs the seller's code in a throwaway sandbox with
  network access, because builds install packages. It measures whether the
  delivered work passes what both parties agreed. It does not judge quality.

## Owner set-up

1. Create the public repository `karwan-replay` and push this folder's
   contents to its default branch.
2. Record the blob sha of `.github/workflows/replay.yml` with
   `gh api repos/<org>/karwan-replay/contents/.github/workflows/replay.yml --jq .sha`.
   Deal policies pin this value.
3. Create a fine-grained token with `actions: write` and `metadata: read` on
   `karwan-replay` only. Store it as the CRE secret `GITHUB_REPLAY_TOKEN`.
4. Create the fixture repository `karwan-replay-fixture` with one passing and
   one failing test, and dispatch a run against it. Expect `item:a` to succeed
   and `item:b` to fail. A run against a commit other than HEAD must fail at
   "Confirm the commit".
