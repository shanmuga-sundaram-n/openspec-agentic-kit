# Spec Delta

## ADDED Requirements

### Requirement: REG-006 Validated config edits
A config edit from any surface SHALL be validated against the layering rules and known keys before it is written, and a failed edit SHALL leave the existing files unchanged.

#### Scenario: Unknown gate id
- **WHEN** an edit names a gate that does not exist
- **THEN** it is rejected and the file is unchanged
