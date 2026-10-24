# Spec Delta

## ADDED Requirements

### Requirement: INIT-005 Contract status in initiative views
Initiative status SHALL show, per gate, whether contracts are consistent, mismatched or missing, in the CLI and the dashboard.

#### Scenario: Mismatch shown
- **WHEN** contracts disagree
- **THEN** initiative status lists the mismatch under the waiting gate
