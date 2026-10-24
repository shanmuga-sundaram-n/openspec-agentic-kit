# Proposal

## Why

Merging happens locally into the base branch, which fails whenever the main checkout is dirty or on another branch, and teams that require pull requests and branch protection cannot use it. `merge.strategy: none` leaves everything to the user.

## What Changes

- A `pr` strategy that pushes `change/<id>` and opens a pull request through the `gh` CLI, with the change summary, `approvals.md` and checks in the body.
- The change finishes as "PR opened" with a link; a later `sync` marks it merged when the PR merges.
- Archive commits (spec updates) land on the same branch so the PR contains them.
- Push stays off unless the strategy is `pr` or `merge.push` is set; agents still never push.
- Non-goals: other forges, auto-merging the PR, bypassing branch protection.

## Capabilities

### New Capabilities
- `pr-merge-strategy`: PR-based release and merge tracking

### Modified Capabilities
- `worktree-and-merge`: adds the `pr` strategy and a "PR opened" end state
- `human-gates`: the release gate's approval can end in an open PR rather than a merge

## Impact

- `archiveAndMerge`, `lib/git.mjs`, state and dashboard status, `config.base.json` merge settings.
- Risk tier: medium (first outward-facing push by the runner). Rollback: set the strategy back to `no-ff`.
