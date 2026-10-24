// Runs one role as a fresh, headless Claude Code session (claude -p --agent <role>).
// Each call is a new process with a clean context; the change folder is the only hand-off.
import fs from 'node:fs';
import path from 'node:path';
import { runAsync, writeJson, AgenticError, tail } from './util.mjs';

const ROLE_TITLES = {
  'product-analyst': 'Product Analyst',
  'spec-author': 'Spec Author',
  architect: 'Architect',
  'security-reviewer': 'Security Reviewer',
  'test-strategist': 'Test Strategist',
  planner: 'Planner',
  implementer: 'Implementer',
  verifier: 'Verifier',
  'code-reviewer': 'Code Reviewer',
  retrospective: 'Retrospective analyst',
};

export function roleTitle(role) { return ROLE_TITLES[role] || role; }

export async function runAgent({ config, role, prompt, cwd, logDir, label }) {
  const a = config.agent;
  const r = config.roles[role] || {};
  const args = ['-p', '--output-format', 'json', '--agent', role, '--permission-mode', a.permissionMode || 'acceptEdits'];
  if (a.permissionPrompts) args.push('--permission-prompts', a.permissionPrompts);
  if (a.maxBudgetUsdPerRun) args.push('--max-budget-usd', String(a.maxBudgetUsdPerRun));
  if (r.model) args.push('--model', r.model);
  if (a.effort) args.push('--effort', a.effort);
  // --allowedTools is variadic, so it goes last; the prompt is sent on stdin.
  if (r.allowedTools?.length) args.push('--allowedTools', ...r.allowedTools);

  const started = Date.now();
  const res = await runAsync(a.command || 'claude', args, {
    cwd, input: prompt, timeoutMs: (a.timeoutMinutes || 45) * 60_000,
  });
  const seconds = Math.round((Date.now() - started) / 1000);

  let out = null;
  try { out = JSON.parse(res.stdout.slice(res.stdout.indexOf('{'))); } catch { /* not JSON */ }
  const text = out?.result ?? tail(res.stdout || res.stderr, 30);
  const cost = Number(out?.total_cost_usd || 0);
  const isError = res.code !== 0 || res.timedOut || out?.is_error === true || out?.subtype?.startsWith?.('error');

  const logFile = path.join(logDir, `${new Date().toISOString().replace(/[:.]/g, '-')}-${label}.json`);
  writeJson(logFile, { role, label, args, seconds, exitCode: res.code, timedOut: res.timedOut, cost, prompt, output: out ?? res.stdout, stderr: tail(res.stderr, 50) });

  if (res.code === 127) throw new AgenticError(`Could not start "${a.command}". Is Claude Code installed and on PATH?`);
  return { ok: !isError, text: String(text || '').trim(), cost, seconds, logFile, timedOut: res.timedOut };
}

const HEADLESS = `There is no human in this session and nobody will answer questions. Never ask; make the most reasonable assumption, and list anything a human must decide under "Open questions:" in your final message.`;

function decisionsBlock(state) {
  const d = (state.decisions || []).filter(x => x.note);
  if (!d.length) return '';
  return `
Decisions recorded by human approvers (these override assumptions in earlier artifacts):
${d.map(x => `- [${x.gateLabel || x.gate}] ${x.note}`).join('\n')}
`;
}

function feedbackBlock(rev) {
  if (!rev) return '';
  return `
REVISION REQUESTED at gate ${rev.gateLabel || rev.gate} by ${rev.by}:
"""
${rev.feedback}
"""
Update your artifact only where this feedback requires it, keeping it consistent with the other artifacts of this change. If the feedback does not affect your artifact, leave it unchanged and say so.
`;
}

export function artifactPrompt({ state, artifact, role, instructionsFile, outputPath, revision }) {
  return `You are the ${roleTitle(role)} in an automated OpenSpec delivery pipeline. ${HEADLESS}

Change: ${state.id}
Original request: ${state.idea}
Your task: ${revision ? 'revise' : 'write'} the "${artifact}" artifact.
${decisionsBlock(state)}${feedbackBlock(revision)}
Steps:
1. Read ${instructionsFile}. It is the output of \`openspec instructions ${artifact} --change ${state.id} --json\` and holds the instruction, template, project context, rules and the dependency artifacts you must read.
2. Read every dependency it lists, plus any existing specs or code you need.
3. Write the artifact at ${outputPath} (relative to the repository root), following the instruction and template.
4. Do not modify any other artifact, anything under openspec/specs/, or any source code.

Final message, at most 10 lines: what you wrote, the key decisions, then "Open questions:" followed by a list, or "Open questions: none".`;
}

export function applyPrompt({ state, applyFile, testCommand, revision, failures }) {
  const fix = failures ? `
The previous build failed these checks. Fix the causes, not the checks:
"""
${failures}
"""
` : '';
  return `You are the Implementer in an automated OpenSpec delivery pipeline. ${HEADLESS}

Change: ${state.id}
${decisionsBlock(state)}${feedbackBlock(revision)}${fix}
Steps:
1. Read ${applyFile}. It is the output of \`openspec instructions apply --change ${state.id} --json\`: the context files to read and the task list.
2. Read openspec/changes/${state.id}/specs/, design.md, test-plan.md and tasks.md.
3. Work through every unchecked task in tasks.md in order. For each: write or update the failing test named in test-plan.md, run it, implement until it passes, then tick the task (- [x]).
4. Run the full test command before finishing: ${testCommand || '(none configured)'}
5. Never weaken or delete a test that maps to a scenario. Do not edit planning artifacts other than ticking tasks in tasks.md. If a task is blocked, leave it unticked and explain why.

Final message, at most 12 lines: tasks completed, tasks blocked with reasons, and test results.`;
}

export function reviewPrompt({ state, base, reviewFile }) {
  return `You are the Code Reviewer in an automated OpenSpec delivery pipeline. ${HEADLESS}

Change: ${state.id}
Review the implementation on this branch against the change's specs and design.

Steps:
1. Run \`git diff ${base}...HEAD\` to see everything this change adds.
2. Read openspec/changes/${state.id}/specs/, design.md, threat-model.md and test-plan.md.
3. Check: each requirement and scenario is implemented and tested; tests assert real behaviour; the threat model's required controls exist; no secrets, injection risks, missing error handling or obvious performance problems.
4. Write your findings to ${reviewFile} with exactly these sections:
   ## Blocking   (must fix before merge; write "- None" if none)
   ## Should fix
   ## Nits
   ## Spec conformance   (one line per requirement ID: conforms / partial / missing)
5. Do not modify any code or other artifact.

Final message: the number of blocking findings and a one-line verdict.`;
}
