# Spec Delta

## ADDED Requirements

### Requirement: GIT-008 Deferred merge
A child's merge SHALL wait while any repo it depends on has not merged, and SHALL report what it is waiting for.

#### Scenario: Waiting on provider
- **WHEN** a consumer is approved before its provider merges
- **THEN** it reports the provider it waits for and does not merge
