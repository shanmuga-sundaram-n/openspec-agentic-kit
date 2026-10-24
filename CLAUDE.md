# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

The "agentic hub": a dependency-free Node ESM CLI that drives OpenSpec changes across many target repos. Each pipeline step runs a fresh headless Claude Code session (`claude -p --agent <role>`); agents communicate only through the OpenSpec change folder, and the runner stops at four human gates (G1 intent, G2 design, G3 merge, G4 release). `README.md` documents user-facing behaviour in depth (gates, initiatives, lessons, dashboard, config reference).

Constraints: Node 20.19+ (dashboard needs 22.13+ for `node:sqlite`); **do not add npm dependencies**; target repos must stay clean.

## Commands

There is no build, lint, or test suite in this repo. Run the CLI directly:

```
node bin/agentic.mjs repo add <name> <path> --test "npm test" --setup "npm ci"
node bin/agentic.mjs repo list
node bin/agentic.mjs start "<idea>" --repo <name>
node bin/agentic.mjs status | resume <id> | approve <id> --note "..." | revise <id> | abort <id>
node bin/agentic.mjs initiative start "<idea>" --repos a,b      # cross-repo; also status/approve/resume
node bin/agentic.mjs lessons list|accept|reject --repo <name>
node bin/agentic.mjs dashboard [--port 4777]
```

`openspec/` at the hub root is the hub's own OpenSpec project (the `.claude/skills` and `.claude/commands/opsx` are the standard OpenSpec skills for developing the hub itself with `/opsx:*`). It is separate from the `agentic-sdlc` schema that the hub applies to *target* repos.

## Architecture

- `bin/agentic.mjs` (~800 lines) is the whole orchestrator: command handlers (`cmd*`), the stage loop (`drive` → `driveStages` → `runStageWork` → `gate`), build loop (`buildUntilTasksDone`, `checkAndFix`, `runReview`), and `archiveAndMerge`. Stages and gates come from `config.base.json` (`stages`, `gates`, `artifactRoles`), not hardcoded.
- `lib/` modules: `hub.mjs` (repo registry, config layering, provisioning into worktrees), `agent.mjs` (spawns `claude -p`, budget/timeout), `openspec.mjs` (wraps the `openspec` CLI; `openspec status` decides what runs next), `checks.mjs` (deterministic checks incl. spec-to-test trace), `git.mjs` (worktrees, commits, merge), `status.mjs` / `store.mjs` (state files + SQLite store), `lessons.mjs` (self-improvement queue), `dashboard.mjs` + `dashboard.html` (local web UI over the SQLite store).
- Config layers, last wins: `config.base.json` → `repos/<name>/repo.json` → `repos/<name>/overrides.json`. Objects deep-merge; arrays replace. `repos/<name>/context.md` becomes `context:` in the rendered target `openspec/config.yaml` (from `openspec.base.yaml`), plus accepted lessons.
- `agents/*.md` are the ten role prompts shared by all repos (a repo can override via `repos/<name>/agents/`). `schemas/agentic-sdlc/` is the shared workflow schema and templates. On every start/resume the hub copies these into the change's worktree and hides them via `.git/info/exclude`; files the target repo already tracks at those paths are left alone.
- Per-role model and `allowedTools` live in `config.base.json`; agents run with `--permission-mode acceptEdits` and anything off the allow-list is denied. Only the runner commits; agents cannot push.
- Runtime data is git-ignored: `state/` (JSON state is the source of truth), `runs/` (per-agent-run prompt/output/cost), `.agentic/worktrees/`, `data/agentic.db` (rebuildable dashboard cache). `repos/` and `initiatives/` hold config; commit `lessons.json` to keep learned history.
- Requirement IDs (`AREA-NNN`) and test names embedding them without the hyphen (e.g. `PAY012`) are enforced by the spec-to-test trace check; keep that convention when changing schema, templates, or checks.
