# Spec Delta

## Purpose
Defines a release path that pushes the change branch and opens a pull request instead of merging locally.

## ADDED Requirements

### Requirement: PRM-001 Open a pull request
With the `pr` strategy, the runner SHALL archive the change on its branch, push that branch, and open a pull request with the `gh` CLI whose body has the change summary, `approvals.md` and check results.

#### Scenario: Release approved
- **WHEN** the final gate is approved under the pr strategy
- **THEN** the branch is pushed and a pull request link is shown

### Requirement: PRM-002 Missing tooling
When `gh` is missing or not authenticated, the runner SHALL leave the branch unpushed or pushed as stated, print the manual steps, and mark the change awaiting a pull request.

#### Scenario: No gh
- **WHEN** `gh` is not installed
- **THEN** the message says what to run and nothing is lost

### Requirement: PRM-003 Merge tracking
A sync command SHALL mark the change merged when its pull request has merged, and SHALL leave it open otherwise.

#### Scenario: PR merged
- **WHEN** sync finds the pull request merged
- **THEN** the change is `done` and cleanup follows the configured rules

### Requirement: PRM-004 No bypass
The runner SHALL NOT merge the pull request itself or bypass branch protection.

#### Scenario: Required review pending
- **WHEN** the pull request still needs review
- **THEN** the runner takes no action on it
