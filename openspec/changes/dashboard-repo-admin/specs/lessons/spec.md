# Spec Delta

## ADDED Requirements

### Requirement: LSN-008 Decide lessons from the dashboard
The dashboard SHALL list a repo's lessons and let a human accept or reject pending ones, with the same effect as the CLI commands.

#### Scenario: Accept in dashboard
- **WHEN** a pending lesson is accepted in the dashboard
- **THEN** it is accepted in `lessons.json` and applied to the next change
