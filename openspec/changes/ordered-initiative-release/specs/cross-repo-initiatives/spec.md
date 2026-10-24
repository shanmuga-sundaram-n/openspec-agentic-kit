# Spec Delta

## ADDED Requirements

### Requirement: INIT-006 Release gate approval is sequenced
Approving the release gate for an initiative SHALL follow the declared rollout order instead of approving all children in parallel. Earlier gates SHALL keep approving together.

#### Scenario: Earlier gate
- **WHEN** an initiative is approved at an earlier gate
- **THEN** all waiting children are approved together
