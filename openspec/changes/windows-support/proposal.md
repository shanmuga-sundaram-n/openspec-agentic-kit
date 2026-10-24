# Proposal

## Why

The README says Windows is untested. The code already branches on `win32` in one place, but path handling, `sh`/`cmd` commands, `SIGTERM` timeouts, lock liveness and `less` paging are likely to misbehave there.

## What Changes

- Audit and fix path separators in state, trace and exclude files, shell execution, process termination of agent children, and the pager fallback.
- Document supported platforms and any limits.
- Run the test suite on Windows in CI once it exists.
- Non-goals: PowerShell-specific features, WSL-only support.

## Capabilities

### New Capabilities

### Modified Capabilities
- `agent-execution`: timeouts terminate the whole agent process tree on Windows
- `worktree-and-merge`: git and path handling is platform independent
- `build-and-checks`: configured check commands run on the platform shell

## Impact

- `lib/util.mjs`, `lib/git.mjs`, `lib/checks.mjs`, `bin/agentic.mjs` pager and lock code, README platform note.
- Depends on `hub-test-suite`. Risk tier: low. Rollback: revert the commits.
