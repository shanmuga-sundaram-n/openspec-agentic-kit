# Spec Delta

## ADDED Requirements

### Requirement: BLD-008 Platform shell for checks
Configured check and setup commands SHALL run through the platform shell and report their exit status and output the same way on every supported platform.

#### Scenario: Failing command on Windows
- **WHEN** a configured check exits non-zero on Windows
- **THEN** the check fails with the command's output tail
