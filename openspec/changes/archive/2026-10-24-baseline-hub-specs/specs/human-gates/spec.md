# Spec Delta

## Purpose
Defines the human approval gates between stages, who may approve, how feedback re-runs work, and the audit record.

## ADDED Requirements

### Requirement: GATE-001 Policy by risk tier
Each gate SHALL have a policy of `human` or `auto` per risk tier. A gate set to `auto` SHALL be approved automatically only when nothing is blocking; otherwise it SHALL wait for a human.

#### Scenario: Auto-approve low risk
- **WHEN** the risk tier is low, the gate policy is auto and no check or review blocks
- **THEN** the gate is recorded as auto-approved and the pipeline continues

#### Scenario: Blocked gate never auto-approves
- **WHEN** the policy is auto but a check failed
- **THEN** the change waits for a human

### Requirement: GATE-002 Risk tier source
The risk tier SHALL come from the `Risk tier:` line in `proposal.md`, default to medium when absent, and be changeable by a human at the first gate.

#### Scenario: Missing tier line
- **WHEN** proposal.md has no `Risk tier:` line
- **THEN** the change is treated as medium risk and a warning is shown

### Requirement: GATE-003 Blockers need an override
Approval SHALL be refused while any check fails or the reviewer has blocking findings, unless the approver explicitly overrides, and an override SHALL be recorded as such.

#### Scenario: Approve with failing check
- **WHEN** a human approves without override while a check fails
- **THEN** the approval is refused and lists the blockers

#### Scenario: Override
- **WHEN** a human approves with override
- **THEN** approvals.md records the decision as an override

### Requirement: GATE-004 Restricted approvers
When a gate lists approvers, only a git user email on that list SHALL be able to approve it.

#### Scenario: Unlisted approver
- **WHEN** a user whose email is not listed tries to approve
- **THEN** the approval is refused naming the gate

### Requirement: GATE-005 Revision with feedback
A human SHALL be able to request changes with feedback and a target stage no later than the current one. The runner SHALL reset gates from that stage, re-run its artifacts with the feedback, and keep the feedback visible to later agents.

#### Scenario: Revise an earlier stage
- **WHEN** feedback is given at the third gate targeting the second stage
- **THEN** gates from the second stage are pending again and its artifacts are revised

#### Scenario: Revise a later stage
- **WHEN** the target stage is after the current one
- **THEN** the command fails

### Requirement: GATE-006 Approval notes become decisions
A note given with an approval SHALL be stored and passed to later agents as a human decision that overrides earlier assumptions.

#### Scenario: Note recorded
- **WHEN** a human approves with a note
- **THEN** later agent prompts include the note under the gate's name

### Requirement: GATE-007 Audit trail
Every gate decision SHALL be appended to `approvals.md` in the change with time, gate, decision, who, risk tier and note, and that file SHALL be archived and merged with the change.

#### Scenario: Auto decision recorded
- **WHEN** a gate is auto-approved
- **THEN** approvals.md has a row by the runner naming the policy
