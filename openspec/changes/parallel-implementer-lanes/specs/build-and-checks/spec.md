# Spec Delta

## ADDED Requirements

### Requirement: BLD-007 Checks follow all lanes
Deterministic checks SHALL run only after every lane has finished and been merged into the change branch.

#### Scenario: Lane still running
- **WHEN** one lane is unfinished
- **THEN** no checks run yet

#### Scenario: Failed lane
- **WHEN** a lane fails its apply passes
- **THEN** checks still run on the merged result and the failure is shown at the merge gate
