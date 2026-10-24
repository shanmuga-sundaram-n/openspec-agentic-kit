# Spec Delta

## ADDED Requirements

### Requirement: REG-005 Preset layer
The effective config SHALL apply selected presets after `config.base.json` and before `repo.json` and `overrides.json`, so repo settings and overrides still win.

#### Scenario: Override beats preset
- **WHEN** a preset sets a test command and `repo.json` sets another
- **THEN** the repo's command is used
