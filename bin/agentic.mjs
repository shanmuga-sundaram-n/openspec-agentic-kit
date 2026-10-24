#!/usr/bin/env node
// Agentic hub: one runner for many repos.
// Drives a change from idea to merged code with role agents, stopping at human gates.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import * as os from '../lib/openspec.mjs';
import * as git from '../lib/git.mjs';
import * as checks from '../lib/checks.mjs';
import * as hub from '../lib/hub.mjs';
import * as store from '../lib/store.mjs';
import * as lessons from '../lib/lessons.mjs';
import { runAgent, artifactPrompt, applyPrompt, reviewPrompt, roleTitle } from '../lib/agent.mjs';
import { C, say, step, ok, warn, fail, AgenticError, readJson, writeJson, slugify, nowStamp, shell, countLines, tail, runAsync } from '../lib/util.mjs';
import { serve } from '../lib/dashboard.mjs';

// ───────────────────────────────── setup ─────────────────────────────────

const HUB_ROOT = hub.HUB_ROOT;
const SELF = process.argv[1];
// Bound to the target repo by useRepo() before any command that needs one.
let REPO = null, ROOT = null, config = null, STATE_DIR = null, RUNS_DIR = null;

function useRepo(name) {
  REPO = hub.loadRepo(name);
  ROOT = REPO.path;
  config = hub.loadConfig(REPO);
  STATE_DIR = path.join(HUB_ROOT, 'state', name);
  RUNS_DIR = path.join(HUB_ROOT, 'runs', name);
}

/** Command line to show the user for continuing a change in the current repo. */
const cli = sub => `node ${SELF} ${sub} --repo ${REPO.name}`;

const statePath = id => path.join(STATE_DIR, `${id}.json`);
const lockPath = id => path.join(STATE_DIR, `${id}.lock`);
const logDir = id => path.join(RUNS_DIR, id);
const save = s => {
  s.updatedAt = new Date().toISOString();
  writeJson(statePath(s.id), s);
  store.sync(s, { repo: REPO.name, config, root: ROOT }); // the dashboard reads this; failures never stop the runner
};
const load = id => {
  if (!fs.existsSync(statePath(id))) throw new AgenticError(`No change "${id}" found. Run "status" to list changes.`);
  return readJson(statePath(id));
};

let rl = null;
const interactive = () => process.stdin.isTTY && process.stdout.isTTY && !FLAGS.detach;
// Returns the trimmed answer, or null when input has closed (Ctrl+D, closed pipe).
// Callers treat null as "pause": an interrupted prompt never approves anything.
let inputClosed = false;
async function ask(q) {
  if (inputClosed) return null;
  if (!rl) {
    rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.on('close', () => { inputClosed = true; rl = null; });
  }
  try { return (await rl.question(q)).trim(); } catch { inputClosed = true; return null; }
}
async function askMultiline(q) {
  say(q + C.dim(' (finish with an empty line)'));
  const lines = [];
  for (;;) { const l = await ask('  > '); if (l === null) return null; if (!l) break; lines.push(l); }
  return lines.join('\n');
}

function lock(id) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  if (fs.existsSync(lockPath(id))) {
    const pid = Number(fs.readFileSync(lockPath(id), 'utf8'));
    let alive = false;
    try { process.kill(pid, 0); alive = true; } catch { /* stale */ }
    if (alive && pid !== process.pid) throw new AgenticError(`Change "${id}" is already being run by process ${pid}.`);
  }
  fs.writeFileSync(lockPath(id), String(process.pid));
  const release = () => { try { fs.unlinkSync(lockPath(id)); } catch { /* gone */ } };
  process.on('exit', release);
}

function notify(message) {
  process.stdout.write('\x07');
  if (config.notifyCommand) shell(config.notifyCommand, { cwd: HUB_ROOT, env: { AGENTIC_MESSAGE: message, AGENTIC_REPO: REPO.name } });
}

// ──────────────────────────────── preflight ───────────────────────────────

function preflight() {
  os.checkInstalled();
  const missing = hub.missingAssets(config, REPO);
  if (missing.length) throw new AgenticError(`Missing in the hub:\n${missing.map(m => '  ' + m).join('\n')}`);
}

function provision(workdir) {
  const { warning } = hub.provision(config, REPO, workdir);
  if (warning) warn(warning);
}

// ──────────────────────────────── artifacts ───────────────────────────────

function outputHint(id, instr) {
  const out = instr.outputPath || '';
  return out.includes('*')
    ? `openspec/changes/${id}/specs/<capability>/spec.md (one file per capability listed in proposal.md)`
    : `openspec/changes/${id}/${out}`;
}

function revisionFor(state, stage) {
  const r = state.revision;
  if (!r || !r.pendingStages.includes(stage.id)) return null;
  if (r.stage === stage.id) return r;
  return { ...r, feedback: `Upstream artifacts were revised at ${r.gate} for this feedback:\n${r.feedback}\nUpdate your artifact so it stays consistent with them.` };
}

