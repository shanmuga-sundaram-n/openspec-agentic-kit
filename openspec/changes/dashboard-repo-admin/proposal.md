# Proposal

## Why

Registering a repo and editing its config still require the terminal and hand-edited files, so the dashboard covers only part of the human side of the pipeline.

## What Changes

- Add repos from the dashboard (name, path, base branch, test and setup commands) through the same `repo add` code path.
- Edit `context.md`, `overrides.json` gates and approvers, and extra checks with validation before saving.
- Show and review lessons (list, accept, reject) in the dashboard.
- Keep the localhost-only host, origin and token rules for every new action.
- Non-goals: remote access, multi-user accounts, editing agent prompts.

## Capabilities

### New Capabilities

### Modified Capabilities
- `dashboard-and-store`: adds repo and config administration and lesson review
- `repo-registry-config`: config edits are validated against the layering rules before being written
- `lessons`: lessons can be decided from the dashboard

## Impact

- `lib/dashboard.mjs`, `lib/dashboard.html`, `lib/hub.mjs` validation helpers.
- Risk tier: medium (writes config from a web page). Rollback: hide the admin tab.
