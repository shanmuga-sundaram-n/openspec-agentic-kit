// Deterministic checks that run between agents. No LLM involved.
import fs from 'node:fs';
import path from 'node:path';
import * as os from './openspec.mjs';
import { shell, walk, tail } from './util.mjs';

const REQ_ID = /\b([A-Z][A-Z0-9]{1,5})-(\d{2,4})\b/;

/** Parse delta specs: requirement IDs and their scenarios (ADDED and MODIFIED only). */
export function parseDeltaSpecs(changeDir) {
  const reqs = [];
  const problems = [];
  for (const file of walk(path.join(changeDir, 'specs')).filter(f => f.endsWith('.md'))) {
    let section = '';
    let current = null;
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const h2 = line.match(/^##\s+(ADDED|MODIFIED|REMOVED|RENAMED)\s+Requirements/i);
      if (h2) { section = h2[1].toUpperCase(); current = null; continue; }
      const h3 = line.match(/^###\s+Requirement:\s*(.+)$/);
      if (h3) {
        current = null;
        if (section !== 'ADDED' && section !== 'MODIFIED') continue;
        const m = h3[1].match(REQ_ID);
        if (!m) { problems.push(`Requirement without an ID in ${path.relative(changeDir, file)}: "${h3[1].trim()}"`); continue; }
        current = { id: `${m[1]}-${m[2]}`, area: m[1], num: m[2], title: h3[1].trim(), scenarios: [], file };
        reqs.push(current);
        continue;
      }
      const h4 = line.match(/^####\s+Scenario:\s*(.+)$/);
      if (h4 && current) current.scenarios.push(h4[1].trim());
    }
  }
  return { reqs, problems };
}

/** Every requirement needs at least as many test references as it has scenarios. */
export function specTrace(cwd, id, traceCfg) {
  const changeDir = os.changeDir(cwd, id);
  const { reqs, problems } = parseDeltaSpecs(changeDir);
  const pattern = new RegExp(traceCfg.testFilePattern || '(\\.test\\.|\\.spec\\.)');
  const testFiles = (traceCfg.testPaths || ['test', 'tests', 'src'])
    .flatMap(p => walk(path.join(cwd, p)))
    .filter(f => pattern.test(path.relative(cwd, f).replace(/\\/g, '/')));
  const contents = testFiles.map(f => fs.readFileSync(f, 'utf8'));
  const planFile = path.join(changeDir, 'test-plan.md');
  const plan = fs.existsSync(planFile) ? fs.readFileSync(planFile, 'utf8').toLowerCase() : '';

  const rows = [];
  for (const r of reqs) {
    const token = new RegExp(`${r.area}[-_ ]?${r.num}`, 'i');
    let refs = 0;
    for (const c of contents) for (const line of c.split('\n')) if (token.test(line)) refs++;
    const unplanned = traceCfg.requireTestPlanMention ? r.scenarios.filter(s => !plan.includes(s.toLowerCase())) : [];
    const need = Math.max(1, r.scenarios.length);
    rows.push({ id: r.id, scenarios: r.scenarios.length, refs, ok: refs >= need && unplanned.length === 0, unplanned });
  }
  const bad = rows.filter(r => !r.ok);
  if (!reqs.length && !problems.length) problems.push('No ADDED or MODIFIED requirements with IDs found in specs/.');
  const lines = [
    ...problems.map(p => `- ${p}`),
    ...bad.map(r => `- ${r.id}: ${r.refs} test reference(s) for ${r.scenarios} scenario(s)` + (r.unplanned.length ? `; not in test-plan.md: ${r.unplanned.map(s => `"${s}"`).join(', ')}` : '')),
  ];
  return {
    ok: problems.length === 0 && bad.length === 0,
    detail: lines.length ? lines.join('\n') : `${rows.length} requirement(s), every scenario traced to tests (${testFiles.length} test files scanned)`,
    rows,
  };
}

export function tasksComplete(cwd, id) {
  const info = os.applyInfo(cwd, id);
  const p = info.progress || { total: 0, complete: 0, remaining: 0 };
  const open = (info.tasks || []).filter(t => !(t.done ?? t.complete ?? t.completed)).map(t => t.description || t.text || t.id).slice(0, 10);
  return {
    ok: p.total > 0 && p.remaining === 0,
    detail: p.total === 0 ? 'tasks.md has no tracked tasks' : `${p.complete}/${p.total} tasks done` + (open.length && p.remaining ? `\n${open.map(t => `- [ ] ${t}`).join('\n')}` : ''),
    progress: p,
  };
}

export function runCommandCheck(name, command, cwd) {
  if (!command) return { name, ok: true, detail: 'not configured (skipped)', skipped: true };
  const r = shell(command, { cwd, env: { CI: '1' } });
  return { name, ok: r.code === 0, detail: r.code === 0 ? `\`${command}\` passed` : `\`${command}\` exited ${r.code}\n${tail(r.stdout + '\n' + r.stderr, 40)}` };
}

export function runAll(cwd, id, config) {
  const results = [];
  results.push({ name: 'openspec validate --strict', ...os.validate(cwd, id) });
  results.push({ name: 'tasks complete', ...tasksComplete(cwd, id) });
  results.push(runCommandCheck('tests', config.testCommand, cwd));
  results.push({ name: 'spec-to-test trace', ...specTrace(cwd, id, config.trace || {}) });
  for (const c of config.extraChecks || []) results.push(runCommandCheck(c.name, c.command, cwd));
  return results;
}

export function formatFailures(results) {
  return results.filter(r => !r.ok).map(r => `## ${r.name}\n${r.detail}`).join('\n\n');
}

export function riskTier(cwd, id) {
  const f = path.join(os.changeDir(cwd, id), 'proposal.md');
  if (!fs.existsSync(f)) return null;
  const m = fs.readFileSync(f, 'utf8').match(/Risk tier:\s*\**\s*(low|medium|high)\b/i);
  return m ? m[1].toLowerCase() : null;
}

export function reviewBlocking(file) {
  if (!fs.existsSync(file)) return null;
  const text = fs.readFileSync(file, 'utf8');
  const m = text.match(/##\s*Blocking[^\n]*\n([\s\S]*?)(\n##\s|$)/i);
  if (!m) return [];
  return m[1].split('\n').map(l => l.trim()).filter(l => /^[-*]\s+/.test(l) && !/^[-*]\s+none\b/i.test(l));
}
