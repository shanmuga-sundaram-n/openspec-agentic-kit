# Proposal

## Why

Implementation runs one Implementer at a time, so a change with independent task groups waits on its slowest serial pass. The README lists parallel lanes across worktrees as a possible extension.

## What Changes

- The Planner marks task groups as independent lanes with the files each touches (the tasks rule already requires file lists).
- The runner runs one Implementer per lane in its own sub-worktree, bounded by a `maxLanes` setting, and merges lanes back into the change branch.
- Lanes whose file sets overlap are serialized.
- A lane merge conflict stops the change with a clear message instead of guessing.
- Budget and timeout caps apply per lane; cost rolls up to the change total.
- Non-goals: parallelism across changes, automatic conflict resolution by an agent.
- **BREAKING**: none; `maxLanes: 1` keeps today's behaviour and is the default.

## Capabilities

### New Capabilities
- `implementation-lanes`: parallel Implementer lanes, overlap detection and lane merge

### Modified Capabilities
- `build-and-checks`: the apply loop may run several lanes before checks
- `worktree-and-merge`: lane sub-worktrees and merging back into the change branch

## Impact

- `bin/agentic.mjs` build loop, `lib/git.mjs`, `schemas/agentic-sdlc` tasks template and Planner prompt, `config.base.json`.
- Risk tier: high (merge conflicts and lost work). Rollback: set `maxLanes` to 1.
