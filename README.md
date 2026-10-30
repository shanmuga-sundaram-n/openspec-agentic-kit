# Agentic hub: delivery pipeline for many repos

Runs a change from a one-line idea to merged code on your own machine. Specialised Claude Code agents write every artifact and the code; the runner stops at four human gates and continues when you approve.

```
idea ─► research, proposal ─► [Proposal approval] ─► specs, design, threat model, test plan ─► [Design review]
     ─► tasks, build, checks, verification, code review ─► [Merge approval] ─► retrospective ─► [Release approval]
     ─► openspec archive (specs updated) ─► merged into your base branch
```

Each agent runs as a fresh headless session (`claude -p --agent <role>`), so context stays clean. Agents hand work to each other only through the OpenSpec change folder. The runner itself is plain Node with no dependencies: it decides what runs next from `openspec status`, runs deterministic checks between agents, and records every gate decision.

## What you need

- Node.js 20.19 or later, and git (the dashboard needs Node 22.13 or later, for the built-in `node:sqlite`)
- OpenSpec CLI: `npm install -g @fission-ai/openspec@latest`
- Claude Code, signed in: `npm install -g @anthropic-ai/claude-code` then run `claude` once to log in

## Hub layout

```
bin/agentic.mjs            CLI
lib/                       runner modules (hub.mjs = registry, config layering, provisioning)
agents/                    ten role prompts, shared by every repo
schemas/agentic-sdlc/      workflow schema and templates, shared
openspec.base.yaml         shared per-artifact rules; `context:` is filled per repo
config.base.json           default roles, gates, stages, budgets
repos/<name>/
  repo.json                path, plus optional baseBranch, testCommand, setupCommand, extraChecks
  context.md               product, stack, conventions (becomes `context:` in openspec/config.yaml)
  overrides.json           optional: gates, models, allowedTools, ... (deep-merged over the base)
  agents/*.md              optional: replace a role prompt for this repo only
state/ runs/ .agentic/worktrees/   runtime data, keyed by repo (git-ignored; location set by `worktreeDir`)
data/agentic.db            SQLite store the dashboard reads (git-ignored)
test/                      node:test suite: unit/, integration/, helpers/, fixtures/ (see Tests)
```

Config layers, last wins: `config.base.json`, `repos/<name>/repo.json`, `repos/<name>/overrides.json`. Objects merge key by key; arrays are replaced.

Target repos stay clean. On every start and resume the hub copies agents, the schema and a rendered `openspec/config.yaml` into the change's worktree and hides them with `.git/info/exclude`. Anything the repo already tracks at the same path (its own agents, its own `openspec/config.yaml`) is left alone.

## Register a repo

```
node bin/agentic.mjs repo add payments-api ~/code/payments-api --test "npm test" --setup "npm ci"
# then edit repos/payments-api/context.md
node bin/agentic.mjs repo list
```

Requirements: Node 20.19+, git, the OpenSpec CLI (`npm i -g @fission-ai/openspec@latest`) and Claude Code signed in. The repo needs a commit on its base branch; it does not need OpenSpec or the kit installed.

## Run a change

```
node bin/agentic.mjs start "Partners can refund settled payouts within 30 days" --repo payments-api
node bin/agentic.mjs status                  # every repo
node bin/agentic.mjs approve <id> --note "..."
```

`--repo` can be dropped when you run from inside a registered checkout (`AGENTIC_REPO` also works), or for commands that take a change id that is unique across repos. Worktrees live in `.agentic/worktrees/<repo>/<id>` (the `worktreeDir` setting) on branch `change/<id>` in the target repo. Optional shortcut: `alias agentic="node ~/path/to/agentic-kit/bin/agentic.mjs"`.

## Cross-repo initiatives

One idea that touches several repos becomes an initiative: one child change per repo, started in parallel, with gates you approve together.

```
node bin/agentic.mjs initiative start "Partners can refund payouts within 30 days" --repos payments-api,partner-web
node bin/agentic.mjs initiative status [id]
node bin/agentic.mjs initiative approve <id> --note "..."     # same gate in every repo at once
node bin/agentic.mjs initiative resume <id>
```

