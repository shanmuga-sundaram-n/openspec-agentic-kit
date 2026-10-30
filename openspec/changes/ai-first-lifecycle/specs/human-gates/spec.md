# Spec Delta

## ADDED Requirements

### Requirement: GATE-008 Path rules raise the effective tier
Config SHALL allow path rules that match the change's paths and set a minimum risk tier. The paths SHALL be those the proposal declares until code exists, and the union of those and the diff afterwards. The tier used for gate policy SHALL be the higher of the tier declared in `proposal.md` and the highest minimum from any matching rule, and no rule SHALL lower it.

#### Scenario: Sensitive path escalates
- **WHEN** a change declared low risk modifies a path matched by a rule requiring high
- **THEN** gate policy is evaluated at high and a gate set to auto for low waits for a human

#### Scenario: Rule never lowers
- **WHEN** a rule sets a minimum of low and the change declares high
- **THEN** the tier used remains high

#### Scenario: Declared path before code exists
- **WHEN** the proposal declares a path matched by a rule requiring high and the design gate is reached
- **THEN** the design gate is evaluated at high and waits for a human

#### Scenario: Diff adds a path the proposal did not declare
- **WHEN** the diff touches a matched path the proposal did not declare
- **THEN** the tier is raised from that point and the gate summary says the path was undeclared

#### Scenario: No rule matches
- **WHEN** no rule matches the declared paths or the diff
- **THEN** the declared tier is used

### Requirement: GATE-009 Escalation is visible and audited
When a path rule raises the tier, the gate summary and the dashboard SHALL name the rule and the matched paths, and the entry in `approvals.md` SHALL record the effective tier.

#### Scenario: Escalated gate
- **WHEN** a gate waits because a path rule raised the tier
- **THEN** the summary names the rule and the paths that matched

#### Scenario: Audit entry
- **WHEN** a decision is recorded at an escalated gate
- **THEN** the entry shows the effective tier, not only the declared one

### Requirement: GATE-010 Approver groups on gates and path rules
A gate or path rule SHALL be able to require approval from a named approver group, and a decision at that gate SHALL be accepted only from a member of the group. When a path rule and the gate both name approvers, an approver SHALL have to satisfy both.

#### Scenario: Rule requires a group
- **WHEN** a path rule requires `platform-team` and a non-member tries to approve
- **THEN** the approval is refused naming the group

#### Scenario: Gate and rule both restrict
- **WHEN** the gate lists one set of approvers and the matching rule requires a group
- **THEN** only an approver who is in both is accepted

### Requirement: GATE-011 Live gate
After the merge, a change in a repo that configures a release SHALL stop at a live gate, G5, where only a human can confirm that the repo's own deployment has made the change live. The gate SHALL have no auto policy and SHALL record the decision, who and a note.

#### Scenario: Confirm live
- **WHEN** an approver confirms the change is live
- **THEN** the change moves to the watch window and the confirmation is recorded with who and a note

#### Scenario: No auto approval
- **WHEN** the risk tier is low
- **THEN** the live gate still waits for a human

#### Scenario: Not configured
- **WHEN** the repo configures no release
- **THEN** no live gate is created and the change ends at merged
