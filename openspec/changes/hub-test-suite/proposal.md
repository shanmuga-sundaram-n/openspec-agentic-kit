# Proposal

## Why

The hub has no automated tests, yet it commits, merges and approves on a user's behalf. Config layering, the spec-to-test trace, lesson parsing and gate policy are pure logic that regress silently. Every other roadmap change depends on a safety net.

## What Changes

- Add a test suite using only `node:test` and `node:assert`, run with `node --test`; no new dependencies.
- Unit tests for config merge, `parseDeltaSpecs`/`specTrace`, `riskTier`, `reviewBlocking`, lesson parsing and `applyAccepted`, `slugify`, and gate policy and approver decisions.
- Integration tests against a temporary git repo and a stub `claude` executable: start, gate, revise, resume, archive and merge without calling a real model.
- Tests named for the baseline requirement IDs (`REG002`, `GATE001`, ...) so the hub passes its own spec-to-test trace.
- Add a `test` script in a root `package.json` (no dependencies) and document the command in `README.md` and `CLAUDE.md`.
- Non-goals: coverage thresholds, CI provider setup, dashboard browser tests.

## Capabilities

### New Capabilities

### Modified Capabilities

No requirement changes. This is tooling, so the change sets `skip_specs: true`.

## Impact

- New `test/` directory and a minimal `package.json`.
- `bin/agentic.mjs` runs on import, so gate decisions are extracted into `lib/gates.mjs` and the rest is tested through the CLI (see design.md).
- Risk tier: low. Rollback: delete `test/`.