- Child changes are named `<initiative>-<repo>` and each runs its own full pipeline, branch and worktree in its repo.
- Each child is told which repos are involved and must state shared interfaces under a "Cross-repo contracts" heading in `proposal.md` and `design.md`.
- **Linked gates:** `initiative approve` refuses unless every active child is waiting at the same gate, so no repo is approved to merge ahead of the others. `--partial` approves only the ones waiting; `--override` is passed to each child.
- Limit: children draft their contracts independently. The agents do not read each other's artifacts, so compare the contract sections at Proposal approval and Design review and use `revise` where they disagree.
- Limit: merges at Release approval happen per repo as each child is processed, not as one atomic release. Plan rollout order in the contracts.

## Self-improvement

The hub learns from each change, with a human deciding what sticks.

1. The Retrospective agent ends each change with a `json lessons` block: one-line `rules` per artifact (research, proposal, specs, design, threat-model, test-plan, tasks) and `context` facts about the repo.
2. When Release approval is given, the runner queues them in `repos/<name>/lessons.json` as `pending`. Duplicates are skipped.
3. You review them: `node bin/agentic.mjs lessons list --repo <name>`, then `lessons accept <id|all>` or `lessons reject <id|all>`.
4. Accepted lessons are added to that repo's `openspec/config.yaml` rules and context every time a change starts or resumes, so the next change's agents follow them.

Nothing changes agent behaviour until you accept it. `lessons.json` lives in the hub, so commit it to keep the history of what the hub learned. Limits: lessons only add rules and context; they do not edit agent prompts, and nothing is retired automatically, so prune old ones by editing `lessons.json`.

## Dashboard

```
node bin/agentic.mjs dashboard [--port 4777]
```

A page on `127.0.0.1` (refreshes every 4 seconds) that shows every change as a pipeline: the four stages with their gates (approved, auto-approved, needs you, pending) and the work inside each stage (artifacts, build tasks, checks, verification, review) marked done, working, failed or pending. Filter by waiting, running, needs attention or done. Initiatives show one mini-pipeline per repo.

Everything on the page comes from a SQLite database, `data/agentic.db`, not from the files directly:

- The runner writes each change's status, documents and history to it every time it saves state. The dashboard also syncs from `state/` on each refresh, so changes from older runs, or ones written without the store, still appear. The first time it sees a change it backfills history from `runs/` and `approvals.md`.
- Tables: `changes` (pipeline status and checks), `documents` (artifacts, specs, review, code diff, approvals), `events` (timeline of status changes, agent runs with cost and seconds, gate decisions), `initiatives`.
- Documents stay readable after a change is merged and its worktree is deleted. The code diff is captured while the change waits at a gate, so changes merged before the store existed have none.
- Only process liveness (is an agent running now?) is checked live, from the lock file.
- Without `node:sqlite` the runner works as before and `dashboard` stops with a message asking for Node 22.13+. The JSON state files remain the source of truth; delete `data/agentic.db` any time and it rebuilds on the next dashboard start.

The page also has a **Recent activity** feed across all changes, **spend by repo and by agent role**, and a **Timeline** tab per change.

Diagrams: a ```` ```mermaid ```` block in any artifact (design.md, for example) renders as a diagram, with Expand and Source toggles. Mermaid is loaded on demand from jsDelivr, pinned to 11.4.0 with a Subresource Integrity hash, and runs in strict mode. Offline, or with the CDN blocked, the block shows its source instead. A change deep-links as `#<repo>/<id>` or `#<repo>/<id>/<tab>`, for example `#todo-app/my-change/design.md`.

Click a change to review it: every artifact and spec rendered, the code diff (colour-coded), checks, blocking review findings, agent notes and `approvals.md`. At a gate you can:

