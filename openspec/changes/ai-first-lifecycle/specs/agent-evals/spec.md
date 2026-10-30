# Spec Delta

## Purpose
Measures whether each agent role still produces acceptable work after a prompt, model or config change, so those changes can be accepted on evidence instead of on trust.

## ADDED Requirements

### Requirement: EVAL-001 Recorded cases per role
The hub SHALL support eval cases for an agent role, each holding an input, the artifact the role is expected to produce, and the assertions that artifact must satisfy. A case SHALL run only when a human starts an eval run, never as part of a change.

#### Scenario: Run the cases for a role
- **WHEN** a human starts an eval run for the `spec-author` role
- **THEN** every case for that role is replayed in a scratch checkout and scored

#### Scenario: Change in progress
- **WHEN** a change is running through its stages
- **THEN** no eval case runs

### Requirement: EVAL-002 Deterministic scoring
A case SHALL be scored by deterministic assertions on the produced artifact, such as required sections, requirement IDs, a passing spec-to-test trace and no denied tool use. A case SHALL pass only when every assertion passes.

#### Scenario: Missing section
- **WHEN** the produced artifact lacks a required section
- **THEN** the case fails and names the assertion

#### Scenario: All assertions hold
- **WHEN** every assertion on the artifact passes
- **THEN** the case passes

### Requirement: EVAL-003 Pass bar
An eval run SHALL report the pass rate and cost per role and SHALL fail when the rate is below the bar set by org policy or, without one, by the hub config.

#### Scenario: Below the bar
- **WHEN** a role passes 7 of 10 cases and the bar is 90 percent
- **THEN** the run is reported as failed with the rate and cost

#### Scenario: Bar from org policy
- **WHEN** the org policy sets a pass bar for a role
- **THEN** that bar is used instead of the hub default

### Requirement: EVAL-004 Overridden prompts need cases
A repo that overrides a role prompt SHALL supply eval cases for that role, and an eval run SHALL fail for a repo whose overridden role has none.

#### Scenario: Override without cases
- **WHEN** a repo has its own `architect` prompt and no cases for `architect`
- **THEN** the eval run fails naming the role and the repo

#### Scenario: Override with cases
- **WHEN** the repo supplies cases for its overridden role
- **THEN** those cases are run against the repo's prompt
