# Spec Delta

## Purpose
Defines how an initiative declares the order in which its repos release and how the final merges follow that order.

## ADDED Requirements

### Requirement: REL-001 Declared order
An initiative SHALL record a rollout order as dependencies between its child repos, taken from the contracts. A cycle SHALL be rejected with the repos named.

#### Scenario: Cycle
- **WHEN** repo A depends on B and B on A
- **THEN** the initiative fails validation naming both

### Requirement: REL-002 Sequenced merge
Approving the final gate for an initiative SHALL merge children one at a time in dependency order, and SHALL start a repo only after its predecessors have merged.

#### Scenario: Provider first
- **WHEN** web depends on api
- **THEN** api merges before web is started

### Requirement: REL-003 Stop on failure
When a child fails to merge, the hub SHALL stop, leave later children unmerged and untouched, and keep the initiative resumable.

#### Scenario: Provider merge fails
- **WHEN** api cannot merge
- **THEN** web stays unmerged and the initiative reports where it stopped

### Requirement: REL-004 Readiness check first
Before any merge the hub SHALL check that every active child is ready, and SHALL refuse to start merging when one is not.

#### Scenario: Child still failing
- **WHEN** one child has failing checks
- **THEN** no repo is merged
