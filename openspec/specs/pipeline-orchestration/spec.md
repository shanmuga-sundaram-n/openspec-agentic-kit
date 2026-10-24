# pipeline-orchestration Specification

## Purpose
Defines how a change moves from an idea through the configured stages, and how its state survives interruption.

## Requirements

### Requirement: PIPE-001 Configured stages
The runner SHALL execute the stages listed in config in order, running each stage's artifacts, build work and review before presenting that stage's gate.

#### Scenario: Stage order
- **WHEN** a change starts
- **THEN** stages run in config order and each stops at its gate before the next begins

### Requirement: PIPE-002 Artifact order from OpenSpec status
The runner SHALL decide which artifact to write next from `openspec status`, run only artifacts whose dependencies are done, and run independent ready artifacts in parallel when `parallelArtifacts` is on.

#### Scenario: Blocked artifact
- **WHEN** a stage's pending artifacts all wait on missing dependencies
- **THEN** the change fails with a message naming the waiting artifacts

### Requirement: PIPE-003 Persistent state and resume
The runner SHALL save change state to `state/<repo>/<id>.json` on every transition, and `resume` SHALL continue from the saved stage without redoing approved gates.

#### Scenario: Resume after failure
- **WHEN** a failed change is resumed
- **THEN** the stage index and approved gates are kept and work continues at the failed stage

### Requirement: PIPE-004 Single runner per change
The runner SHALL hold a lock per change and refuse to start a second runner while the locking process is alive. A stale lock from a dead process SHALL be ignored.

#### Scenario: Concurrent runner
- **WHEN** a second process starts the same change while the first is alive
- **THEN** it fails naming the process id

### Requirement: PIPE-005 Agent failure marks the change failed
When an artifact cannot be produced after one retry, the runner SHALL mark the change `failed` with the reason and stop.

#### Scenario: Artifact not written twice
- **WHEN** an agent finishes twice without writing its artifact
- **THEN** status is `failed` and the error tells the user to run `resume`

### Requirement: PIPE-006 Abort keeps work
Aborting a change SHALL set its status to `aborted` and keep its branch and worktree.

#### Scenario: Abort at a gate
- **WHEN** the user aborts at a gate
- **THEN** the change is `aborted` and the branch still exists

#### Scenario: Resume an aborted change
- **WHEN** an aborted change is resumed without `--force`
- **THEN** the command fails; with `--force` the change continues

### Requirement: PIPE-007 Non-interactive mode
When not attached to a terminal or when `--detach` is given, the runner SHALL print the commands to approve or revise and stop at the gate instead of prompting. Closed input SHALL pause and never approve.

#### Scenario: Detached run
- **WHEN** a change reaches a gate under `--detach`
- **THEN** the runner exits after printing the approve and revise commands
