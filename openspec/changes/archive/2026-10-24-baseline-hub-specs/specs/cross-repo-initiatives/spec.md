# Spec Delta

## Purpose
Defines how one idea spanning several repos runs as one child change per repo with gates approved together.

## ADDED Requirements

### Requirement: INIT-001 One child per repo
An initiative SHALL need at least two distinct registered repos and SHALL start one change per repo in parallel, named `<initiative>-<repo>`, each with its own branch and worktree.

#### Scenario: Single repo
- **WHEN** `--repos` lists fewer than two repos
- **THEN** the command fails and points to the single-repo start

### Requirement: INIT-002 Cross-repo contracts
Each child SHALL be told which repos are involved and to state shared interfaces under a "Cross-repo contracts" heading in `proposal.md` and `design.md`.

#### Scenario: Child brief
- **WHEN** a child starts
- **THEN** its brief names the other repos and the contracts heading

### Requirement: INIT-003 Linked gates
Initiative approval SHALL refuse unless every active child waits at the same gate. `--partial` SHALL approve only the waiting children, and an override SHALL be passed to each child.

#### Scenario: Misaligned gates
- **WHEN** one child is still working
- **THEN** approval fails listing each child's state

### Requirement: INIT-004 Resume stopped children
Initiative resume SHALL resume children that are neither waiting at a gate nor finished.

#### Scenario: Nothing to resume
- **WHEN** all children wait or are done
- **THEN** the command reports nothing to resume
