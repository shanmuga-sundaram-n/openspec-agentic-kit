# Design

## Context

See proposal.md - Why, and the delta specs for the requirements. Constraints that shape the approach:

- The hub is dependency-free Node ESM (20.19+, dashboard 22.13+). Target repos stay clean and only the runner commits.
- Config is layered by `mergeConfig` (objects merge, arrays and scalars replace), loaded by `loadConfig` as `config.base.json`, `repo.json`, `overrides.json`. The replace-arrays rule is why a repo can today drop an inherited check.
- Stages and gates come from `config.base.json`. `release` is the last stage and its gate G4 archives and merges, then the worktree is removed. State files are index-based (`stageIndex`), and `state/*.json` is the source of truth with the SQLite store as a rebuildable cache.
- Deterministic checks run through `extraChecks` (`{name, command}`, pass or fail by exit status). The tier comes from the `Risk tier:` line in `proposal.md`.
- The dashboard is the only long-running process, and it serves on localhost with a per-process token.
- `hub-test-suite` is expected first and extracts gate decisions into `lib/gates.mjs`. Path rules, approver groups and the live gate build on that module.

## Goals / Non-Goals

**Goals:**
- Add an org policy layer that repos can tighten but not silently weaken, without changing behaviour for repos that name no org.
- Make gate escalation depend on what a change touches, not only on a tier set once.
- Record what happened after merge (live, released, regressed) without the hub ever deploying.
- Keep every new rule enforceable by deterministic code, not by an agent's judgment.

**Non-Goals:**
- Running deploys, holding deploy credentials, or reading CI/CD state (the live signal is a human).
- Authenticating people beyond the existing git-email approver model.
- Intake, incident-to-change automation, and lesson evidence (the latter lives in `lesson-retirement`).
- Changing G1 to G4 behaviour, archive-before-merge, or the merge strategies.

## Decisions

**D1. Org policy is a hub file: `orgs/<name>/policy.json`, referenced by `"org"` in `repo.json`.**
It sits beside `repos/` and is committed with the hub, so changes to org policy are visible in the hub's git history. Several orgs can coexist, and a hub for a single org is just the one-folder case, which settles the org-boundary question without a mode switch. Alternatives: one `policy.json` at the hub root (rejected: cannot serve two orgs, and every repo would be forced under it); a remote policy URL (rejected: adds network and trust surface to a local tool).

**D2. Layer order changes, but `mergeConfig` does not.**
Order becomes base, then org `defaults`, then `repo.json`, then `overrides.json`, merged by the existing pure function, then a separate floor step enforces `required` and `locked`. Keeping merge dumb keeps its tests valid and keeps array-replace semantics for everything not governed by the org. Alternatives: teach merge about required items (rejected: it would change `REG-002` behaviour for every repo and mix two concerns).

**D3. The floor step checks three shapes of required setting.**
- List membership by `name` (checks, doc kinds, path rules): every required entry must be present in the effective list.
- Bounds (`min` or `max`, such as a severity threshold or an eval pass bar): the effective value must be at least as strict.
- Equality (`locked`): the org value is forced after merge and the ignored repo value is reported.
It runs at `start` and `resume` and fails with the missing item and the file that dropped it. Alternative: compare against a stricter-than relation per key (rejected: unbounded; three shapes cover the proposal).

**D4. Waivers are data in `repo.json`, validated against the org, and honest about their limits.**
A waiver is `{check, reason, expires, approvedBy}`. `approvedBy` must be an email in the org's `waiverApprovers` group, and expiry is compared at floor-check time. Each use is written into `approvals.md`. This is attestation by file, not authentication: a repo owner with write access could forge it. The control is visibility (it is in the gate summary, `approvals.md` and git history), and the gap is recorded under Risks.

**D5. Path rules are pure, and evaluated at every gate from the best paths available.**
`effectiveTier(declared, rules, paths)` lives in `lib/gates.mjs` with a small glob matcher (`*`, `**`) written in-house. Paths are the proposal's declared paths until a diff exists, then the union with `git diff --name-only <base>...<branch>`. To make G1 and G2 evaluable, the `agentic-sdlc` proposal template and instruction gain an `Affected paths:` line next to the `Risk tier:` line. A path in the diff that was not declared raises the tier and is named at the gate. Alternative: evaluate only on the diff (rejected: G2, which can auto-approve at low risk, would never see a sensitive path).

**D6. Security checks reuse `extraChecks`; the hub supplies the threshold, the tool enforces it.**
A named check is an `extraChecks` entry with a `kind` (`secrets`, `deps-audit`, `sast`). The hub runs it with `AGENTIC_SEVERITY_THRESHOLD` set and treats a nonzero exit as a failure, because parsing arbitrary scanner output without dependencies would be fragile. If the command writes a SARIF file to a configured `report` path, the hub reads the `level` fields only to show findings and to hand them to the Security Reviewer. Presets from `toolchain-presets` will supply the commands; until then a repo or org supplies them. Alternative: a built-in scanner (rejected: scope and maintenance).

