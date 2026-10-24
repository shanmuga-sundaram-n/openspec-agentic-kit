# build-and-checks Specification

## Purpose
Defines how code is built from tasks, verified by deterministic checks, and reviewed before the merge gate.

## Requirements

### Requirement: BLD-001 Task-driven apply loop
The Implementer SHALL run for up to `maxApplyPasses` passes until every task in `tasks.md` is ticked, with a commit after each pass.

#### Scenario: Tasks left open
- **WHEN** tasks remain after the last pass
- **THEN** a warning names the open tasks and the pipeline continues to checks

### Requirement: BLD-002 Deterministic checks
After building, the runner SHALL run `openspec validate --strict`, a tasks-complete check, the configured test command, the spec-to-test trace and any `extraChecks`, and record each result.

#### Scenario: Unconfigured test command
- **WHEN** no test command is set
- **THEN** that check is shown as skipped and does not fail

### Requirement: BLD-003 Fix loop
When a check fails, the Implementer SHALL receive the failures and try again up to `maxFixAttempts` times; if checks still fail the gate SHALL show the failures.

#### Scenario: Still failing
- **WHEN** checks fail after the last attempt
- **THEN** the merge gate lists them as blockers

### Requirement: BLD-004 Spec-to-test trace
Every ADDED or MODIFIED requirement SHALL carry an `AREA-NNN` id and have at least as many test references as scenarios. When `requireTestPlanMention` is on, every scenario SHALL be named in `test-plan.md`.

#### Scenario: Requirement without id
- **WHEN** a requirement title has no id
- **THEN** the trace fails naming the file and title

#### Scenario: Too few test references
- **WHEN** a requirement has two scenarios and one test reference
- **THEN** the trace fails with the counts

### Requirement: BLD-005 Verification evidence
The Verifier SHALL write `verification.md` from real test runs, and it SHALL be rewritten when the implementation changes after the last verification.

#### Scenario: Code changed after verification
- **WHEN** a fix pass runs after verification.md was written
- **THEN** the Verifier runs again

### Requirement: BLD-006 Code review
The Code Reviewer SHALL write `review.md` with Blocking, Should fix, Nits and Spec conformance sections. Blocking findings SHALL get one automatic fix pass and a fresh review when `autoFixReviewBlocking` is on.

#### Scenario: Review not written
- **WHEN** review.md is missing after the review run
- **THEN** a blocking finding "review.md was not written" is recorded
