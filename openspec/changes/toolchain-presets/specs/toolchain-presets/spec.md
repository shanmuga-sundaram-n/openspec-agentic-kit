# Spec Delta

## Purpose
Defines named language presets that supply tool allow-lists, default commands and trace patterns for a repo.

## ADDED Requirements

### Requirement: TCP-001 Preset selection
A repo SHALL select presets by name in `repo.json`, and an unknown preset name SHALL fail with the available names.

#### Scenario: Unknown preset
- **WHEN** `toolchains` lists `cobol`
- **THEN** config loading fails naming the known presets

### Requirement: TCP-002 Preset contents
A preset SHALL add build, test and package-manager commands to the roles that need them, and MAY set default test command, setup command and trace test paths and patterns.

#### Scenario: Python preset
- **WHEN** the python preset is selected
- **THEN** the implementer and verifier may run the python test commands and the trace recognizes `test_*.py`

### Requirement: TCP-003 Presets never widen to a shell
A preset SHALL list specific command patterns and SHALL NOT grant unrestricted shell access.

#### Scenario: Wildcard shell
- **WHEN** a preset contains an allow-list entry for all commands
- **THEN** it is rejected as invalid

### Requirement: TCP-004 Detection suggestion
`repo add` SHALL suggest presets from files found in the checkout and SHALL NOT enable one without being told.

#### Scenario: Detected go.mod
- **WHEN** the checkout contains `go.mod`
- **THEN** the go preset is suggested and not enabled
