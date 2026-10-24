# Spec Delta

## Purpose
Defines how independent task groups are built in parallel lanes, each isolated in its own worktree, and merged back into the change branch.

## ADDED Requirements

### Requirement: LANE-001 Lane declaration
Tasks SHALL be grouped into lanes by the Planner, each lane listing the files it touches. A change with no lane markings SHALL run as a single lane.

#### Scenario: Unmarked tasks
- **WHEN** tasks.md has no lane markings
- **THEN** one Implementer builds all tasks as today

### Requirement: LANE-002 Bounded parallelism
The runner SHALL run at most `maxLanes` lanes at once, and `maxLanes` of 1 SHALL give the pre-existing serial behaviour.

#### Scenario: More lanes than the limit
- **WHEN** four lanes exist and `maxLanes` is 2
- **THEN** at most two Implementers run at any time

### Requirement: LANE-003 Overlap serializes lanes
Lanes whose declared file sets overlap SHALL NOT run at the same time.

#### Scenario: Shared file
- **WHEN** two lanes both list `src/api.js`
- **THEN** they run one after the other

### Requirement: LANE-004 Conflict stops the change
When merging a lane back conflicts, the runner SHALL abort that merge, mark the change failed naming the lane and files, and leave other lanes' work intact.

#### Scenario: Merge conflict
- **WHEN** a lane cannot merge cleanly
- **THEN** the change is `failed` with the conflicting files listed and `resume` is available after a human fix

### Requirement: LANE-005 Per-lane caps
The budget and timeout caps SHALL apply to each lane run, and lane costs SHALL be added to the change total.

#### Scenario: Cost rollup
- **WHEN** two lanes cost 1.00 and 2.00 USD
- **THEN** the change total rises by 3.00 USD
