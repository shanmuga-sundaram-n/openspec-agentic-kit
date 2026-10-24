# Spec Delta

## Purpose
Defines how the hub compares the cross-repo contracts drafted by each child of an initiative and surfaces disagreements before approval.

## ADDED Requirements

### Requirement: CON-001 Contract extraction
After a child writes `proposal.md` and `design.md`, the hub SHALL extract the content under their "Cross-repo contracts" headings. A child with no such section SHALL be reported as missing its contract.

#### Scenario: Missing section
- **WHEN** a child's design has no contracts heading
- **THEN** the initiative shows that child as missing its contract

### Requirement: CON-002 Mismatch detection
The hub SHALL compare contracts across the children of an initiative and report each mismatch with the child names and the differing statements.

#### Scenario: Different event name
- **WHEN** one child names an event `payout.refunded` and another `refund.created` for the same interface
- **THEN** a mismatch lists both statements

### Requirement: CON-003 Revision against a sibling
A reported mismatch SHALL be addressable through the existing revise flow, with the sibling's contract included in the feedback.

#### Scenario: Revise with sibling contract
- **WHEN** a human revises a child because of a mismatch
- **THEN** the feedback given to the agent includes the sibling's statement
