# Spec Delta

## ADDED Requirements

### Requirement: BLD-007 Security checks
Config SHALL allow the named security checks `secrets`, `deps-audit` and `sast`, each with a command supplied by the repo or its toolchain. They SHALL run with the other deterministic checks, and a finding at or above the configured severity threshold SHALL be a blocker at the Merge gate.

#### Scenario: Finding above the threshold
- **WHEN** the `secrets` check reports a finding at or above the threshold
- **THEN** the check fails and the Merge gate lists it as a blocker

#### Scenario: Finding below the threshold
- **WHEN** a check reports only findings below the threshold
- **THEN** the check passes and the findings are shown without blocking

#### Scenario: Check not configured
- **WHEN** a repo configures none of the security checks and its org does not require them
- **THEN** no security check runs

### Requirement: BLD-008 Threat model reads scan results
When security checks have run, the Security Reviewer SHALL be given their results and `threat-model.md` SHALL address each finding at or above the threshold.

#### Scenario: Findings addressed
- **WHEN** a scan reports findings above the threshold
- **THEN** the threat model names each one and its disposition

### Requirement: BLD-009 Docs and changelog
A docs-writer role SHALL produce the documentation kinds the repo or its org requires, such as a changelog entry or a release note, after verification and before the Merge gate. A check SHALL fail when a required kind is missing, unless the change records that it has no user-facing impact and why.

#### Scenario: Changelog missing
- **WHEN** a changelog entry is required and the change did not add one
- **THEN** the check fails and the Merge gate lists it as a blocker

#### Scenario: No user-facing impact
- **WHEN** the change records a reason that it has no user-facing impact
- **THEN** the required documentation check passes and the reason is shown at the gate

#### Scenario: Org requires a kind
- **WHEN** the org requires a migration note for every change
- **THEN** a repo cannot satisfy the check without one, except through a waiver
