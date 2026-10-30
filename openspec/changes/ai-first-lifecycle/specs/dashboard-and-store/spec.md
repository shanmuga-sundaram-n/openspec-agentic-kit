# Spec Delta

## ADDED Requirements

### Requirement: DASH-007 Watch window
While the dashboard process is running, it SHALL run the configured probe for each live change at an interval until its watch length ends, SHALL only read, and SHALL record each result with the change. The probe SHALL not change files, run a rollback or contact anything but what the probe command does itself.

#### Scenario: Healthy window
- **WHEN** every probe in the watch length succeeds
- **THEN** the change is marked `released` and the results are stored

#### Scenario: Failed probe
- **WHEN** a probe fails
- **THEN** the change is marked `regressed`, the failure is stored and no rollback is run

### Requirement: DASH-008 Unwatched state
A live change that nothing is watching SHALL be shown as `unwatched`, and SHALL never be shown or recorded as `released` until a watch window has completed.

#### Scenario: Dashboard not running
- **WHEN** a change is confirmed live and the dashboard is not running
- **THEN** the change shows `unwatched`

#### Scenario: Dashboard starts later
- **WHEN** the dashboard starts while a change is `unwatched`
- **THEN** it begins the watch window for that change

### Requirement: DASH-009 Live gate and regressed view
The dashboard SHALL show the live gate and let an approver confirm it through the same CLI command as other gate actions, so approver rules and the audit trail apply. For a `regressed` change it SHALL show the failed probe and the rollback note from the repo's release block.

#### Scenario: Confirm live from the dashboard
- **WHEN** an approver confirms the live gate in the dashboard
- **THEN** the same command runs as from the CLI and the decision is recorded

#### Scenario: Regressed change
- **WHEN** a change is `regressed`
- **THEN** the page shows the failed probe result and the rollback note

#### Scenario: Non-approver
- **WHEN** a user who is not an approver tries to confirm
- **THEN** the action is refused as it is on the CLI
