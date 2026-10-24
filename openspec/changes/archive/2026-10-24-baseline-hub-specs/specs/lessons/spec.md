# Spec Delta

## Purpose
Defines how retrospectives propose lessons and how a human decides which change future agent behaviour.

## ADDED Requirements

### Requirement: LSN-001 Proposals from the retrospective
When the final gate is approved, the runner SHALL read the `json lessons` block of `retrospective.md` and queue its rules (for known artifacts only) and context facts as pending lessons in `repos/<name>/lessons.json`, skipping duplicates.

#### Scenario: Duplicate lesson
- **WHEN** a proposed lesson matches an existing one
- **THEN** it is not queued again

#### Scenario: Malformed block
- **WHEN** the block is not valid JSON
- **THEN** no lessons are queued

### Requirement: LSN-002 Human decision
Lessons SHALL stay pending until a human accepts or rejects them by id or `all`; deciding a non-pending lesson SHALL fail.

#### Scenario: Unknown id
- **WHEN** the id is not a pending lesson
- **THEN** the command fails

### Requirement: LSN-003 Accepted lessons applied
Accepted lessons SHALL be added to the rendered `openspec/config.yaml` rules and context each time a change starts or resumes. Pending and rejected lessons SHALL NOT affect agents.

#### Scenario: Accepted rule
- **WHEN** a rule for `tasks` is accepted
- **THEN** the next change's tasks rules include it
