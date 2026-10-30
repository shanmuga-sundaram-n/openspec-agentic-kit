# Spec Delta

## ADDED Requirements

### Requirement: PIPE-008 Post-merge live stage
For a repo that configures a release, the pipeline SHALL continue after a successful merge into a `live` stage whose gate is G5. G1 to G4 and the order of the earlier stages SHALL be unchanged.

#### Scenario: Merged change enters the live stage
- **WHEN** a change merges and its repo configures a release
- **THEN** its status becomes `merged` and the runner waits at the live gate

#### Scenario: Earlier stages unchanged
- **WHEN** a change runs the intent, design, build and release stages
- **THEN** gates G1 to G4 behave as before

### Requirement: PIPE-009 Changes without a release end at merged
A change whose repo configures no release, or whose merge strategy leaves the branch unmerged, SHALL end after the release stage as it does today, with no live stage and no watch.

#### Scenario: No release config
- **WHEN** the repo has no release configuration
- **THEN** the change is complete after the release stage and shows no live or watch state

#### Scenario: Strategy none
- **WHEN** the merge strategy is none
- **THEN** the change does not enter the live stage until it has been merged

### Requirement: PIPE-010 Post-merge states
After merge a change SHALL be in exactly one of `merged`, `live`, `released`, `regressed` or `unwatched`, and the state SHALL be saved on each transition so a resume continues from it.

#### Scenario: Healthy watch
- **WHEN** the watch window ends with every probe healthy
- **THEN** the state is `released`

#### Scenario: Failed probe
- **WHEN** a probe fails during the watch window
- **THEN** the state is `regressed`

#### Scenario: No watcher
- **WHEN** a change is live and nothing is running the watch
- **THEN** the state is `unwatched` and never `released`

### Requirement: PIPE-011 Outcome record
The runner SHALL record the outcome of a change, with its time, who confirmed live and the probe results, in the change's saved state and store, so later retrospectives and lessons can use it. The record SHALL remain readable after the worktree is removed.

#### Scenario: Outcome recorded
- **WHEN** a change reaches `released` or `regressed`
- **THEN** the outcome, time and probe results are saved with the change

#### Scenario: After cleanup
- **WHEN** the worktree has been removed
- **THEN** the outcome record can still be read

### Requirement: PIPE-012 The hub never deploys
The runner SHALL NOT run any deploy command and SHALL NOT hold deploy credentials. Deployment SHALL remain the responsibility of the repo's own CI/CD.

#### Scenario: Live stage runs
- **WHEN** a change is in the live stage
- **THEN** the only commands the hub runs are the configured probes
