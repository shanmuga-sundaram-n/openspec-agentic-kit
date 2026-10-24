# Spec Delta

## ADDED Requirements

### Requirement: GATE-009 Approval does not imply merge
Under the `pr` strategy, approving the final gate SHALL authorize opening the pull request only, and the audit trail SHALL record that decision.

#### Scenario: Audit entry
- **WHEN** the final gate is approved under the pr strategy
- **THEN** approvals.md records the approval and the pull request opened
