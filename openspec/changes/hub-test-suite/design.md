# Design

## Context

See proposal.md - Why. The hub is dependency-free Node ESM (20.19+), and that must not change. Pure logic already lives in `lib/` (`hub.mergeConfig`, `checks.parseDeltaSpecs`/`specTrace`/`riskTier`/`reviewBlocking`, `lessons.parseProposals`/`applyAccepted`/`harvest`/`decide`, `util.slugify`). Gate policy (`gate`, `canApprove`) and the stage loop live in `bin/agentic.mjs`, which parses `argv` and runs a command as soon as it is imported, so it cannot be imported by a test.

Hub paths are fixed at load time: `hub.mjs` and `store.mjs` each compute the hub root from their own file location, and state, runs, repos and worktrees all hang off it. A test must not write into the real hub.

## Goals / Non-Goals

**Goals:**
- `node --test` runs the whole suite offline in a few seconds, with no model calls and no new dependencies.
- Pure logic is unit-tested directly; the orchestrator is tested end to end through its CLI.
- The suite is hermetic: it never touches the real `state/`, `runs/`, `repos/` or a real target repo.

**Non-Goals:**
- Coverage thresholds, CI provider setup, dashboard browser tests, tests of agent prompt quality.

## Decisions

**D1. Test runner: `node:test` and `node:assert/strict`.** Built in, zero dependencies, parallel by file. Alternatives: Vitest or Jest (rejected: violate the no-dependency rule and need `node_modules`); a hand-rolled runner (rejected: reinvents reporting).

**D2. Layout: `test/unit/*.test.mjs` and `test/integration/*.test.mjs`, plus `test/helpers/`.** `package.json` has only `{"type":"module","scripts":{"test":"node --test test/","test:unit":"node --test test/unit/"}}` and no `dependencies`. Test files match the trace pattern `.test.` so the hub can later run its own spec-to-test trace.

**D3. Do not make `bin/agentic.mjs` importable; extract the decisions instead.** Move the pure parts of gate handling into `lib/gates.mjs`: `policyFor(gate, risk)`, `isAutoApproved(policy, blockers)`, `isApprover(approvers, email)`, `gateBlockers(stage, state)`, and the revision-target check. `bin/agentic.mjs` imports them; behaviour is unchanged. Alternatives: guard `main()` behind `import.meta.url === process.argv[1]` and export everything (rejected: large diff in an 800-line file, and the module-level `REPO`/`config` globals would still make functions hard to call in isolation); test only through the CLI (rejected: gate policy combinations are many and slow to reach through a subprocess).

**D4. Integration tests run the real CLI against a copy of the hub.** A helper copies `bin/`, `lib/`, `agents/`, `schemas/`, `config.base.json` and `openspec.base.yaml` into a temp dir (no `node_modules` exist, so this is a few hundred KB), creates a temp git repo with one commit as the target, registers it with `repo add`, and runs `node <copy>/bin/agentic.mjs ...` as a child process. All hub-relative state therefore lands in the temp copy. Alternative: add an `AGENTIC_HOME` env override in `hub.mjs` and `store.mjs` (rejected for now: it changes production code in two places to solve a test-only problem, and the copy is cheap). Revisit if copy time grows.

**D5. A stub `claude` executable replaces the model.** Config `agent.command` already names the binary, so the helper writes a small Node script and points `agent.command` at it through the temp repo's `overrides.json`. The stub reads the prompt from stdin, finds the artifact path the prompt asks for, writes canned content from `test/fixtures/`, and prints the JSON the runner expects (`result`, `total_cost_usd`). Scenario switches (fail twice, time out, write nothing, report a blocking review) are driven by an env var or a sidecar file so one stub covers every path. This makes cost, retry and failure handling testable for free.

**D6. Integration tests need the `openspec` CLI; skip when absent.** The runner decides what to do from `openspec status`, so it cannot be faked cheaply. Each integration file checks `openspec --version` once and calls `t.skip` with a clear reason if it is missing, so unit tests still run on a machine without it. CI installs it.

**D7. Scenarios covered end to end:** start to the first gate; approve and continue; revise to an earlier stage and re-run; resume after a failed artifact; auto-approve for low risk; blocked gate needs `--override`; restricted approvers; archive and merge (`no-ff`, and the dirty-main-checkout refusal); `strategy: none`; initiative linked gates (`--partial`, misaligned refusal). Tests use the baseline requirement IDs in their names (`GATE001`, `REG002`) so they satisfy the trace.

**D8. Unit-test priorities (highest regression risk first):** `mergeConfig` (arrays replace, objects merge), `parseDeltaSpecs`/`specTrace` (ID parsing, scenario counts, test-plan mentions), `applyAccepted` (text edit of YAML), `parseProposals`, `riskTier`, `reviewBlocking`, `slugify`, and the new `lib/gates.mjs`.

## Risks / Trade-offs

- [Stub drifts from real `claude -p` JSON] → keep the stub's output shape in one fixture and add one test that parses a captured real output sample.
- [Copying the hub per test is slow] → copy once per file with `before`, and use a fresh target repo per test.
- [`lib/gates.mjs` extraction subtly changes behaviour] → land it first with characterisation tests written against the current logic before moving code.
- [Integration tests are flaky on slow machines] → no real timeouts or sleeps; the stub is synchronous and only the process boundary is async.
- [Integration tests depend on a git identity] → set `GIT_AUTHOR_*`/`GIT_COMMITTER_*` and `user.name`/`user.email` in the temp repo.

## Migration Plan

Additive. Order: add `package.json` and unit tests; extract `lib/gates.mjs` behind characterisation tests; add the integration helper, stub and scenarios; document `npm test` in `README.md` and `CLAUDE.md` (which currently says there is no test suite). Rollback: delete `test/`, `package.json` and revert `lib/gates.mjs` into `bin/agentic.mjs`.

## Open Questions

- Should a trace check over the hub's own `openspec/specs` run as part of `npm test`? It would enforce the ID-in-test-name convention but couples the suite to the spec layout. Can be decided after the first tests land.
