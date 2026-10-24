# Spec Delta

## Purpose
Defines how target repos are registered with the hub and how their effective configuration is built from layers.

## ADDED Requirements

### Requirement: REG-001 Repo registration
The hub SHALL register a repo from a lowercase kebab-case name and a path inside a git repository, writing `repos/<name>/repo.json` and a `context.md` stub. It SHALL refuse a duplicate name or a path outside git.

#### Scenario: Register a new repo
- **WHEN** the user runs `repo add payments-api <path>` for a git checkout
- **THEN** `repos/payments-api/repo.json` holds the checkout root and a `context.md` template exists

#### Scenario: Invalid or duplicate name
- **WHEN** the name is not lowercase kebab-case, or is already registered
- **THEN** the command fails with an error and nothing is written

### Requirement: REG-002 Layered configuration
The effective config for a repo SHALL be `config.base.json`, then `repo.json`, then `overrides.json`, last wins. Objects SHALL merge key by key; arrays and scalars SHALL be replaced.

#### Scenario: Override replaces an array
- **WHEN** `overrides.json` sets `extraChecks` to a new list
- **THEN** the effective `extraChecks` equals that list and contains none of the base entries

#### Scenario: Override merges an object
- **WHEN** `overrides.json` sets only `roles.implementer.model`
- **THEN** the other `roles.implementer` keys keep their base values

### Requirement: REG-003 Repo resolution
A command SHALL resolve its repo from `--repo`, then `AGENTIC_REPO`, then the registered checkout containing the current directory, then the repo of a change id that is unique across repos. It SHALL fail naming the registered repos when none matches.

#### Scenario: Run from inside a checkout
- **WHEN** a command runs from a subdirectory of a registered checkout without `--repo`
- **THEN** that repo is used

#### Scenario: Ambiguous change id
- **WHEN** the same change id exists in two repos and no repo is given
- **THEN** the command fails and asks for `--repo`

### Requirement: REG-004 Unknown or missing repo
The hub SHALL fail with a message naming the repo when its registration is unknown or its path no longer exists.

#### Scenario: Path removed
- **WHEN** `repo.json` points at a deleted directory
- **THEN** the command fails and names the file to edit
