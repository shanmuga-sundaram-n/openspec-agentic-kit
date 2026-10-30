// Gate decisions as pure functions, so they can be tested without running the CLI.
// bin/agentic.mjs does the I/O (prompting, state, git); this module only decides.
import { AgenticError } from './util.mjs';

/** 'auto' or 'human' for a gate at a risk tier; anything not configured needs a human. */
export function policyFor(gate, risk) {
  return gate.policy?.[risk] || 'human';
}

/** A gate approves itself only when its policy is auto and nothing is blocking. */
export function isAutoApproved(policy, blockers) {
  return policy === 'auto' && !blockers.length;
}

/** An empty or missing approver list lets anyone approve; otherwise the git email must be listed (case-insensitive). */
export function isApprover(approvers, email) {
  const allowed = approvers || [];
  if (!allowed.length) return true;
  return allowed.map(s => s.toLowerCase()).includes(String(email || '').toLowerCase());
}

/** Failed checks and blocking review findings that stop an approval without an override. */
export function gateBlockers(state, stage) {
  const out = [];
  if (stage.checks) for (const c of state.checks || []) if (!c.ok) out.push(`check failed: ${c.name}`);
  if (stage.review) for (const b of state.reviewBlocking || []) out.push(`review: ${b}`);
  return out;
}

/** Index of the stage a revision restarts from: the named stage, or the current one. It cannot be a later stage. */
export function revisionTargetIndex(stages, currentIndex, currentStageId, targetStageId) {
  const target = stages.findIndex(s => s.id === (targetStageId || currentStageId));
  if (target < 0 || target > currentIndex) {
    throw new AgenticError(`Cannot revise stage "${targetStageId}"; choose the current or an earlier stage.`);
  }
  return target;
}
