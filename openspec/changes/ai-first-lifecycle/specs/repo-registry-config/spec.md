# Spec Delta

## MODIFIED Requirements

### Requirement: REG-002 Layered configuration
The effective config for a repo SHALL be `config.base.json`, then the org policy when the repo names an org, then `repo.json`, then `overrides.json`, last wins. Objects SHALL merge key by key; arrays and scalars SHALL be replaced, except where the org policy marks a setting required or locked.

#### Scenario: Override replaces an array
- **WHEN** `overrides.json` sets `extraChecks` to a new list
- **THEN** the effective `extraChecks` equals that list and contains none of the base entries

#### Scenario: Override merges an object
- **WHEN** `overrides.json` sets only `roles.implementer.model`
- **THEN** the other `roles.implementer` keys keep their base values

#### Scenario: Org layer sits between base and repo
- **WHEN** a repo names an org whose policy sets a default and the repo's `repo.json` sets another value
- **THEN** the repo value wins over the org value, which wins over the base value

#### Scenario: Required org setting survives an array override
- **WHEN** the org requires a check and `overrides.json` replaces the check list
- **THEN** the floor check reports the missing required check instead of silently accepting the override

## ADDED Requirements

### Requirement: REG-005 Observe-only release configuration
A repo MAY configure a `release` block with a probe command, a watch length in minutes and a rollback note. The hub SHALL run only the probe, SHALL treat the rollback note as advice shown to a human, and SHALL refuse a release block that contains a deploy command.

#### Scenario: Release configured
- **WHEN** `repo.json` has a probe, a watch length and a rollback note
- **THEN** the change gets a live stage after merge and the probe is the only command the hub runs in it

#### Scenario: Deploy command present
- **WHEN** the release block contains a deploy command
- **THEN** the command that loads the config fails naming the key

#### Scenario: No release block
- **WHEN** `repo.json` has no release block
- **THEN** the repo behaves as before and changes end at merged