**D7. The live stage is a new final stage and G5 a new gate, both skipped when no `release` is configured.**
`config.base.json` appends `{id: "live", gate: "G5"}` and a G5 gate whose policy is `human` at every tier. Appending keeps existing `stageIndex` values valid, so in-flight changes are not disturbed. The runner skips the stage when the repo has no `release` block or when the change was not merged. G5 reads from saved state and the store, never from the worktree, because the worktree is removed at G4. Resume for this stage must not re-provision files into a missing worktree. Alternative: split G4 into two gates (rejected: it would change `GATE-*` and `GIT-004` behaviour that nothing needs changed).

**D8. Post-merge state lives in the change's state file, and `unwatched` is derived.**
State gains `post: {phase, confirmedBy, confirmedAt, probes[], lastTick}`. `phase` is `merged`, `live`, `released` or `regressed`. `unwatched` is not stored: a change in `live` whose `lastTick` is older than twice the probe interval is shown as unwatched. That makes a crashed or stopped dashboard visible without relying on process liveness, and it can never produce `released` by absence.

**D9. The watch window runs in the dashboard process, and only the dashboard process.**
A timer in the dashboard loops over `live` changes and runs the repo's `release.probe` with the main checkout as cwd, a timeout, and the output captured. Rules that keep this safe: the command comes only from `repo.json`, never from a request; no HTTP route accepts a command or a path; nothing but the probe runs; rollback is shown, never executed. On start, the dashboard resumes any change that is `live` or `unwatched`. Without `node:sqlite` the dashboard cannot run, so such changes stay `unwatched`, which is the honest outcome. Alternative: a scheduled external job (rejected for now: the hub has no daemon and a second runtime path doubles the failure modes).

**D10. Docs are a new artifact with a deterministic check beside it.**
The `agentic-sdlc` schema gains a `docs` artifact (template `docs.md`) produced by a `docs-writer` role after verification, with that role added to `roles` and `artifactRoles` in `config.base.json`. A check confirms that each required kind exists in the diff (for example the changelog file path matched by configured patterns), unless `docs.md` records `No user-facing impact:` with a reason. Org policy lists the mandatory kinds as a required list.

**D11. Evals are hub commands with their own storage, and are never part of a change run.**
Cases live under `evals/<role>/<case>/` in the hub, with repo cases under `repos/<name>/evals/`. A run sets up a scratch checkout, runs the role through the existing agent runner, and scores with deterministic assertions that reuse existing logic (`specTrace`, section and ID checks, the run log for denied tools). Scoring is a pass rate against a bar, not a single boolean, because model output varies. Cost comes from the run log and the existing per-run caps still apply. Alternative: run evals automatically on every prompt edit (rejected: costs money without a human asking).

## Risks / Trade-offs

- [Org floor gives false confidence] → It stops accidental removal, not a repo owner who edits the org file or forges a waiver. State this in the README, show waivers at gates and record them in `approvals.md`.
- [In-house glob matcher is wrong at edge cases] → Keep it to `*` and `**`, test it as pure logic in the `hub-test-suite` layout, and fail closed (an unparseable rule blocks the start).
- [Path escalation surprises users] → Gate summary and the dashboard name the rule and the matched paths, and the audit entry records the effective tier.
- [Dashboard now executes commands] → Probe commands are read from `repo.json` only, never from requests, with a timeout, and rollback is never executed. Reuse the existing localhost, origin and token checks.
- [Flaky probe marks a healthy change regressed] → One failure means `regressed` by spec (DASH-007). Mitigate with a retry inside one probe tick, and see Open Questions for a consecutive-failure threshold.
- [Live stage breaks in-flight changes or missing worktrees] → The stage is appended, skipped when unconfigured, and reads only from state and the store.
- [Security command contract is tool-specific] → Exit code plus threshold env var is the one contract. Presets hide it from users, and a missing command fails loudly at the floor check when the org requires it.
- [Evals are noisy and cost money] → Pass-rate bar, explicit start only, per-run caps, and cost in the report.
- [Overlap with roadmap specs] → `human-gates`, `repo-registry-config` and `dashboard-and-store` are also edited by other proposals. This change uses ADDED requirements wherever possible and MODIFIES only REG-002. Rebase the deltas when another change archives first.

## Migration Plan

1. Land `hub-test-suite` first so `lib/gates.mjs` exists and merge behaviour is covered.
2. Ship org layer and floor check behind the `org` key. With no `org` in `repo.json` nothing changes, so existing repos need no migration.
3. Ship path rules, security checks and docs. Defaults leave them off, so behaviour changes only when a repo or org turns them on.
4. Ship the live stage and watch. A repo with no `release` block behaves as today. A repo that adds one starts with `unwatched` until the dashboard runs.
5. Ship evals last, as hub commands that nothing else depends on.

Rollback: each step is additive and gated by config. Removing the `org` key, the `release` block, or the new `extraChecks` entries returns a repo to its previous behaviour. The appended stage and gate can be removed from `config.base.json` without invalidating saved state, because no earlier `stageIndex` points at them.

## Open Questions

- Should a regressed change offer a one-click "start incident change" that seeds a new `start` with the failure? It does not change the specs, so it can follow.
- Should regression need N consecutive probe failures? The spec says one failure, and a threshold can be a later config option with default 1.
- Should the retrospective get a post-live addendum, or should outcomes only feed the next change's retrospective and lessons? This design records the outcome (PIPE-011) and leaves the retrospective at G4.
- Is git history enough protection for `orgs/<name>/policy.json`, or does an org need a signed or read-only file? The design assumes git history and revisits only if you hand the hub to separate teams.
