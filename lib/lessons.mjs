// Self-improvement loop: retrospectives propose lessons, a human accepts them, and accepted
// lessons are rendered into the repo's openspec rules and context for every later change.
import fs from 'node:fs';
import path from 'node:path';
import { readJson, writeJson, AgenticError } from './util.mjs';

const ARTIFACTS = ['research', 'proposal', 'specs', 'design', 'threat-model', 'test-plan', 'tasks'];
const file = repo => path.join(repo.dir, 'lessons.json');
export const loadLessons = repo => readJson(file(repo), []);

/** The ```json lessons block of a retrospective: { "rules": { "<artifact>": ["..."] }, "context": ["..."] }. */
export function parseProposals(markdown) {
  const m = markdown.match(/```json\s+lessons\s*\n([\s\S]*?)```/);
  if (!m) return [];
  let data;
  try { data = JSON.parse(m[1]); } catch { return []; }
  const out = [];
  const clean = t => (typeof t === 'string' ? t.replace(/\s+/g, ' ').trim() : '');
  for (const [artifact, texts] of Object.entries(data.rules || {})) {
    if (!ARTIFACTS.includes(artifact)) continue;
    for (const t of [].concat(texts)) if (clean(t)) out.push({ kind: 'rule', artifact, text: clean(t) });
  }
  for (const t of [].concat(data.context || [])) if (clean(t)) out.push({ kind: 'context', text: clean(t) });
  return out;
}

/** Queue the proposals from a finished change as pending lessons. Returns how many were new. */
export function harvest(repo, changeId, retroPath) {
  if (!fs.existsSync(retroPath)) return 0;
  const lessons = loadLessons(repo);
  let next = lessons.reduce((n, l) => Math.max(n, l.id), 0) + 1;
  let added = 0;
  for (const p of parseProposals(fs.readFileSync(retroPath, 'utf8'))) {
    if (lessons.some(l => l.kind === p.kind && l.artifact === p.artifact && l.text === p.text)) continue;
    lessons.push({ id: next++, ...p, change: changeId, status: 'pending', at: new Date().toISOString() });
    added++;
  }
  if (added) writeJson(file(repo), lessons);
  return added;
}

/** Set pending lessons to accepted or rejected. `which` is an id or "all". */
export function decide(repo, which, status) {
  const lessons = loadLessons(repo);
  const hit = lessons.filter(l => l.status === 'pending' && (which === 'all' || String(l.id) === String(which)));
  if (!hit.length) throw new AgenticError(`No pending lesson "${which}". List them with: lessons list`);
  for (const l of hit) { l.status = status; l.decidedAt = new Date().toISOString(); }
  writeJson(file(repo), lessons);
  return hit;
}

/** Add accepted lessons to a rendered openspec config (text edit, so the base file keeps its comments). */
export function applyAccepted(yaml, repo) {
  const accepted = loadLessons(repo).filter(l => l.status === 'accepted');
  if (!accepted.length) return yaml;
  let lines = yaml.split('\n');
  const rulesAt = () => lines.findIndex(l => /^rules:\s*$/.test(l));
  for (const l of accepted.filter(x => x.kind === 'rule')) {
    const r = rulesAt();
    if (r < 0) continue;
    let end = r + 1;
    while (end < lines.length && (lines[end] === '' || /^\s/.test(lines[end]))) end++;
    while (lines[end - 1] === '') end--;
    const key = lines.findIndex((x, i) => i > r && i < end && x === `  ${l.artifact}:`);
    const item = `    - ${JSON.stringify(l.text)}`;
    if (key < 0) { lines.splice(end, 0, `  ${l.artifact}:`, item); continue; }
    let at = key + 1;
    while (at < lines.length && /^    - |^      /.test(lines[at])) at++;
    lines.splice(at, 0, item);
  }
  const ctx = accepted.filter(x => x.kind === 'context');
  if (ctx.length) {
    const start = lines.findIndex(l => /^context:\s*\|/.test(l));
    if (start >= 0) {
      let end = start + 1;
      while (end < lines.length && (lines[end] === '' || /^\s/.test(lines[end]))) end++;
      while (lines[end - 1] === '') end--;
      lines.splice(end, 0, '  Learned from past changes:', ...ctx.map(c => `  - ${c.text}`));
    }
  }
  return lines.join('\n');
}
