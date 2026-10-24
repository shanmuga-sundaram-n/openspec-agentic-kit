# Spec Delta

## ADDED Requirements

### Requirement: GIT-010 Platform-independent paths
State, exclude entries and trace paths SHALL use consistent separators so a change behaves the same on every supported platform.

#### Scenario: Exclude entries
- **WHEN** hub files are excluded in a Windows checkout
- **THEN** git ignores them as it does on other platforms