async function runArtifact(state, artifact, revision) {
  const role = config.artifactRoles[artifact];
  if (!role) throw new AgenticError(`No role mapped to artifact "${artifact}" in the hub config`);
  const instr = os.instructions(state.workdir, state.id, artifact);
  const instrFile = path.join('.agentic', 'tmp', `${artifact}.instructions.json`);
  writeJson(path.join(state.workdir, instrFile), instr);
  const prompt = artifactPrompt({ state, artifact, role, instructionsFile: instrFile, outputPath: outputHint(state.id, instr), revision });

  for (let attempt = 1; attempt <= 2; attempt++) {
    step(`${roleTitle(role)} ${revision ? 'revising' : 'writing'} ${C.b(artifact)}${attempt > 1 ? ' (retry)' : ''}`);
    const res = await runAgent({ config, role, prompt: attempt === 1 ? prompt : prompt + `\n\nYour previous attempt did not produce ${outputHint(state.id, instr)}. Write it now.`, cwd: state.workdir, logDir: logDir(state.id), label: `${artifact}${revision ? '-rev' : ''}` });
    state.costUsd += res.cost;
    state.notes[artifact] = { role, text: tail(res.text, 14) };
    save(state);
    const done = os.artifactState(os.status(state.workdir, state.id), artifact)?.status === 'done';
    if (res.ok && done) { ok(`${artifact} ${C.dim(`(${res.seconds}s, $${res.cost.toFixed(2)})`)}`); return; }
    warn(`${artifact}: ${res.timedOut ? 'timed out' : res.ok ? 'file not written' : 'agent reported an error'} — log: ${path.relative(HUB_ROOT, res.logFile)}`);
  }
  throw new AgenticError(`The ${roleTitle(role)} could not produce "${artifact}". Fix the cause, then run: ${cli(`resume ${state.id}`)}`);
}

async function runArtifacts(state, stage, ids) {
  const revision = revisionFor(state, stage);
  if (revision) {
    for (const a of ids) await runArtifact(state, a, revision);
    return;
  }
  for (;;) {
    const st = os.status(state.workdir, state.id);
    const pending = ids.filter(a => os.artifactState(st, a)?.status !== 'done');
    if (!pending.length) return;
    const ready = pending.filter(a => os.artifactState(st, a)?.status === 'ready');
    if (!ready.length) {
      const why = pending.map(a => `${a} waits for ${(os.artifactState(st, a)?.missingDeps || []).join(', ')}`).join('; ');
      throw new AgenticError(`Stage "${stage.id}" is blocked: ${why}`);
    }
    if (config.parallelArtifacts && ready.length > 1) {
      step(`running ${ready.join(' + ')} in parallel`);
      const results = await Promise.allSettled(ready.map(a => runArtifact(state, a, null)));
      const err = results.find(r => r.status === 'rejected');
      if (err) throw err.reason;
    } else {
      await runArtifact(state, ready[0], null);
    }
  }
}

// ───────────────────────────── build, check, review ─────────────────────────

async function runImplementer(state, { revision, failures, label }) {
  const applyFile = path.join('.agentic', 'tmp', 'apply.instructions.json');
  writeJson(path.join(state.workdir, applyFile), os.applyInfo(state.workdir, state.id));
  step(`Implementer ${failures ? 'fixing failures' : revision ? 'applying revision' : 'building'}`);
  const res = await runAgent({ config, role: 'implementer', prompt: applyPrompt({ state, applyFile, testCommand: config.testCommand, revision, failures }), cwd: state.workdir, logDir: logDir(state.id), label });
  state.costUsd += res.cost;
  state.notes.implementer = { role: 'implementer', text: tail(res.text, 14) };
  save(state);
  if (!res.ok) warn(`implementer reported an error — log: ${path.relative(HUB_ROOT, res.logFile)}`);
  return res;
}

async function buildUntilTasksDone(state, revision) {
  for (let pass = 1; pass <= (config.maxApplyPasses || 3); pass++) {
    const t = checks.tasksComplete(state.workdir, state.id);
    if (t.ok && !(revision && pass === 1)) { ok(`tasks: ${t.detail.split('\n')[0]}`); return; }
    await runImplementer(state, { revision: pass === 1 ? revision : null, label: `apply-${pass}` });
    git.commitAll(state.workdir, `wip(${state.id}): implementation pass ${pass}`);
    revision = null;
  }
  const t = checks.tasksComplete(state.workdir, state.id);
  if (!t.ok) warn(`tasks still open after ${config.maxApplyPasses} passes: ${t.detail.split('\n')[0]}`);
}

async function checkAndFix(state) {
  let fixed = false;
  for (let attempt = 0; ; attempt++) {
    step('running checks');
    const results = checks.runAll(state.workdir, state.id, config);
    state.checks = results.map(r => ({ name: r.name, ok: r.ok, skipped: !!r.skipped, detail: tail(r.detail, 25) }));
    save(state);
    for (const r of results) (r.ok ? ok : fail)(`${r.name}${r.skipped ? C.dim(' (skipped)') : ''}`);
    if (results.every(r => r.ok)) return { passed: true, fixed };
    if (attempt >= (config.maxFixAttempts ?? 2)) { warn('checks still failing; the gate will show the failures'); return { passed: false, fixed }; }
    await runImplementer(state, { failures: checks.formatFailures(results), label: `fix-${attempt + 1}` });
    git.commitAll(state.workdir, `fix(${state.id}): address failing checks`);
    fixed = true;
  }
}

async function runReview(state) {
  const reviewRel = `openspec/changes/${state.id}/review.md`;
  step('Code Reviewer reviewing the diff');
  const res = await runAgent({ config, role: 'code-reviewer', prompt: reviewPrompt({ state, base: state.base, reviewFile: reviewRel }), cwd: state.workdir, logDir: logDir(state.id), label: 'review' });
  state.costUsd += res.cost;
  state.notes.review = { role: 'code-reviewer', text: tail(res.text, 10) };
  const blocking = checks.reviewBlocking(path.join(state.workdir, reviewRel));
  state.reviewBlocking = blocking || ['review.md was not written'];
  save(state);
  (state.reviewBlocking.length ? warn : ok)(`review: ${state.reviewBlocking.length} blocking finding(s)`);
  return state.reviewBlocking;
}

// ─────────────────────────────────── stages ───────────────────────────────

