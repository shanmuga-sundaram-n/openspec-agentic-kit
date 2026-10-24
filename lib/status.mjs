// Turns a change's state file and worktree into what the UI shows: pipeline stages, work items, documents.
// Pure reads. The store calls this whenever a change is saved, so the dashboard never walks worktrees itself.
import fs from 'node:fs';
import path from 'node:path';
import * as git from './git.mjs';
import { run, walk } from './util.mjs';

const MAX_FILE = 200_000;
const clip = text => (text.length > MAX_FILE ? text.slice(0, MAX_FILE) + '\n\n… truncated' : text);

/** The change folder in its worktree, or its archived copy in the repo once the worktree is gone. */
export function changeDir(s, root) {
  const live = path.join(s.workdir || '', 'openspec', 'changes', s.id);
  if (s.workdir && fs.existsSync(live)) return live;
  const archive = root && path.join(root, 'openspec', 'changes', 'archive');
  if (archive && fs.existsSync(archive)) {
    const hit = fs.readdirSync(archive).find(d => d.endsWith(`-${s.id}`) || d === s.id);
    if (hit) return path.join(archive, hit);
  }
  return null;
}

function taskCounts(dir) {
  try {
    const lines = fs.readFileSync(path.join(dir, 'tasks.md'), 'utf8').split('\n');
    const done = lines.filter(l => /^\s*- \[[xX]\]/.test(l)).length;
    return { done, total: done + lines.filter(l => /^\s*- \[ \]/.test(l)).length };
  } catch { return null; }
}

function hasArtifact(dir, a) {
  if (!dir) return false;
  if (a === 'specs') return walk(path.join(dir, 'specs')).some(f => f.endsWith('.md'));
  return fs.existsSync(path.join(dir, `${a}.md`));
}

/** Stages with their gate and the pieces of work inside each. "working" is added at read time from the lock file. */
function pipeline(s, config, dir) {
  const tasks = dir && taskCounts(dir);
  const blockers = [];
  const stages = config.stages.map((stage, i) => {
    const g = s.gates?.[stage.gate]?.status || 'pending';
    let state = 'pending';
    if (g === 'approved' || g === 'auto' || s.status === 'done') state = 'done';
    else if (i === s.stageIndex) state = s.awaiting === stage.gate ? 'waiting' : s.status === 'failed' ? 'failed' : s.status === 'aborted' ? 'aborted' : 'active';

    const items = stage.artifacts.map(a => ({ id: a, role: config.artifactRoles[a], status: hasArtifact(dir, a) ? 'done' : 'pending' }));
    if (stage.apply) {
      items.push({ id: 'build', role: 'implementer', detail: tasks ? `${tasks.done}/${tasks.total} tasks` : '', status: tasks && tasks.total && tasks.done === tasks.total ? 'done' : 'pending' });
    }
    if (stage.checks) {
      const c = s.checks || [];
      const bad = c.filter(x => !x.ok);
      items.push({ id: 'checks', role: 'runner', detail: c.length ? `${c.length - bad.length}/${c.length} pass` : '', status: !c.length ? 'pending' : bad.length ? 'failed' : 'done' });
      for (const b of bad) blockers.push({ gate: stage.gate, text: `check failed: ${b.name}` });
    }
    for (const a of stage.after || []) items.push({ id: a, role: config.artifactRoles[a], status: hasArtifact(dir, a) ? 'done' : 'pending' });
    if (stage.review) {
      const n = (s.reviewBlocking || []).length;
      const written = dir && fs.existsSync(path.join(dir, 'review.md'));
      items.push({ id: 'review', role: 'code-reviewer', detail: written ? `${n} blocking` : '', status: !written ? 'pending' : n ? 'failed' : 'done' });
      for (const b of s.reviewBlocking || []) blockers.push({ gate: stage.gate, text: `review: ${b}` });
    }
    if (state === 'done') for (const it of items) if (it.status === 'pending') it.status = 'done';
    return { id: stage.id, title: stage.title, gate: stage.gate, gateLabel: config.gates[stage.gate].label, gateStatus: g, state, items, policy: config.gates[stage.gate].policy };
  });
  const current = config.stages[s.stageIndex];
  return { stages, blockers: current ? blockers.filter(b => b.gate === current.gate) : [] };
}

/** Summary, text documents and approvals text for one change. `s` must carry `repo`. */
export function derive(s, config, root) {
  const dir = changeDir(s, root);
  const { stages, blockers } = pipeline(s, config, dir);
  const stage = config.stages[Math.min(s.stageIndex, config.stages.length - 1)];

  const files = [];
  const add = (name, abs) => {
    try { files.push({ name, kind: 'md', text: clip(fs.readFileSync(abs, 'utf8')) }); } catch { /* not written yet */ }
  };
  let approvals = '';
  if (dir) {
    for (const a of [...new Set(config.stages.flatMap(st => [...st.artifacts, ...(st.after || [])]))]) {
      if (a === 'specs') for (const f of walk(path.join(dir, 'specs')).filter(f => f.endsWith('.md')).sort()) add(path.relative(dir, f), f);
      else add(`${a}.md`, path.join(dir, `${a}.md`));
    }
    add('review.md', path.join(dir, 'review.md'));
    try { approvals = fs.readFileSync(path.join(dir, 'approvals.md'), 'utf8'); } catch { /* none yet */ }
  }

  const summary = {
    idea: s.idea, status: s.status, awaiting: s.awaiting || null, risk: s.risk, riskSource: s.riskSource, cost: s.costUsd || 0,
    stageIndex: s.stageIndex, error: s.error || null, initiative: s.initiative || null, createdAt: s.createdAt, updatedAt: s.updatedAt,
    merged: !!s.merged, branch: s.branch, stages, blockers,
    revision: s.revision ? { gate: s.revision.gate, stage: s.revision.stage, feedback: s.revision.feedback } : null,
    stageIds: config.stages.slice(0, s.stageIndex + 1).map(x => x.id),
    approvers: stage && s.awaiting ? config.gates[stage.gate].approvers || [] : [],
    checks: s.checks || [], blocking: s.reviewBlocking || [], decisions: s.decisions || [], gates: s.gates || {},
    notes: Object.entries(s.notes || {}).map(([k, n]) => ({ key: k, role: n.role, text: n.text })),
  };
  return { summary, files, approvals };
}

/** The code diff against the base branch, excluding the OpenSpec folder. Null when there is nothing to show. */
export function codeDiff(s) {
  if (!s.workdir || !fs.existsSync(s.workdir) || !s.base) return null;
  const d = run('git', ['diff', `${s.base}...HEAD`, '--', '.', ':(exclude)openspec'], { cwd: s.workdir });
  return d.code === 0 && d.stdout.trim() ? clip(d.stdout) : null;
}

export const gitUser = root => (root ? git.user(root) : null);
