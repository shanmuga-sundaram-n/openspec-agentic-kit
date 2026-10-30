# Tasks

Tests use `node:test` and `node:assert/strict` only; no dependencies are added. Test names embed the baseline requirement id without the hyphen (for example `REG002`, `GATE001`) so the hub can later pass its own spec-to-test trace.

## 1. Test runner and layout

- [x] 1.1 Add a root `package.json` with `"type": "module"`, a `test` script and a `test:unit` script and no `dependencies`, and verify `npm test` runs and reports zero tests without error
- [x] 1.2 Create `test/unit/`, `test/integration/`, `test/helpers/` and `test/fixtures/`, and verify a placeholder `test/unit/smoke.test.mjs` is discovered and passes
- [x] 1.3 Choose the test script invocation that discovers `*.test.mjs` on both Node 20.19 and 22 (a runner script that passes explicit file paths, because a directory argument fails on Node 22, globs are missing on Node 20, and a bare `node --test` also executes helpers and the stub), and verify it on Node 22 here and on 20.19 if available, noting the result in the task commit message
- [x] 1.4 Remove the placeholder smoke test once real tests exist, and verify `npm test` still passes

## 2. Characterisation tests for pure logic

- [x] 2.1 Test `hub.mergeConfig` (arrays and scalars replace, objects merge key by key, empty and undefined layers), and verify tests named `REG002` pass
- [x] 2.2 Test `checks.parseDeltaSpecs` and `specTrace` (requirement id parsing, scenario counts, test-name matching without the hyphen, test-plan mentions), and verify tests named `BLD004` pass
- [x] 2.3 Test `checks.riskTier` and `reviewBlocking` (tier line present, absent and malformed; blocking findings present and absent), and verify tests named `GATE002` and `BLD006` pass
- [x] 2.4 Test `lessons.parseProposals`, `applyAccepted` and `decide` (YAML text edit, duplicate skipping, accept and reject of one and all), and verify tests named `LSN001`, `LSN002` and `LSN003` pass
- [x] 2.5 Test `util.slugify` (kebab-case, length, punctuation, empty input), and verify the tests pass
- [x] 2.6 Document the unit-test layout and the requirement-id naming rule in `README.md`, and verify the documented commands run as written

## 3. Gate decisions extracted into `lib/gates.mjs`

- [x] 3.1 Write characterisation tests against the current gate behaviour in `bin/agentic.mjs` for policy by tier, auto-approval only when nothing blocks, approver check and revision-target check, and verify they pass before any code moves
- [x] 3.2 Create `lib/gates.mjs` with `policyFor`, `isAutoApproved`, `isApprover`, `gateBlockers` and the revision-target check as pure functions, move the logic out of `bin/agentic.mjs`, and verify the 3.1 tests pass unchanged against the new module
- [x] 3.3 Make `bin/agentic.mjs` import from `lib/gates.mjs` with no behaviour change, and verify `node bin/agentic.mjs status` and `repo list` still run and the whole suite passes
- [x] 3.4 Add unit tests for the full policy matrix (each gate by each tier, with and without blockers, with and without approvers), and verify tests named `GATE001`, `GATE003`, `GATE004` and `GATE005` pass

## 4. Integration harness

- [x] 4.1 Write a helper that copies `bin/`, `lib/`, `agents/`, `schemas/`, `config.base.json` and `openspec.base.yaml` into a temp directory and runs the copy's CLI as a child process, and verify a test runs `repo list` there without touching the real `state/`, `runs/` or `repos/`
- [x] 4.2 Write a helper that creates a temp git repo with one commit and a fixed git identity, registers it with `repo add`, and verify a test registers it and `repo list` shows it
- [x] 4.3 Write the stub `claude` executable: read the prompt on stdin, write canned content from `test/fixtures/` to the artifact path the prompt names, print the JSON shape the runner expects, and support scenario switches (fail twice, write nothing, blocking review); verify a test runs one artifact through it
- [x] 4.4 Point `agent.command` at the stub through the temp repo's `overrides.json`, check `openspec --version` once per file and skip with a clear reason when absent, and verify the integration tests skip cleanly when `openspec` is missing
- [x] 4.5 Add one test that parses a captured real `claude -p` JSON output sample with the same code path as the stub's output, and verify it fails if the shape drifts
- [x] 4.6 Document the harness, the stub switches and the `openspec` requirement in `README.md`, and verify a new contributor can run one integration test by following it

## 5. Integration scenarios

- [x] 5.1 Start to the first gate: `start` writes research and proposal and waits at G1; verify the test asserts the state file and gate status (`PIPE001`, `PIPE003`)
- [x] 5.2 Approve and continue: approving G1 runs the design stage and waits at G2, and verify the test asserts `approvals.md` has the entry (`GATE007`)
- [x] 5.3 Revise to an earlier stage and re-run: verify the test asserts gates after the target reset and the feedback reaches the next prompt (`GATE005`, `GATE006`)
- [x] 5.4 Resume after a failed artifact: the stub fails twice, the change is marked `failed`, then `resume` completes it; verify the test asserts both states (`PIPE005`, `PIPE003`)
- [x] 5.5 Auto-approve at low risk and human-required at medium, verify with the same scenario run at both tiers (`GATE001`)
- [x] 5.6 Blocked gate needs `--override` and the override is recorded; verify the test asserts refusal without it and the record with it (`GATE003`)
- [x] 5.7 Restricted approvers: an unlisted git email is refused; verify the test asserts the message (`GATE004`)
- [x] 5.8 Archive and merge with `no-ff`, the dirty-main-checkout refusal, and `strategy: none`; verify the test asserts the branch, the merge commit and the printed manual command (`GIT004`, `GIT005`)
- [x] 5.9 Initiative linked gates with `--partial` and the misaligned refusal; verify the test asserts both (`INIT003`)
- [x] 5.10 Single runner per change: a live lock refuses a second runner and a stale lock is cleared; verify the test asserts both (`PIPE004`)

## 6. Documentation and wrap-up

- [x] 6.1 Update `CLAUDE.md` so it no longer says there is no test suite, and verify the Commands section lists `npm test` and `npm run test:unit`
- [x] 6.2 Document the test commands, the layout and how to add a scenario in `README.md`, and verify the documented commands run as written
- [x] 6.3 Run the full suite twice in a row and verify it passes both times offline in a few seconds, with no changes to the real `state/`, `runs/` or `repos/` (check `git status`)
- [x] 6.4 Run `openspec validate hub-test-suite --strict` and verify it is clean

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
- Decide whether a trace check over the hub's own `openspec/specs` should run inside `npm test` (the design's open question).
- Return to `ai-first-lifecycle` and start at group 1.