async function runStageWork(state, stage) {
  const steps = (state.steps[stage.id] ||= {});
  say(`\n${C.b(`── ${stage.title}`)} ${C.dim(`(${stage.id})`)}`);

  await runArtifacts(state, stage, stage.artifacts);
  git.commitAll(state.workdir, `docs(${state.id}): ${stage.id} artifacts`);

  if (stage.id === 'intent' && state.riskSource !== 'cli' && state.riskSource !== 'human') {
    const tier = checks.riskTier(state.workdir, state.id);
    state.risk = tier || 'medium';
    state.riskSource = tier ? 'proposal' : 'default';
    if (!tier) warn('proposal.md has no "Risk tier:" line; treating the change as medium risk');
    save(state);
  }

  const revision = revisionFor(state, stage);
  if (stage.apply && (!steps.apply || revision)) {
    await buildUntilTasksDone(state, revision);
    steps.apply = true; save(state);
  }
  if (stage.checks) {
    const r = await checkAndFix(state);
    if (r.fixed) { steps.fixedSinceAfter = true; save(state); }
  }
  if (stage.after?.length && (!steps.after || revision || steps.fixedSinceAfter)) {
    const rev = revision || (steps.after ? { gate: 'checks', by: 'pipeline', feedback: 'The implementation changed after your last verification. Re-run the checks and rewrite the evidence.', stage: stage.id, pendingStages: [stage.id] } : null);
    for (const a of stage.after) await runArtifact(state, a, rev);
    steps.after = true; steps.fixedSinceAfter = false; save(state);
  }
  if (stage.review && (!steps.review || revision)) {
    let blocking = await runReview(state);
    if (blocking.length && config.autoFixReviewBlocking && !steps.reviewFixed) {
      steps.reviewFixed = true; save(state);
      await runImplementer(state, { failures: `Code review blocking findings:\n${blocking.join('\n')}`, label: 'review-fix' });
      git.commitAll(state.workdir, `fix(${state.id}): address review findings`);
      await checkAndFix(state);
      for (const a of stage.after || []) await runArtifact(state, a, { gate: 'review', by: 'pipeline', feedback: 'Code changed to address review findings. Re-run the checks and rewrite the evidence.', stage: stage.id, pendingStages: [stage.id] });
      blocking = await runReview(state);
    }
    steps.review = true; save(state);
  }
  if (state.revision) {
    state.revision.pendingStages = state.revision.pendingStages.filter(s => s !== stage.id);
    if (!state.revision.pendingStages.length) state.revision = null;
  }
  git.commitAll(state.workdir, `chore(${state.id}): ${stage.id} ready for ${config.gates[stage.gate].label}`);
  save(state);
}

// ─────────────────────────────────── gates ────────────────────────────────

function recordApproval(state, stage, decision, by, note = '') {
  const file = path.join(os.changeDir(state.workdir, state.id), 'approvals.md');
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, `# Approvals\n\nGate decisions for change \`${state.id}\`, written by the agentic runner.\n\n| When | Gate | Decision | By | Risk | Note |\n| --- | --- | --- | --- | --- | --- |\n`);
  }
  const clean = s => String(s || '').replace(/\|/g, '\\|').replace(/\n+/g, ' ').slice(0, 400);
  const g = config.gates[stage.gate];
  fs.appendFileSync(file, `| ${nowStamp()} | ${stage.gate} ${g.label} | ${decision} | ${clean(by)} | ${state.risk} | ${clean(note)} |\n`);
}

function gateSummary(state, stage) {
  const g = config.gates[stage.gate];
  const st = os.status(state.workdir, state.id);
  const relevant = [...stage.artifacts, ...(stage.after || [])];
  say(`\n${C.b(`━━ ${g.label}`)} — ${REPO.name}/${state.id}  ${C.dim(`risk: ${state.risk} (${state.riskSource})  cost so far: $${state.costUsd.toFixed(2)}`)}`);
  say(C.b('Artifacts'));
  const files = [];
  for (const a of relevant) {
    for (const p of os.existingOutputs(st, a)) {
      const abs = path.isAbsolute(p) ? p : path.join(os.changeDir(state.workdir, state.id), p);
      files.push(abs);
      say(`  ${path.relative(state.workdir, abs)}  ${C.dim(`${countLines(abs)} lines`)}`);
    }
  }
  if (stage.review) {
    const rv = path.join(os.changeDir(state.workdir, state.id), 'review.md');
    if (fs.existsSync(rv)) { files.push(rv); say(`  ${path.relative(state.workdir, rv)}`); }
  }
  if (stage.apply) {
    const stat = git.diffStat(state.workdir, state.base);
    if (stat) say(C.b('Code changes\n') + stat.split('\n').map(l => '  ' + l).join('\n'));
  }
  const notes = Object.entries(state.notes).filter(([k]) => relevant.includes(k) || (stage.apply && ['implementer', 'review'].includes(k)));
  if (notes.length) {
    say(C.b('Agent notes'));
    for (const [k, n] of notes) say(`  ${C.c(`[${roleTitle(n.role)} · ${k}]`)}\n${n.text.split('\n').map(l => '    ' + l).join('\n')}`);
  }
  if (stage.checks && state.checks?.length) {
    say(C.b('Checks'));
    for (const c of state.checks) say(`  ${c.ok ? C.g('✓') : C.r('✗')} ${c.name}${c.ok ? '' : '\n' + c.detail.split('\n').map(l => '      ' + l).join('\n')}`);
  }
  if (stage.review && state.reviewBlocking?.length) {
    say(C.b(C.r('Blocking review findings')));
    for (const b of state.reviewBlocking) say(`  ${b}`);
  }
  return files;
}

function gateBlockers(state, stage) {
  const out = [];
  if (stage.checks) for (const c of state.checks || []) if (!c.ok) out.push(`check failed: ${c.name}`);
  if (stage.review) for (const b of state.reviewBlocking || []) out.push(`review: ${b}`);
  return out;
}

