# Proposal

## Why

At the final gate each child merges on its own as it is processed, so a consumer repo can ship before the provider it depends on. The README says to plan rollout order in the contracts, but nothing enforces it.

## What Changes

- Contracts declare a rollout order (a dependency list between child repos).
- Initiative approval of the release gate merges children in that order and stops on the first failure, leaving later repos unmerged and the initiative resumable.
- A pre-merge check reports children that are not ready before any repo is merged.
- Non-goals: a true atomic cross-repo transaction, deploy orchestration.

## Capabilities

### New Capabilities
- `initiative-release-order`: declared rollout order and sequenced merge of children

### Modified Capabilities
- `cross-repo-initiatives`: release gate approval is sequenced instead of parallel
- `worktree-and-merge`: merge may be deferred until its predecessors have merged

## Impact

- `initiativeApprove` in `bin/agentic.mjs`, initiative state, contract template.
- Risk tier: high (partial merges across repos). Rollback: revert to parallel approval via config.
