# Spec Delta

## ADDED Requirements

### Requirement: GATE-008 Contract mismatch blocks approval
When the contract check is enabled, a contract mismatch or missing contract SHALL count as a blocker at the gates that review proposal and design, so approval needs an override.

#### Scenario: Approve with mismatch
- **WHEN** a human approves without override while contracts disagree
- **THEN** the approval is refused listing the mismatch

#### Scenario: Check disabled
- **WHEN** the contract check is disabled in config
- **THEN** mismatches never block