function canApprove(stage) {
  const allowed = config.gates[stage.gate].approvers || [];
  if (!allowed.length) return true;
  const { email } = git.user(ROOT);
  return allowed.map(s => s.toLowerCase()).includes(email.toLowerCase());
}

function startRevision(state, stage, feedback, targetStageId) {
  const stages = config.stages;
  const target = stages.findIndex(s => s.id === (targetStageId || stage.id));
  if (target < 0 || target > state.stageIndex) throw new AgenticError(`Cannot revise stage "${targetStageId}"; choose the current or an earlier stage.`);
  const by = git.user(ROOT);
  state.revision = { gate: stage.gate, gateLabel: config.gates[stage.gate].label, by: by.name, feedback, stage: stages[target].id, pendingStages: stages.slice(target, state.stageIndex + 1).map(s => s.id) };
  for (const s of stages.slice(target)) {
    state.gates[s.gate] = { status: 'pending' };
    if (state.steps[s.id]) state.steps[s.id] = {};
  }
  recordApproval(state, stage, `revise → ${stages[target].id}`, by.email ? `${by.name} <${by.email}>` : by.name, feedback);
  state.stageIndex = target;
  state.status = 'running';
  state.awaiting = null;
  save(state);
}

/** Returns 'approved' | 'revise' | 'paused' | 'aborted'. */
async function gate(state, stage) {
  const g = config.gates[stage.gate];
  const policy = g.policy[state.risk] || 'human';
  const blockers = gateBlockers(state, stage);

  if (policy === 'auto' && !blockers.length) {
    recordApproval(state, stage, 'auto-approved', 'agentic runner', `policy: ${state.risk} risk`);
    state.gates[stage.gate] = { status: 'auto', at: new Date().toISOString() };
    save(state);
    ok(`${g.label}: auto-approved (${state.risk} risk)`);
    return 'approved';
  }

  state.status = 'awaiting';
  state.awaiting = stage.gate;
  save(state);
  const files = gateSummary(state, stage);
  notify(`${state.id}: waiting at ${g.label}`);

  if (!interactive()) {
    say(`\n${C.y(`Waiting for ${g.label}.`)} Review the files above, then run one of:`);
    say(`  ${cli(`approve ${state.id}`)} [--note "..."]`);
    say(`  ${cli(`revise ${state.id}`)} "what to change" [--stage ${config.stages.slice(0, state.stageIndex + 1).map(s => s.id).join('|')}]`);
    return 'paused';
  }

  const pause = () => { say(`\nPaused at ${g.label}. Resume with: ${cli(`resume ${state.id}`)}`); return 'paused'; };
  for (;;) {
    const opts = ['[a]pprove', '[r]evise', '[v]iew files', ...(stage.gate === 'G1' ? ['[t] set risk tier'] : []), '[p]ause', '[x] abort'];
    if (blockers.length) say(C.y(`\nApproval is blocked: ${blockers.length} issue(s) above. Revise, or type "override" to approve anyway.`));
    const answer = await ask(`\n${opts.join('  ')} › `);
    if (answer === null) return pause();
    const choice = answer.toLowerCase();

    if ((choice === 'a' && !blockers.length) || choice === 'override') {
      if (!canApprove(stage)) { fail(`${git.user(ROOT).email || 'You'} is not an approver for ${g.label} (see gates in config.base.json or the repo's overrides.json).`); continue; }
      const note = await ask('Note for the record (optional) › ');
      if (note === null) return pause();
      const u = git.user(ROOT);
      recordApproval(state, stage, choice === 'override' ? 'approved (override)' : 'approved', u.email ? `${u.name} <${u.email}>` : u.name, note);
      state.gates[stage.gate] = { status: 'approved', by: u.name, at: new Date().toISOString(), note };
      if (note) (state.decisions ||= []).push({ gate: stage.gate, gateLabel: config.gates[stage.gate].label, note });
      state.status = 'running'; state.awaiting = null; save(state);
      return 'approved';
    }
    if (choice === 'a') { warn('Resolve the blockers or type "override".'); continue; }
    if (choice === 'r') {
      const feedback = await askMultiline('What should change?');
      if (feedback === null) return pause();
      if (!feedback) continue;
      const earlier = config.stages.slice(0, state.stageIndex + 1).map(s => s.id);
      let target = stage.id;
      if (earlier.length > 1) {
        const t = await ask(`Which stage should absorb it? [${earlier.join('/')}] (default ${stage.id}) › `);
        if (t === null) return pause();
        if (t && !earlier.includes(t)) { warn(`Unknown stage "${t}".`); continue; }
        target = t || stage.id;
      }
      startRevision(state, stage, feedback, target);
      return 'revise';
    }
    if (choice === 'v') {
      const { spawnSync } = await import('node:child_process');
      const r = spawnSync(process.env.PAGER || 'less', files, { stdio: 'inherit' });
      if (r.error || r.status !== 0) for (const f of files) say(`\n${C.b(path.relative(state.workdir, f))}\n${fs.readFileSync(f, 'utf8')}`);
      continue;
    }
    if (choice === 't' && stage.gate === 'G1') {
      const t = await ask('Risk tier [low/medium/high] › ');
      if (t === null) return pause();
      if (['low', 'medium', 'high'].includes(t.toLowerCase())) { state.risk = t.toLowerCase(); state.riskSource = 'human'; save(state); ok(`risk set to ${state.risk}`); }
      continue;
    }
    if (choice === 'p') return pause();
    if (choice === 'x') {
      const sure = await ask('Abort this change? Its branch and worktree are kept. [y/N] › ');
      if (sure === null) return pause();
      if (sure.toLowerCase() === 'y') {
        state.status = 'aborted'; state.awaiting = null; save(state);
        return 'aborted';
      }
    }
  }
}

