# Spec Delta

## ADDED Requirements

### Requirement: AGT-007 Allow-lists from presets
A role's effective allow-list SHALL be its base entries plus entries from selected presets, and a repo override that replaces the list SHALL replace the preset entries too.

#### Scenario: Preset entries merged
- **WHEN** a preset adds `Bash(go test *)` for the implementer
- **THEN** the implementer's effective list contains it and the base entries
