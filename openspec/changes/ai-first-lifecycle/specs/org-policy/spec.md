# Spec Delta

## Purpose
Lets an organisation set delivery policy once and have every attached repo keep it. Projects may tighten org policy and customise its defaults, but may not silently drop what the org requires.

## ADDED Requirements

### Requirement: ORG-001 Org attachment and layer order
A repo SHALL opt in to an org by naming it in `repo.json`. When it does, the effective config SHALL be built from `config.base.json`, then the org policy, then `repo.json`, then `overrides.json`. A repo that names no org SHALL be configured exactly as before.

#### Scenario: Repo attached to an org
- **WHEN** `repo.json` names an org that has a policy
- **THEN** the org policy is applied between the hub defaults and the repo's own settings

#### Scenario: Repo without an org
- **WHEN** `repo.json` names no org
- **THEN** the effective config is identical to the config built without an org layer

#### Scenario: Unknown org
- **WHEN** `repo.json` names an org that has no policy
- **THEN** the command fails naming the org and the file to fix

### Requirement: ORG-002 Required, default and locked settings
Each org setting SHALL be marked `required`, `default` or `locked`. A repo SHALL be able to add to a required setting but not remove or weaken it, SHALL be able to override a default, and SHALL NOT change a locked setting.

#### Scenario: Repo adds to a required list
- **WHEN** the org requires the `secrets` check and a repo adds a check of its own
- **THEN** the effective checks contain both

#### Scenario: Repo overrides a default
- **WHEN** the org sets a default severity threshold and the repo sets a different one
- **THEN** the repo's value is used

#### Scenario: Repo changes a locked setting
- **WHEN** a repo's config sets a value for a locked key
- **THEN** the org value is kept and the hub reports the ignored value

### Requirement: ORG-003 Floor check
At `start` and `resume` the hub SHALL verify that every required org item is still present in the effective config, and SHALL refuse to run the change, naming each missing item and the file that dropped it, when one is not.

#### Scenario: Repo drops a required check
- **WHEN** `overrides.json` replaces the check list with one that omits an org-required check
- **THEN** `start` fails and names the missing check and the file

#### Scenario: Floor satisfied
- **WHEN** every required item is present in the effective config
- **THEN** the change starts normally

### Requirement: ORG-004 Waivers
A repo SHALL be able to waive an org-required check only through a waiver that has a reason, an expiry date and a named org approver. A waiver SHALL stop applying after its expiry, and each use SHALL be recorded in `approvals.md`.

#### Scenario: Valid waiver
- **WHEN** a waiver names a reason, a future expiry and an org approver
- **THEN** the waived check does not block the floor check and its use is recorded in `approvals.md`

#### Scenario: Expired waiver
- **WHEN** a waiver's expiry date has passed
- **THEN** the floor check fails for the waived item as if there were no waiver

#### Scenario: Waiver without an approver
- **WHEN** a waiver lacks a reason, an expiry or a named approver
- **THEN** it is rejected and the floor check applies

### Requirement: ORG-005 Approver groups
An org policy SHALL be able to define named approver groups, and a gate or path rule SHALL be able to name a group instead of listing emails. Only a git user email in the group SHALL be able to approve that gate.

#### Scenario: Gate names a group
- **WHEN** a gate lists the group `platform-team` and a member approves
- **THEN** the approval is accepted

#### Scenario: Non-member approves
- **WHEN** an email outside the group tries to approve that gate
- **THEN** the approval is refused naming the group
