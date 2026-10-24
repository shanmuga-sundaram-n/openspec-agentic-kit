# Proposal

## Why

Children of a cross-repo initiative draft their "Cross-repo contracts" independently and never read each other's, so mismatches surface only when a human compares them at the approval gates (a documented limit).

## What Changes

- After each child writes its proposal and design, the hub extracts the contract sections and compares them across children.
- Mismatches (a path, event name, field or error format stated differently) are shown at the gate as blockers or warnings, and the dashboard lists them side by side.
- A child can be asked to revise against the sibling's contract through the existing `revise` flow.
- Non-goals: generating contracts, enforcing them at runtime, merging contracts into a shared artifact.

## Capabilities

### New Capabilities
- `initiative-contract-check`: extraction and comparison of cross-repo contracts

### Modified Capabilities
- `cross-repo-initiatives`: linked gates account for contract mismatches
- `human-gates`: contract mismatches can block approval

## Impact

- `bin/agentic.mjs` initiative commands, `lib/status.mjs` blockers, dashboard initiative view, a contract section format in the templates.
- Risk tier: medium. Rollback: disable the check in config.
