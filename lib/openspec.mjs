// Thin wrapper over the OpenSpec CLI. Every call runs in the change's worktree.
import fs from 'node:fs';
import path from 'node:path';
import { run, AgenticError, tail } from './util.mjs';

const BIN = process.env.OPENSPEC_BIN || 'openspec';

function json(args, cwd) {
  const r = run(BIN, [...args, '--json'], { cwd, env: { OPENSPEC_TELEMETRY: '0' } });
  const text = r.stdout.trim();
  const start = text.indexOf('{');
  if (start < 0) throw new AgenticError(`openspec ${args.join(' ')} failed:\n${tail(r.stderr || r.stdout, 20)}`);
  try { return { code: r.code, data: JSON.parse(text.slice(start)), stderr: r.stderr }; } catch {
    throw new AgenticError(`openspec ${args.join(' ')} returned unreadable JSON:\n${tail(text, 20)}`);
  }
}

export function checkInstalled() {
  const r = run(BIN, ['--version']);
  if (r.code !== 0) throw new AgenticError('OpenSpec CLI not found. Install it with: npm install -g @fission-ai/openspec@latest');
  return r.stdout.trim();
}

export function newChange(cwd, id, { description, schema }) {
  const args = ['new', 'change', id];
  if (description) args.push('--description', description.slice(0, 500));
  if (schema) args.push('--schema', schema);
  return json(args, cwd).data;
}

export function status(cwd, id) {
  return json(['status', '--change', id], cwd).data;
}

export function instructions(cwd, id, artifact) {
  return json(['instructions', artifact, '--change', id], cwd).data;
}

export function applyInfo(cwd, id) {
  return json(['instructions', 'apply', '--change', id], cwd).data;
}

export function validate(cwd, id) {
  const r = run(BIN, ['validate', id, '--strict', '--json', '--no-interactive'], { cwd, env: { OPENSPEC_TELEMETRY: '0' } });
  let summary = tail(r.stdout || r.stderr, 30);
  try {
    const j = JSON.parse(r.stdout.slice(r.stdout.indexOf('{')));
    const items = [...(j.results?.changes || []), ...(j.items || [])];
    const issues = items.flatMap(i => [...(i.issues || []).map(x => x.message || JSON.stringify(x)), ...(i.errors || []), ...(i.warnings || [])]);
    if (issues.length) summary = issues.map(s => `- ${typeof s === 'string' ? s : JSON.stringify(s)}`).join('\n');
  } catch { /* keep raw tail */ }
  return { ok: r.code === 0, detail: r.code === 0 ? 'valid (strict)' : summary };
}

export function archive(cwd, id) {
  const r = run(BIN, ['archive', id, '--yes'], { cwd, env: { OPENSPEC_TELEMETRY: '0' } });
  if (r.code !== 0) throw new AgenticError(`openspec archive failed:\n${tail(r.stdout + r.stderr, 30)}`);
  return r.stdout;
}

export function changeDir(cwd, id) {
  return path.join(cwd, 'openspec', 'changes', id);
}

export function changeExists(cwd, id) {
  return fs.existsSync(changeDir(cwd, id));
}

export function artifactState(statusData, artifactId) {
  return statusData.artifacts.find(a => a.id === artifactId);
}

export function existingOutputs(statusData, artifactId) {
  return statusData.artifactPaths?.[artifactId]?.existingOutputPaths || [];
}
