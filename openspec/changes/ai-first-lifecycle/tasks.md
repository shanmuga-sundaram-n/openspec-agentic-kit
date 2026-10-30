# Tasks

Test names embed the requirement id without the hyphen (for example `ORG002`) so the spec-to-test trace passes. Tests use `node:test` only; no dependencies are added.

## 1. Prerequisites

- [ ] 1.1 Confirm `hub-test-suite` has landed with `lib/gates.mjs` and the stub `claude` helper, and verify `node --test` runs green before starting; if it has not landed, stop and land it first
- [ ] 1.2 Add an `orgs/` directory convention to the repo (committed `.gitkeep`, listed as config in the README layout notes) and verify `orgs/` is not git-ignored

## 2. Org policy layer and floor check

- [ ] 2.1 Load `orgs/<name>/policy.json` when `repo.json` names an org, fail naming the org and file when the policy is missing, and verify tests `ORG001` cover attached, unattached and unknown org
- [ ] 2.2 Apply org `defaults` between base and `repo.json` without changing `mergeConfig`, and verify tests `REG002` cover default precedence (repo beats org beats base) and that array-replace for ungoverned keys is unchanged
- [ ] 2.3 Implement the floor step for list membership by name, bounds (`min`/`max`) and equality (`locked`), and verify tests `ORG002` cover adding to a required list, overriding a default and ignoring a locked value with a report
- [ ] 2.4 Run the floor check at `start` and `resume`, refusing with each missing item and the file that dropped it, and verify tests `ORG003` cover a dropped required check and a satisfied floor
- [ ] 2.5 Implement waivers `{check, reason, expires, approvedBy}` validated against the org `waiverApprovers` group, honour expiry, and write each use to `approvals.md`; verify tests `ORG004` cover valid, expired and incomplete waivers
- [ ] 2.6 Document the org layer, setting kinds, floor check and the waiver limits (attestation by file, not authentication) in README.md, and verify the sample `policy.json` in the docs passes the floor check in a test

## 3. Approver groups

- [ ] 3.1 Add org-defined approver groups and let a gate or path rule name a group, and verify tests `ORG005` cover a member approving and a non-member refused naming the group
- [ ] 3.2 Require an approver to satisfy both the gate list and a matching rule's group, and verify tests `GATE010` cover the combined case and a rule-only case
- [ ] 3.3 Surface the required group in the gate summary and the dashboard approver list, and verify a test asserts the group appears in the status output for a waiting gate

## 4. Path rules and escalation

- [ ] 4.1 Implement the in-house glob matcher (`*` and `**`) as pure logic that fails closed on an unparseable rule, and verify unit tests cover nested paths, extension globs and a malformed rule
- [ ] 4.2 Implement effective tier as the higher of the declared tier and any matching rule's minimum, never lowering it, and verify tests `GATE008` cover escalation, no lowering and no match
- [ ] 4.3 Evaluate rules on declared paths before a diff exists and on the union with the diff afterwards, naming undeclared paths; verify tests `GATE008` cover the design gate seeing a declared path and a diff-only path
- [ ] 4.4 Add an `Affected paths:` line to the `agentic-sdlc` proposal template and instruction, and verify `openspec validate` of a sample change accepts it and a test parses the line
- [ ] 4.5 Show the rule and matched paths in the gate summary and dashboard, and record the effective tier in `approvals.md`; verify tests `GATE009` assert both
- [ ] 4.6 Document path rules and their interaction with auto policy in README.md, and verify the documented example escalates a low-risk sample at G2 in a test

## 5. Security checks

- [ ] 5.1 Support named checks `secrets`, `deps-audit` and `sast` as `extraChecks` entries with a `kind`, run them with `AGENTIC_SEVERITY_THRESHOLD` set and treat a nonzero exit as failure; verify tests `BLD007` cover above-threshold, below-threshold and not-configured
- [ ] 5.2 Read an optional SARIF `report` for display only (levels and messages), tolerate a missing or malformed file, and verify unit tests cover both
- [ ] 5.3 Pass scan results to the Security Reviewer and update `agents/security-reviewer.md` and the threat-model template to address each finding at or above the threshold; verify tests `BLD008` assert the prompt contains the findings
- [ ] 5.4 Make the checks list an org-required list so the floor applies, and verify a test fails `start` when a repo drops `secrets`
- [ ] 5.5 Document the exit-code and threshold contract with example commands in README.md, and verify the example commands run against a fixture repo

## 6. Docs and changelog

