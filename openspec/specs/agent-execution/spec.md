# agent-execution Specification

## Purpose
Defines how each role runs as an isolated headless Claude Code session with bounded tools, cost and time.

## Requirements

### Requirement: AGT-001 Fresh session per run
Each agent run SHALL be a new headless `claude -p --agent <role>` process that receives its prompt on stdin. Agents SHALL exchange work only through the OpenSpec change folder.

#### Scenario: Two runs share nothing
- **WHEN** the same role runs twice
- **THEN** the second run has no memory of the first beyond files on disk

### Requirement: AGT-002 Per-role model and tool allow-list
Each role SHALL run with the model and `allowedTools` set in config. Tools not on the list SHALL be denied without prompting.

#### Scenario: Unlisted tool
- **WHEN** a role tries a tool outside its allow-list
- **THEN** the call is refused and no prompt is shown

### Requirement: AGT-003 Cost and time caps
Each run SHALL be capped by `maxBudgetUsdPerRun` and `timeoutMinutes`. A timed-out run SHALL be stopped and reported as timed out.

#### Scenario: Timeout
- **WHEN** a run exceeds the timeout
- **THEN** the process is stopped and the artifact retry or failure path applies

### Requirement: AGT-004 Run log
Every run SHALL be logged under `runs/<repo>/<id>/` with role, label, arguments, prompt, output, cost, seconds and exit status.

#### Scenario: Inspect a failed run
- **WHEN** a run fails
- **THEN** its log file path is shown and holds the prompt and output

### Requirement: AGT-005 Headless prompts
Agent prompts SHALL tell the agent no human is present, to make reasonable assumptions, and to list anything a human must decide under "Open questions".

#### Scenario: Ambiguity
- **WHEN** an agent meets an ambiguity
- **THEN** it records an assumption and an open question instead of asking

### Requirement: AGT-006 Missing CLI
When the agent command cannot be started, the runner SHALL fail naming the command and suggesting Claude Code is installed and on PATH.

#### Scenario: No claude binary
- **WHEN** the command is not found
- **THEN** the error says to install Claude Code
