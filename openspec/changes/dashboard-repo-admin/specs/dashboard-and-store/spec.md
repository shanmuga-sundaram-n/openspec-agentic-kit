# Spec Delta

## ADDED Requirements

### Requirement: DASH-007 Repo and config administration
The dashboard SHALL register repos and edit a repo's `context.md`, gates, approvers and extra checks, using the same validation as the CLI, and SHALL refuse a save that fails validation without changing files.

#### Scenario: Invalid name
- **WHEN** a repo name is not lowercase kebab-case
- **THEN** the dashboard shows the CLI's error and writes nothing

### Requirement: DASH-008 Admin actions are protected
Every administration action SHALL require the per-process token and the same host and origin checks as other actions.

#### Scenario: Missing token
- **WHEN** an admin request lacks the token
- **THEN** it is rejected