// ──────────────────────────────── release ─────────────────────────────────

function harvestLessons(state) {
  const n = lessons.harvest(REPO, state.id, path.join(state.workdir, 'openspec', 'changes', state.id, 'retrospective.md'));
  if (n) say(`${C.y('!')} ${n} lesson${n > 1 ? 's' : ''} proposed for ${REPO.name}. Review with: ${cli('lessons list')}`);
}

function archiveAndMerge(state) {
  harvestLessons(state);
  step('archiving the change (merging delta specs into openspec/specs/)');
  os.archive(state.workdir, state.id);
  git.commitAll(state.workdir, `chore(${state.id}): archive change and update specs`);
  ok('archived');

  const m = config.merge || {};
  if (m.strategy === 'none') { say(`Branch ${state.branch} is ready to merge into ${state.base}.`); return; }
  const res = git.merge(ROOT, { base: state.base, branch: state.branch, strategy: m.strategy, message: `Merge ${state.branch}: ${state.id}` });
  if (!res.merged) {
    warn(`Not merged automatically: ${res.reason}`);
    say(`Merge it yourself in ${ROOT} with: git checkout ${state.base} && git merge --no-ff ${state.branch}`);
    return;
  }
  ok(`merged ${state.branch} into ${state.base}`);
  state.merged = true;
  if (m.push) { const err = git.push(ROOT, state.base); err ? warn(`push failed: ${err}`) : ok(`pushed ${state.base}`); }
  if (config.useWorktrees && m.removeWorktree) git.removeWorktree(ROOT, state.workdir);
  if (m.deleteBranch) git.deleteBranch(ROOT, state.branch);
}

// ─────────────────────────────────── driver ───────────────────────────────

async function drive(state) {
  lock(state.id);
  provision(state.workdir);
  state.status = 'running';
  state.error = null;
  save(state);
  try {
    return await driveStages(state);
  } catch (e) {
    state.status = 'failed';
    state.error = e.message;
    save(state);
    throw e;
  }
}

async function driveStages(state) {
  const stages = config.stages;
  while (state.stageIndex < stages.length) {
    const stage = stages[state.stageIndex];
    const gs = state.gates[stage.gate]?.status;
    if (gs === 'approved' || gs === 'auto') {
      if (stage.archive && !state.archived) { archiveAndMerge(state); state.archived = true; save(state); }
      state.stageIndex++; save(state); continue;
    }
    await runStageWork(state, stage);
    const d = await gate(state, stage);
    if (d === 'paused' || d === 'aborted') return d;
    if (d === 'revise') continue;
    git.commitAll(state.workdir, `chore(${state.id}): ${config.gates[stage.gate].label} approved`);
  }
  state.status = 'done';
  state.awaiting = null;
  save(state);
  say(`\n${C.g(C.b(`Done: ${state.id}`))} ${C.dim(`total agent cost $${state.costUsd.toFixed(2)}`)}`);
  return 'done';
}

// ───────────────────────────────── commands ───────────────────────────────

async function cmdStart(args) {
  let idea = args.join(' ').trim();
  if (FLAGS.file) idea = fs.readFileSync(path.resolve(FLAGS.file), 'utf8').trim();
  if (!idea) throw new AgenticError('Describe the change: start "Add a refund window to payouts" (or --file brief.md)');
  const id = FLAGS.id || slugify(FLAGS.file ? idea.split('\n')[0] : idea);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) throw new AgenticError(`Change id "${id}" must be lowercase kebab-case.`);
  if (fs.existsSync(statePath(id))) throw new AgenticError(`Change "${id}" already exists. Use --id to pick another name, or resume ${id}.`);

  preflight();
  if (!git.isClean(ROOT)) warn('Your working tree has uncommitted changes; they are not included in the change branch.');
  const base = config.baseBranch || git.currentBranch(ROOT);
  const branch = `change/${id}`;
  if (git.branchExists(ROOT, branch)) throw new AgenticError(`Branch ${branch} already exists.`);

  let workdir = ROOT;
  if (config.useWorktrees) {
    workdir = path.join(HUB_ROOT, config.worktreeDir || 'worktrees', REPO.name, id);
    git.addWorktree(ROOT, workdir, branch, base);
    ok(`worktree ${path.relative(HUB_ROOT, workdir)} on ${branch}`);
    if (config.setupCommand) {
      step(`setup: ${config.setupCommand}`);
      const r = shell(config.setupCommand, { cwd: workdir });
      if (r.code !== 0) throw new AgenticError(`setupCommand failed:\n${tail(r.stdout + r.stderr, 20)}`);
    }
  } else {
    if (!git.isClean(ROOT)) throw new AgenticError('Commit or stash your changes first (useWorktrees is false).');
    git.switchNewBranch(ROOT, branch, base);
  }
  provision(workdir);

  os.newChange(workdir, id, { description: idea.split('\n')[0], schema: config.schema });
  const state = {
    id, idea, base, branch, workdir,
    risk: FLAGS.risk || 'medium', riskSource: FLAGS.risk ? 'cli' : 'default',
    stageIndex: 0, status: 'running', awaiting: null,
    gates: {}, steps: {}, notes: {}, checks: [], reviewBlocking: [], revision: null,
    costUsd: 0, createdAt: new Date().toISOString(),
    ...(FLAGS.initiative ? { initiative: FLAGS.initiative } : {}),
  };
  save(state);
  git.commitAll(workdir, `chore(${id}): start change`);
  ok(`change ${C.b(`${REPO.name}/${id}`)} created from ${base}`);
  return drive(state);
}

async function cmdResume([id]) {
  const state = load(required(id));
  if (state.status === 'done') { ok(`${id} is already done.`); return; }
  if (state.status === 'aborted' && !FLAGS.force) throw new AgenticError(`${id} was aborted. Use --force to resume it.`);
  return drive(state);
}

