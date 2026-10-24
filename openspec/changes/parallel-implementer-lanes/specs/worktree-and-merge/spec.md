# Spec Delta

## ADDED Requirements

### Requirement: GIT-007 Lane worktrees
Each lane SHALL run in a sub-worktree branched from the change branch, and lane worktrees SHALL be removed after a successful merge back.

#### Scenario: Lane merged
- **WHEN** a lane merges cleanly
- **THEN** its sub-worktree and branch are removed and the change branch holds its commits