- **Approve**, with a note that is recorded in `approvals.md` and passed to later agents. At Proposal approval you can also change the risk tier.
- **Approve anyway** when checks fail or the reviewer blocked: you must tick the override box, and it is recorded as an override.
- **Request changes** with feedback and the stage to restart from.
- **Abort**, or **Resume** a failed, stalled or aborted change (the aborted case runs `resume --force`).
- **Approve an initiative** at the same gate in every repo at once, or **resume** the repos that stopped.
- **Start** from **New change**: describe the idea, pick one repo for a change or several for a cross-repo initiative, optionally set the risk tier and id. It runs research and proposal and then waits for you at Proposal approval.

That covers the whole human side of the pipeline (start, review, approve, request changes, override, risk tier, abort, resume) without the terminal. Only registering a repo (`repo add`) and editing config stay in the CLI/files.

Actions run the same CLI commands you would type (`approve`, `revise`, `resume`, `abort`), so approver lists, blockers and the audit trail apply unchanged, and the approver is the git user of the target repo. Controls are disabled while agents are running, or while a terminal session is sitting at the same gate. The server accepts only `127.0.0.1`/`localhost` Host headers and same-origin requests, and every action needs a per-process token embedded in the page.

## Gates

| Gate | You approve | Low risk | Medium risk | High risk |
| --- | --- | --- | --- | --- |
| Proposal approval | research.md, proposal.md, risk tier | human | human | human |
| Design review | specs, design, threat model, test plan | auto | human | human |
| Merge approval | code diff, checks, verification.md, review.md | human | human | human |
| Release approval | retrospective, then archive and merge | auto | human | human |

The Product Analyst sets the risk tier in proposal.md; you can change it at Proposal approval with `t`. Gates are shown by their `label` (compact spots use `name`) from `gates` in config; the `G1`–`G4` ids are only internal keys and stay in `approvals.md`. Auto-approval only happens when nothing is blocking. Change the policy, or restrict who may approve a gate by git email, under `gates` in `config.base.json` or a repo's `overrides.json`.

Merge approval is blocked while any check fails or the reviewer reports a blocking finding. Revise, or type `override` (recorded as an override).

## What runs automatically between gates

At the build stage, after the Planner writes tasks.md:

1. The Implementer works through the tasks test-first, for up to `maxApplyPasses` passes until every task is ticked.
2. The runner checks: `openspec validate --strict`, all tasks ticked, your test command, a spec-to-test trace, and your `extraChecks`.
3. If anything fails, the Implementer gets the failures and tries again, up to `maxFixAttempts` times.
4. The Verifier writes verification.md from real test runs.
5. The Code Reviewer writes review.md. Blocking findings get one automatic fix pass, then a fresh review.

The spec-to-test trace requires every ADDED or MODIFIED requirement to have an ID (`### Requirement: PAY-012 Refund window`), at least as many test references as it has scenarios (tests mention `PAY012`), and every scenario named in test-plan.md.

## Audit trail

- `openspec/changes/<id>/approvals.md`: every gate decision with who, when, risk tier and note. It moves into `openspec/changes/archive/` with the change and is merged with the code.
- `review.md`, `verification.md` and `retrospective.md` live in the change folder too.
- `runs/<repo>/<id>/`: the prompt, arguments, output and cost of every agent run (git-ignored).
- Git history on `change/<id>`: one commit per stage and per approval.

## Configuration reference (`config.base.json`, per-repo `repo.json` / `overrides.json`)

| Key | Default | Purpose |
| --- | --- | --- |
| `testCommand` | `npm test` | Run in the worktree after each build and fix pass |
| `setupCommand` | empty | Run once in each new worktree, e.g. `npm ci` |
| `extraChecks` | `[]` | More checks, e.g. `[{"name": "lint", "command": "npm run lint"}]` |
| `useWorktrees` | `true` | Run each change in its own worktree; `false` switches branches in place |
| `roles.<role>.model` | opus / sonnet | Model per role |
| `roles.<role>.allowedTools` | per role | Tools each role may use without asking; everything else is denied |
| `agent.maxBudgetUsdPerRun` | `5` | Spending cap per agent run |
| `agent.timeoutMinutes` | `45` | Time cap per agent run |
| `merge.strategy` | `no-ff` | `no-ff`, `squash`, `ff-only`, or `none` to leave the branch for a PR |
| `merge.push` | `false` | Push the base branch after merging |
| `notifyCommand` | empty | Run at each gate with `$AGENTIC_MESSAGE`, e.g. a desktop notification |

