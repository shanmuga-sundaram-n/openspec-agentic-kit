# Proposal

## Why

The hub has no specs, so its behaviour lives only in `README.md` and the code. Any change to gates, config layering or merge behaviour cannot be reviewed against an agreed contract. A baseline records what the hub does today.

## What Changes

- Record the hub's current, shipped behaviour as ADDED requirements, one capability per area. No code changes and no behaviour changes.
- Requirement IDs use the hub's `AREA-NNN` convention so the spec-to-test trace can be applied to the hub itself later.
- Known gaps (no tests, no atomic cross-repo release) are not specified here; they are separate roadmap changes.

## Capabilities

### New Capabilities
- `repo-registry-config`: registering repos and layering base, repo and override config
- `pipeline-orchestration`: stage loop, state, locking, resume and abort
- `human-gates`: gate policy by risk tier, approvers, revise, override, audit trail
- `agent-execution`: headless role sessions, allow-lists, budget and timeout
- `build-and-checks`: apply loop, deterministic checks, spec-to-test trace, code review
- `worktree-and-merge`: per-change worktree, clean target repos, archive and merge
- `cross-repo-initiatives`: one child change per repo with linked gates
- `lessons`: retrospective lessons queued, reviewed by a human, then applied
- `dashboard-and-store`: local SQLite store and the 127.0.0.1 dashboard

### Modified Capabilities

## Impact

- Adds nine specs under `openspec/specs/` once archived. No source, config or runtime impact.