async function cmdApprove([id]) {
  const state = load(required(id));
  if (!state.awaiting) throw new AgenticError(`${id} is not waiting at a gate (status: ${state.status}).`);
  const stage = config.stages[state.stageIndex];
  if (!canApprove(stage)) throw new AgenticError(`${git.user(ROOT).email || 'You'} is not an approver for ${config.gates[stage.gate].label}.`);
  const blockers = gateBlockers(state, stage);
  if (blockers.length && !FLAGS.override) throw new AgenticError(`${config.gates[stage.gate].label} has blockers:\n${blockers.map(b => '  ' + b).join('\n')}\nRevise, or approve with --override.`);
  if (FLAGS.risk && stage.gate === 'G1') { state.risk = FLAGS.risk; state.riskSource = 'human'; }
  const u = git.user(ROOT);
  recordApproval(state, stage, FLAGS.override ? 'approved (override)' : 'approved', u.email ? `${u.name} <${u.email}>` : u.name, FLAGS.note || '');
  state.gates[stage.gate] = { status: 'approved', by: u.name, at: new Date().toISOString(), note: FLAGS.note || '' };
  if (FLAGS.note) (state.decisions ||= []).push({ gate: stage.gate, gateLabel: config.gates[stage.gate].label, note: FLAGS.note });
  state.awaiting = null; state.status = 'running'; save(state);
  git.commitAll(state.workdir, `chore(${id}): ${config.gates[stage.gate].label} approved`);
  ok(`${config.gates[stage.gate].label} approved`);
  if (FLAGS['no-run']) return;
  return drive(state);
}

async function cmdRevise([id, ...rest]) {
  const state = load(required(id));
  const feedback = rest.join(' ').trim() || (FLAGS.file ? fs.readFileSync(path.resolve(FLAGS.file), 'utf8') : '');
  if (!feedback) throw new AgenticError('Say what should change: revise <id> "feedback" [--stage design]');
  if (!state.awaiting) throw new AgenticError(`${id} is not waiting at a gate (status: ${state.status}).`);
  startRevision(state, config.stages[state.stageIndex], feedback, FLAGS.stage);
  ok(`revision queued from stage ${state.revision.stage}`);
  if (FLAGS['no-run']) return;
  return drive(state);
}

function cmdStatus([id]) {
  if (id) {
    if (!REPO) throw new AgenticError(`No change "${id}" found in any repo. Run "status" to list changes.`);
    const s = load(id);
    say(`${C.b(s.id)}  ${s.status}${s.awaiting ? ` at ${s.awaiting}` : ''}  stage ${config.stages[Math.min(s.stageIndex, config.stages.length - 1)].id}  risk ${s.risk}  $${s.costUsd.toFixed(2)}`);
    say(`  branch ${s.branch}  workdir ${s.workdir}`);
    if (s.error) say(`  ${C.r('error:')} ${s.error.split('\n')[0]}  ${C.dim(`(fix it, then: resume ${s.id})`)}`);
    for (const st of config.stages) say(`  ${config.gates[st.gate].label}: ${s.gates[st.gate]?.status || 'pending'}`);
    try { const t = checks.tasksComplete(s.workdir, s.id); say(`  tasks: ${t.detail.split('\n')[0]}`); } catch { /* no tasks yet */ }
    return;
  }
  const repos = REPO ? [REPO.name] : fs.existsSync(path.join(HUB_ROOT, 'state')) ? fs.readdirSync(path.join(HUB_ROOT, 'state'), { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name) : [];
  const rows = repos.flatMap(r => {
    const dir = path.join(HUB_ROOT, 'state', r);
    return fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => ({ repo: r, ...readJson(path.join(dir, f)) })) : [];
  });
  if (!rows.length) { say(`No changes yet. Start one with: node ${SELF} start "your idea" --repo <name>`); return; }
  for (const s of rows.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))) {
    const where = s.awaiting ? C.y(`waiting at ${s.awaiting}`) : s.status === 'done' ? C.g('done') : s.status;
    say(`${(s.repo + '/' + s.id).padEnd(52)} ${where.padEnd(24)} risk ${s.risk.padEnd(7)} $${s.costUsd.toFixed(2)}`);
  }
}

function cmdLessons([sub = 'list', which]) {
  if (sub === 'list') {
    const all = lessons.loadLessons(REPO);
    if (!all.length) return say('No lessons yet. They are proposed by the retrospective at Release approval.');
    for (const l of all) say(`${String(l.id).padStart(3)}  ${l.status.padEnd(8)} ${l.kind === 'rule' ? `rule:${l.artifact}` : 'context'}  ${l.text}  ${C.dim(`(${l.change})`)}`);
  } else if (sub === 'accept' || sub === 'reject') {
    if (!which) throw new AgenticError(`Usage: lessons ${sub} <id|all>`);
    const hit = lessons.decide(REPO, which, sub === 'accept' ? 'accepted' : 'rejected');
    ok(`${hit.length} lesson${hit.length > 1 ? 's' : ''} ${sub}ed${sub === 'accept' ? '; applied to changes started or resumed from now on. Commit repos/' + REPO.name + '/lessons.json to keep the history.' : ''}`);
  } else throw new AgenticError('Usage: lessons [list|accept <id|all>|reject <id|all>]');
}

