# Proposal

## Why

The Implementer and Verifier allow-lists cover npm, npx and node only, and the README tells users to hand-edit `allowedTools` for other languages. Wrong or missing entries make agents fail or, if over-broad, weaken the allow-list.

## What Changes

- Named presets (for example `python`, `go`, `jvm`, `rust`, `dotnet`) that add the matching test, build and package-manager commands to the right roles, plus sensible default `testCommand`, `setupCommand` and trace test paths and patterns.
- A repo selects presets in `repo.json` (`"toolchains": ["python"]`); `repo add` can detect and suggest them.
- Presets merge into the existing config layers so overrides still win.
- Non-goals: installing toolchains, granting shell-wide access.

## Capabilities

### New Capabilities
- `toolchain-presets`: selectable language presets for tools, commands and trace patterns

### Modified Capabilities
- `repo-registry-config`: config layering gains a preset layer between base and repo
- `agent-execution`: allow-lists can come from presets

## Impact

- `lib/hub.mjs` config loading, `repo add`, a `presets/` directory, `README.md`.
- Risk tier: medium (widens permitted commands). Rollback: remove the `toolchains` key.
