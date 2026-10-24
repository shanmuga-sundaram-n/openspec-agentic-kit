# Spec Delta

## ADDED Requirements

### Requirement: GIT-009 PR end state
A change released under the `pr` strategy SHALL end in a "PR opened" state with the pull request URL recorded, distinct from merged.

#### Scenario: State recorded
- **WHEN** the pull request is opened
- **THEN** state holds the URL and the change is not yet merged