function cmdRepo([sub, name, repoPath]) {
  if (sub === 'add') {
    const { root, context } = hub.addRepo(name, repoPath, { baseBranch: FLAGS.base, testCommand: FLAGS.test, setupCommand: FLAGS.setup });
    ok(`registered ${C.b(name)} → ${root}`);
    say(`  Edit ${path.relative(HUB_ROOT, context)} with the repo's product, stack and conventions.`);
    say(`  Optional: repos/${name}/overrides.json (gates, models, extraChecks), repos/${name}/agents/*.md (role overrides).`);
  } else if (sub === 'list' || !sub) {
    const names = hub.listRepos();
    if (!names.length) { say('No repos registered. Add one with: repo add <name> <path>'); return; }
    for (const n of names) { const r = hub.loadRepo(n); say(`${n.padEnd(24)} ${r.path}${r.baseBranch ? C.dim(`  base ${r.baseBranch}`) : ''}`); }
  } else throw new AgenticError('Usage: repo add <name> <path> [--base b] [--test cmd] [--setup cmd] | repo list');
}

function cmdAbort([id]) {
  const s = load(required(id));
  s.status = 'aborted'; s.awaiting = null; save(s);
  ok(`${id} aborted. Branch ${s.branch}${config.useWorktrees ? ` and worktree ${s.workdir}` : ''} kept.`);
}

// ───────────────────────────────── initiatives ────────────────────────────────

/** Run this script as a child process (own repo binding, own state), capturing output. */
function child(args) {
  return runAsync(process.execPath, [SELF, ...args], { cwd: HUB_ROOT, env: { AGENTIC_REPO: '' } });
}

function childLine(res, label) {
  const lines = (res.stdout + res.stderr).trim().split('\n').filter(Boolean);
  say(`  ${res.code === 0 ? C.g('✓') : C.r('✗')} ${label}${res.code === 0 ? '' : '\n' + lines.slice(-4).map(l => '      ' + l).join('\n')}`);
}

function describeChild(k) {
  const s = hub.loadChange(k.repo, k.id);
  if (!s) return { ...k, state: 'missing', awaiting: null, status: 'missing' };
  return { ...k, state: s.awaiting ? `waiting at ${s.awaiting}` : s.status, awaiting: s.awaiting, status: s.status, cost: s.costUsd || 0 };
}

async function cmdInitiative([sub, ...args]) {
  if (sub === 'start') return initiativeStart(args);
  if (sub === 'status' || !sub) return initiativeStatus(args);
  if (sub === 'approve') return initiativeApprove(args);
  if (sub === 'resume') return initiativeResume(args);
  throw new AgenticError('Usage: initiative start "<idea>" --repos a,b | status [id] | approve <id> | resume <id>');
}

async function initiativeStart(args) {
  let idea = args.join(' ').trim();
  if (FLAGS.file) idea = fs.readFileSync(path.resolve(FLAGS.file), 'utf8').trim();
  if (!idea) throw new AgenticError('Describe the work: initiative start "<idea>" --repos api,web (or --file brief.md)');
  const repos = (FLAGS.repos || '').split(',').map(s => s.trim()).filter(Boolean);
  if (repos.length < 2) throw new AgenticError('--repos needs at least two registered repos, e.g. --repos api,web. For one repo use: start --repo <name>');
  if (new Set(repos).size !== repos.length) throw new AgenticError('--repos lists a repo twice.');
  for (const r of repos) hub.loadRepo(r);
  const id = FLAGS.id || slugify(FLAGS.file ? idea.split('\n')[0] : idea);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) throw new AgenticError(`Initiative id "${id}" must be lowercase kebab-case.`);
  if (fs.existsSync(path.join(hub.INIT_DIR, `${id}.json`))) throw new AgenticError(`Initiative "${id}" already exists.`);

  const children = repos.map(repo => ({ repo, id: `${id}-${repo}` }));
  hub.saveInitiative({ id, idea, children, createdAt: new Date().toISOString() });
  ok(`initiative ${C.b(id)} across ${repos.join(', ')}`);
  step('starting one change per repo (in parallel, each stops at Proposal approval)');

  const results = await Promise.all(children.map(k => {
    const brief = `${idea}\n\nThis change is the ${k.repo} part of cross-repo initiative "${id}", which spans: ${repos.join(', ')}. Deliver only what ${k.repo} must do. Assume the other repos deliver their parts. Put every interface you share with them (API shapes, events, error formats, rollout order) under a "Cross-repo contracts" heading in proposal.md and design.md, stated precisely enough that the other repos' agents can match it.`;
    const a = ['start', brief, '--repo', k.repo, '--id', k.id, '--initiative', id, '--detach'];
    if (FLAGS.risk) a.push('--risk', FLAGS.risk);
    return child(a).then(r => ({ k, r }));
  }));
  for (const { k, r } of results) childLine(r, `${k.repo}/${k.id}`);
  say(`\nReview each repo's proposal, then approve them together: ${C.b(`node ${SELF} initiative approve ${id}`)}`);
  if (results.some(x => x.r.code !== 0)) process.exitCode = 1;
}

function initiativeStatus([id]) {
  const inits = id ? [hub.loadInitiative(id)] : hub.listInitiatives();
  if (!inits.length) { say('No initiatives yet. Start one with: initiative start "<idea>" --repos a,b'); return; }
  for (const i of inits) {
    const kids = i.children.map(describeChild);
    const total = kids.reduce((n, k) => n + (k.cost || 0), 0);
    say(`${C.b(i.id)}  ${C.dim(`$${total.toFixed(2)}`)}  ${i.idea.split('\n')[0].slice(0, 70)}`);
    for (const k of kids) say(`  ${k.repo.padEnd(22)} ${(k.awaiting ? C.y(k.state) : k.state).padEnd(24)} ${C.dim(k.id)}`);
  }
}