- [ ] 6.1 Add the `docs` artifact and `docs.md` template to `schemas/agentic-sdlc`, a `docs-writer` role with its allow-list in `config.base.json`, and `agents/docs-writer.md`; verify `openspec schemas` shows the artifact and the role passes the missing-role check
- [ ] 6.2 Run the docs artifact after verification and before the Merge gate, and verify a stub-agent test shows the order and that the artifact is committed
- [ ] 6.3 Implement the required-docs check (configured kinds matched in the diff) with the `No user-facing impact:` escape that requires a reason; verify tests `BLD009` cover missing, escaped and org-required cases
- [ ] 6.4 Document the docs role, kinds and the escape in README.md, and verify the documented config loads without error

## 7. Release config, live stage and gate G5

- [ ] 7.1 Add the observe-only `release` block (probe, watch minutes, rollback note) and reject a block containing a deploy command, naming the key; verify tests `REG005` cover configured, rejected and absent
- [ ] 7.2 Append the `live` stage and gate G5 (human at every tier) to `config.base.json`, skip the stage when no `release` exists or the change is unmerged, and verify tests `PIPE008` and `PIPE009` cover all three including an in-flight state file with an old `stageIndex`
- [ ] 7.3 Make G5 read only from saved state and the store, and make resume skip provisioning when the worktree is gone; verify a test resumes a merged change after the worktree is removed
- [ ] 7.4 Implement the `post` state (`merged`, `live`, `released`, `regressed`, `lastTick`) with derived `unwatched`, and verify tests `PIPE010` cover healthy, failed and unwatched
- [ ] 7.5 Record the outcome (time, who confirmed, probe results) in state and the store and keep it readable after cleanup; verify tests `PIPE011` cover both
- [ ] 7.6 Implement confirmation at G5 through `approve` with no auto policy and a recorded note, and verify tests `GATE011` cover confirm, low tier still waits, and not configured
- [ ] 7.7 Assert the live stage runs no command other than the probe, and verify a test `PIPE012` with a spy shell
- [ ] 7.8 Document the live gate, states, the no-deploy rule and the `release` block in README.md, and verify the documented block loads in a test

## 8. Dashboard watch window

- [ ] 8.1 Run the probe on an interval from the dashboard process for each live change, using the main checkout as cwd with a timeout and recorded output, taking the command only from `repo.json`; verify tests `DASH007` cover healthy window, failed probe and no rollback executed
- [ ] 8.2 Show `unwatched` when no tick is recent and resume watching on dashboard start; verify tests `DASH008` cover the stale heartbeat and a later start
- [ ] 8.3 Show the live gate with a confirm action that runs the same CLI command, and the failed probe plus rollback note for a `regressed` change; verify tests `DASH009` cover approver, non-approver and regressed view
- [ ] 8.4 Confirm no HTTP route accepts a command or path, and verify a test posts probe-like fields and sees them ignored
- [ ] 8.5 Document the watch window and its dependency on a running dashboard in README.md (Dashboard section), and verify the described states match a rendered fixture

## 9. Agent evals

- [ ] 9.1 Add `evals run [--role r] [--repo n]` that replays cases from `evals/<role>/` and `repos/<name>/evals/<role>/` in a scratch checkout through the existing agent runner and never during a change; verify tests `EVAL001` cover a role run and a change in progress
- [ ] 9.2 Implement deterministic assertions (required sections, requirement ids, spec-to-test trace, no denied tool use) and verify tests `EVAL002` cover a failing section and an all-pass case
- [ ] 9.3 Report pass rate and cost per role against a bar from org policy or hub config and fail below it; verify tests `EVAL003` cover below the bar and org-set bar
- [ ] 9.4 Fail an eval run for a repo that overrides a role prompt without cases, and verify tests `EVAL004` cover both
- [ ] 9.5 Seed one real case per shared role and document how to add cases in README.md, and verify the stub agent passes the seed cases

## 10. Integration

- [ ] 10.1 Run an end-to-end scenario with the stub agent: org-attached repo, escalated G2, failing then passing security check, merge, G5 confirmation, probe, `released`; verify it passes in `node --test`
- [ ] 10.2 Run the same scenario with the dashboard stopped and verify the change ends `unwatched`, never `released`
- [ ] 10.3 Verify a repo with no `org` and no `release` behaves exactly as before by running the existing test suite unchanged
- [ ] 10.4 Run `openspec validate ai-first-lifecycle --strict` and the spec-to-test trace on this change, and verify both are clean

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
- Verify the archived result: main specs `org-policy` and `agent-evals` exist and the five modified specs carry the new requirements.
- Rebase the deltas if `dashboard-repo-admin`, `initiative-contract-check`, `pr-merge-strategy` or `toolchain-presets` archive first.
