# Spec Delta

## ADDED Requirements

### Requirement: AGT-008 Process tree termination
On a timeout, the runner SHALL terminate the agent process and its children on every supported platform.

#### Scenario: Timeout on Windows
- **WHEN** an agent run times out on Windows
- **THEN** no child process of the agent remains running
