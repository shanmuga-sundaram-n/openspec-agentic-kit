# Proposal

## Why

The hub drives a change from idea to merge, then stops: nothing learns whether the change shipped or worked, gate policy depends only on a risk tier a human set once, and there is no way for an organisation to set rules that every repo must keep. To run AI-first delivery across many repos with confidence, the hub needs an org policy layer, stronger deterministic gates, and an observed outcome after merge, while deployment stays with each repo's CI/CD.

## What Changes

- Add an org policy layer between hub defaults and `repo.json`. Org settings are `required` (a repo can add but not remove or weaken), `defaults` (a repo can override) or `locked`. The hub checks the floor at `start` and `resume` and refuses a repo that drops a required item. A repo opts in with `"org": "<name>"`; without it, behaviour is unchanged.
- Add time-limited, logged waivers: a repo may waive an org-required check only with a reason, an expiry and a named org approver, recorded in `approvals.md`.
- Add path rules to gate policy: matches on the change's diff raise the effective risk tier and can require named approver groups. They never lower it. The dashboard shows why a gate escalated.
- Add named security checks (secrets, dependency audit, static analysis) as deterministic checks with a severity threshold that produces Merge-gate blockers. The security reviewer reads the real results.
- Add a docs-writer role and a changelog check, with the mandatory documentation kinds set by org policy.
- Add a live gate (G5) in a new `live` stage after the merge. G1 to G4 are unchanged, and Release approval (G4) archives and merges as today. Once the repo's CI/CD has deployed, a human confirms at G5 that the change is live. The hub never runs a deploy command and holds no deploy credentials.
- Add an observe-only `release` block in `repo.json` (probe command, watch minutes, rollback note). The dashboard process runs the read-only probe for the watch window and sets `released` or `regressed`. If the dashboard is not running, the change shows `unwatched`, never `released`. A change with no `release` config ends at `merged`, as today.
- Add agent evals: recorded cases replayed per role with deterministic assertions and an org-set pass bar. A repo that overrides a role prompt must supply cases for it.
- Record the released or regressed outcome with the change so later retrospectives and lessons can rest on real results. Whether the retrospective waits for the live gate is left open for `design.md`.
- Archive stays before merge, on the change branch, so a pull request contains the spec updates. This change does not alter that behaviour.

Non-goals: running deploys or holding deploy credentials, a CI-driven live signal, intake and incident-to-change automation, and lesson evidence and scope (folded into `lesson-retirement`).

## Capabilities

### New Capabilities
- `org-policy`: org-level policy layer with required, default and locked settings, the floor check, waivers, and approver groups.
- `agent-evals`: recorded eval cases per agent role, deterministic scoring, and an org-set pass bar for shared and overridden prompts.

### Modified Capabilities
- `human-gates`: path rules that raise the effective tier, approver groups, and the live gate (G5) after merge.
- `pipeline-orchestration`: a post-merge `live` stage with `merged`, `live`, `released`, `regressed` and `unwatched` states, and an outcome record.
- `build-and-checks`: named security checks with severity thresholds, the docs-writer role, and the changelog check.
- `repo-registry-config`: the org layer in the layer order, and the observe-only `release` block.
- `dashboard-and-store`: the watch window, the live-gate confirmation, the `regressed` view with its rollback note, and the `unwatched` state.

## Impact

- Code: `lib/hub.mjs` (config layering and floor check), `lib/checks.mjs` (security and changelog checks, path rules), `bin/agentic.mjs` (stage loop, live gate), `lib/dashboard.mjs` and `dashboard.html` (watch window, new states), `lib/status.mjs` and `lib/store.mjs` (new states and events).
- Config and schema: `config.base.json` (new `live` stage, gate and path rule shape), a new org policy file location, `schemas/agentic-sdlc/` (docs and changelog template), and a new `agents/docs-writer.md`.
- Dependencies: none added. The hub stays dependency-free Node ESM, and target repos stay clean.
- Sequencing: land `hub-test-suite` first, since path rules build on its `lib/gates.mjs` extraction. `toolchain-presets` supplies the per-language commands for security checks, and `pr-merge-strategy` shares the merge and pull-request state. `lesson-retirement` gains evidence and scope. `dashboard-repo-admin`, `initiative-contract-check`, `pr-merge-strategy` and `toolchain-presets` edit some of the same specs, so deltas may need reconciling.
- Open questions for `design.md`: the org boundary (one hub per org or several orgs), who owns org policy and how it is protected, who approves waivers, whether the retrospective waits for the live gate, and whether `regressed` offers an incident change.
