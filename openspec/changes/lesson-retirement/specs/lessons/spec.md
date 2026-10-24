# Spec Delta

## ADDED Requirements

### Requirement: LSN-004 Retire a lesson
A human SHALL be able to retire an accepted lesson with a reason, and retired lessons SHALL stop being applied to agents.

#### Scenario: Retire
- **WHEN** an accepted rule is retired
- **THEN** the next change's config no longer includes it

#### Scenario: Not accepted
- **WHEN** the lesson is pending or rejected
- **THEN** retire fails

### Requirement: LSN-005 Staleness flag
The hub SHALL record the change that last confirmed each lesson and flag accepted lessons not confirmed in a configured number of changes as stale for review. A stale lesson SHALL remain applied until a human retires it.

#### Scenario: Stale lesson
- **WHEN** an accepted lesson goes unconfirmed past the limit
- **THEN** lessons list marks it stale and it is still applied

### Requirement: LSN-006 Conflict detection
On accept, the hub SHALL warn when the lesson duplicates or contradicts an accepted lesson for the same artifact, naming both.

#### Scenario: Near-duplicate
- **WHEN** a lesson repeats an accepted rule with trivial wording differences
- **THEN** accept warns and names the existing lesson

### Requirement: LSN-007 Role-prompt lessons
A lesson MAY target a role prompt. An accepted role-prompt lesson SHALL be applied only as a per-repo agent override and SHALL NOT edit the shared role prompts.

#### Scenario: Accepted prompt lesson
- **WHEN** a lesson for the architect role is accepted
- **THEN** the repo's architect prompt gains it and the shared prompt is unchanged
