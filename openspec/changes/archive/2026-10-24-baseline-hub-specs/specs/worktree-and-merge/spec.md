# Spec Delta

## Purpose
Defines where changes run, how target repos stay clean, and how an approved change is archived and merged.

## ADDED Requirements

### Requirement: GIT-001 Isolated change branch
Each change SHALL run on branch `change/<id>` in its own worktree under the configured `worktreeDir` by default; with `useWorktrees` off it SHALL switch branches in place and require a clean tree. It SHALL refuse to start when the branch already exists.

#### Scenario: Branch exists
- **WHEN** `change/<id>` already exists
- **THEN** start fails and names the branch

### Requirement: GIT-002 Target repos stay clean
The hub SHALL copy its agents, schema and rendered `openspec/config.yaml` into the worktree and hide them via `.git/info/exclude`. A file the repo already tracks at the same path SHALL NOT be overwritten.

#### Scenario: Repo has its own config
- **WHEN** `openspec/config.yaml` is tracked in the target repo
- **THEN** it is left alone and a warning says the hub context was not applied

### Requirement: GIT-003 Only the runner commits
The runner SHALL commit per stage and per approval. Agents SHALL NOT push.

#### Scenario: Stage ready
- **WHEN** a stage's work finishes
- **THEN** one commit records the stage as ready for its gate

### Requirement: GIT-004 Archive before merge
At the final gate the runner SHALL archive the change, merging delta specs into main specs, commit it, and then merge per `merge.strategy` (`no-ff`, `squash`, `ff-only` or `none`).

#### Scenario: Strategy none
- **WHEN** the strategy is none
- **THEN** the branch is left ready to merge and nothing is merged

### Requirement: GIT-005 Safe merge
The runner SHALL merge only when the main checkout is on the base branch with no uncommitted changes. Otherwise it SHALL print the manual command. A failed merge SHALL be aborted and its reason shown.

#### Scenario: Dirty main checkout
- **WHEN** the main checkout has uncommitted changes
- **THEN** no merge happens and the user is told the command to run

### Requirement: GIT-006 Optional push and cleanup
After a merge the runner SHALL push the base branch only when `merge.push` is on, and remove the worktree and delete the branch only when configured.

#### Scenario: Push off
- **WHEN** `merge.push` is false
- **THEN** nothing is pushed
