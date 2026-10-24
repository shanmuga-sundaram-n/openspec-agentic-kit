# Spec Delta

## Purpose
Defines the local SQLite store and the browser dashboard used to review changes and take gate actions.

## ADDED Requirements

### Requirement: DASH-001 Store is a rebuildable cache
The runner SHALL write status, documents and events to `data/agentic.db` on each state save, and the JSON state files SHALL remain the source of truth. Deleting the database SHALL lose nothing.

#### Scenario: Database deleted
- **WHEN** the database is removed
- **THEN** it is rebuilt from state on the next dashboard start

### Requirement: DASH-002 Runs without SQLite
Without `node:sqlite` the runner SHALL work as before, and `dashboard` SHALL stop with a message asking for Node 22.13+.

#### Scenario: Old Node
- **WHEN** `dashboard` runs on an unsupported Node
- **THEN** it exits with that message

### Requirement: DASH-003 Local-only access
The dashboard SHALL listen on 127.0.0.1, accept only localhost Host headers and same-origin requests, and require a per-process token for every action.

#### Scenario: Foreign host header
- **WHEN** a request carries a non-local Host header
- **THEN** it is rejected

#### Scenario: Missing token
- **WHEN** an action request lacks the token
- **THEN** it is rejected

### Requirement: DASH-004 Pipeline view
The dashboard SHALL show each change as its stages with gate state (approved, auto-approved, needs you, pending) and the work inside each stage, and SHALL filter by waiting, running, attention and done.

#### Scenario: Waiting change
- **WHEN** a change waits at a gate
- **THEN** it shows as needing the user

### Requirement: DASH-005 Gate actions through the CLI
Approve, request changes, abort, resume and start from the dashboard SHALL run the same CLI commands, so approver lists, blockers and the audit trail apply unchanged. Controls SHALL be disabled while agents run or a terminal holds the gate.

#### Scenario: Approve with blockers
- **WHEN** a change has blockers and the override box is unticked
- **THEN** approve is refused

### Requirement: DASH-006 Documents outlive worktrees
Artifacts, specs, review, approvals and the code diff SHALL stay readable after a change is merged and its worktree is deleted.

#### Scenario: Merged change
- **WHEN** a merged change is opened
- **THEN** its documents are shown from the store