To use the Implementer's language toolchain, add its commands to `roles.implementer.allowedTools` and `roles.verifier.allowedTools`, e.g. `"Bash(pytest *)"`, `"Bash(go test *)"`, `"Bash(mvn *)"`.

Notification examples: macOS `osascript -e "display notification \"$AGENTIC_MESSAGE\" with title \"agentic\""`, Linux `notify-send agentic "$AGENTIC_MESSAGE"`.

## Tests

```
npm test             # unit and integration tests, offline, no model calls
npm run test:unit    # unit tests only
```

The suite uses only `node:test` and `node:assert/strict`, so it adds no dependencies. `test/run.mjs` passes explicit file paths to `node --test`: a directory argument fails on Node 22, globs are missing on Node 20, and a bare `node --test` would also execute helpers and fixtures under `test/`.

Integration tests run the real CLI against throwaway copies, with a stub instead of `claude`. They need the `openspec` CLI on `PATH` and skip with a reason when it is missing; unit tests do not need it. To run one file:

```
node --test test/integration/harness.test.mjs
```

- `test/helpers/hub.mjs` copies `bin/`, `lib/`, `agents/`, `schemas/` and the base config into a temp dir (so state, runs, repos and worktrees never touch the real hub), creates a temp git repo on `main`, and runs the copy's CLI as a child process. `createHub(t)` and `createTargetRepo(t)` clean up after the test.
- `test/helpers/claude-stub.mjs` replaces `claude -p --agent <role>`. It reads the real prompt, writes canned artifacts from `test/fixtures/artifacts/`, and prints the JSON shape the runner parses (`test/fixtures/claude-output.sample.json`). `hub.addRepo(name, path)` points the repo's `agent.command` at it through `overrides.json`.
- Set `hub.scenario` before a run to change what the stub does: `risk` (tier written into `proposal.md`), `cost`, `failTimes: { design: 2 }` (exit 1 for the first two calls), `skip: ['design']` (succeed without writing the file), `blockingReview: true | n` (reviewer reports a blocking finding, always or for the first n reviews).
- Start every file that starts changes with `const SKIP = openspecMissing() ?? false;` and pass `{ skip: SKIP }`.

To add a scenario, put it in `test/integration/` (files run in parallel; tests inside a file run one after another, so keep slow scenarios in separate files). Start from `setup(t, { risk, config, test })` in `test/helpers/scenario.mjs`, which returns `{ hub, target, name }`, then drive the CLI with `hub.run([...])` and assert on the output, `hub.state(repo, id)`, `approvals.md` or the target repo with `gitIn`. Agent prompts are logged under `runs/<repo>/<id>/` in the hub copy, so a test can assert on what an agent was told. An integration run of the whole suite takes about a minute; the unit tests take under a second.

Test files are named `test/unit/<area>.test.mjs`. Name each test with the requirement id from `openspec/specs` with the hyphen removed (for example `REG002 arrays are replaced`, `GATE004 ...`), so the hub's own spec-to-test trace can see it.

## Notes

- Merge happens only when your main checkout is on the base branch with no uncommitted changes; otherwise the runner tells you the command to run.
- Agents run with `--permission-mode acceptEdits` and an allow-list per role; any tool not on the list is refused without prompting. Agents cannot push, and only the runner commits.
- A failed agent run marks the change `failed` with the reason; fix it and run `resume <id>`.
- Implementation runs one Implementer at a time. Parallel lanes across worktrees are a possible extension.
- Tested end to end on Linux with real agents. macOS should behave the same. Windows has not been tested.
