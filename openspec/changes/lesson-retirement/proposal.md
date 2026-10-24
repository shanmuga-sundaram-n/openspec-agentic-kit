# Proposal

## Why

Accepted lessons only ever add rules and context, and nothing is retired, so a repo's config grows without bound and stale or contradicting rules keep steering agents. Lessons also never change agent prompts.

## What Changes

- Lessons gain a lifecycle: `retired` alongside pending, accepted and rejected, with `lessons retire <id>` and a reason.
- Track which change last confirmed a lesson and flag long-unused accepted lessons for review.
- Detect near-duplicate and conflicting accepted lessons on accept.
- Optionally propose prompt-level lessons for a role, applied as a per-repo agent override only after human acceptance.
- Non-goals: automatic retirement without a human, editing shared `agents/*.md`.

## Capabilities

### New Capabilities

### Modified Capabilities
- `lessons`: retirement, staleness flags, conflict detection and role-prompt lessons

## Impact

- `lib/lessons.mjs`, the `lessons` CLI, the retrospective prompt and template, `repos/<name>/lessons.json` format (backward compatible).
- Risk tier: low. Rollback: ignore the new statuses.