async function initiativeApprove([id]) {
  const init = hub.loadInitiative(required(id));
  const kids = init.children.map(describeChild).filter(k => !['done', 'aborted'].includes(k.status));
  if (!kids.length) { ok(`${id} has no active changes.`); return; }
  const gates = new Set(kids.map(k => k.awaiting));
  const aligned = !gates.has(null) && gates.size === 1;
  if (!aligned && !FLAGS.partial) {
    throw new AgenticError(`Linked gates need every active change waiting at the same gate:\n${kids.map(k => `  ${k.repo}: ${k.state}`).join('\n')}\nWait for the rest, or approve only those waiting with --partial.`);
  }
  const ready = kids.filter(k => k.awaiting);
  step(`approving ${[...new Set(ready.map(k => k.awaiting))].join('/')} for ${ready.map(k => k.repo).join(', ')}`);
  const results = await Promise.all(ready.map(k => {
    const a = ['approve', k.id, '--repo', k.repo, '--detach'];
    if (FLAGS.note) a.push('--note', FLAGS.note);
    if (FLAGS.override) a.push('--override');
    return child(a).then(r => ({ k, r }));
  }));
  for (const { k, r } of results) childLine(r, `${k.repo}/${k.id}`);
  initiativeStatus([id]);
  if (results.some(x => x.r.code !== 0)) process.exitCode = 1;
}

async function initiativeResume([id]) {
  const init = hub.loadInitiative(required(id));
  const todo = init.children.map(describeChild).filter(k => !k.awaiting && !['done', 'aborted'].includes(k.status));
  if (!todo.length) { ok('Nothing to resume.'); return; }
  const results = await Promise.all(todo.map(k => child(['resume', k.id, '--repo', k.repo, '--detach']).then(r => ({ k, r }))));
  for (const { k, r } of results) childLine(r, `${k.repo}/${k.id}`);
  initiativeStatus([id]);
}

async function cmdDashboard() {
  if (!store.available()) throw new AgenticError(store.unavailableReason());
  const port = Number(FLAGS.port || 4777);
  const server = await serve(port).catch(e => { throw new AgenticError(`Cannot listen on 127.0.0.1:${port}: ${e.message}`); });
  ok(`dashboard at http://127.0.0.1:${port}  ${C.dim('(Ctrl+C to stop)')}`);
  await new Promise(resolve => { server.on('close', resolve); for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close()); });
}

function required(id) { if (!id) throw new AgenticError('Give the change id. Run "status" to list changes.'); return id; }

const HELP = `Agentic hub: delivery pipeline for many repos

  repo add <name> <path> [--base main] [--test "npm test"] [--setup "npm ci"]
  repo list
  start "<idea>" --repo <name> [--id name] [--file brief.md] [--risk low|medium|high] [--detach]
  status [id]                       all repos, or one change
  resume <id> [--detach]
  approve <id> [--note "..."] [--override] [--risk low|medium|high (Proposal approval only)] [--no-run] [--detach]
  revise <id> "<feedback>" [--stage intent|design|build|release] [--no-run]
  abort <id>
  lessons [list|accept <id|all>|reject <id|all>] --repo <name>   review what retrospectives learned

  initiative start "<idea>" --repos a,b[,c] [--id name] [--file brief.md] [--risk tier]
  initiative status [id]            children of one or all initiatives
  initiative approve <id> [--note "..."] [--partial]   approve the same gate in every repo together
  initiative resume <id>
  dashboard [--port 4777]           local web view: pipeline status of every change, review and approve at gates

--repo can be omitted when you run from inside a registered repo, or when <id> is unique across repos.
Interactive by default: the runner stops at each gate and asks you to approve, revise or pause.
--detach (or a non-interactive terminal) makes it exit at the gate; approve or revise later to continue.`;

// ─────────────────────────────────── main ─────────────────────────────────

const argv = process.argv.slice(2);
const FLAGS = {};
const POS = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) {
    const k = a.slice(2);
    const boolFlags = ['detach', 'partial', 'override', 'no-run', 'force', 'help'];
    if (boolFlags.includes(k)) FLAGS[k] = true; else FLAGS[k] = argv[++i];
  } else POS.push(a);
}
const [cmd, ...rest] = POS;

/** Pick the repo: --repo, AGENTIC_REPO, the checkout we are in, or the only repo that has this change id. */
function resolveRepo(cmd, rest) {
  const named = FLAGS.repo || process.env.AGENTIC_REPO || hub.inferRepo();
  if (named) return named;
  const id = rest[0];
  if (id && cmd !== 'start') {
    const owners = hub.listRepos().filter(r => fs.existsSync(path.join(HUB_ROOT, 'state', r, `${id}.json`)));
    if (owners.length === 1) return owners[0];
    if (owners.length > 1) throw new AgenticError(`Change "${id}" exists in ${owners.join(', ')}. Add --repo <name>.`);
  }
  return null;
}

try {
  if (FLAGS.risk && !['low', 'medium', 'high'].includes(FLAGS.risk)) throw new AgenticError('--risk must be low, medium or high');
  const commands = { start: cmdStart, resume: cmdResume, approve: cmdApprove, revise: cmdRevise, status: cmdStatus, abort: cmdAbort, repo: cmdRepo, lessons: cmdLessons, initiative: cmdInitiative, dashboard: cmdDashboard };
  if (!cmd || FLAGS.help || !commands[cmd]) say(HELP);
  else {
    if (!['repo', 'initiative', 'dashboard'].includes(cmd)) {
      const name = resolveRepo(cmd, rest);
      if (name) useRepo(name);
      else if (cmd !== 'status') throw new AgenticError(`Which repo? Add --repo <name>.${hub.listRepos().length ? ` Registered: ${hub.listRepos().join(', ')}.` : ' None registered yet: repo add <name> <path>'}`);
    }
    await commands[cmd](rest);
  }
} catch (e) {
  if (e instanceof AgenticError) { fail(e.message); process.exitCode = 1; }
  else { fail(e.stack || String(e)); process.exitCode = 2; }
} finally {
  rl?.close();
}
