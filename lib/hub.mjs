// Hub layer: the repo registry, layered config, and per-worktree provisioning.
// Shared assets (agents, schema, rules) live in the hub; target repos stay free of runner files.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as git from './git.mjs';
import * as store from './store.mjs';
import { applyAccepted } from './lessons.mjs';
import { readJson, writeJson, AgenticError } from './util.mjs';

export const HUB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPOS_DIR = path.join(HUB_ROOT, 'repos');
const repoFile = name => path.join(REPOS_DIR, name, 'repo.json');

export function listRepos() {
  if (!fs.existsSync(REPOS_DIR)) return [];
  return fs.readdirSync(REPOS_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory() && fs.existsSync(repoFile(e.name)))
    .map(e => e.name).sort();
}

export function loadRepo(name) {
  if (!fs.existsSync(repoFile(name))) {
    const known = listRepos();
    throw new AgenticError(`Unknown repo "${name}".${known.length ? ` Registered: ${known.join(', ')}.` : ''} Register one with: repo add <name> <path>`);
  }
  const r = readJson(repoFile(name));
  if (!r.path || !fs.existsSync(r.path)) throw new AgenticError(`Repo "${name}" points at ${r.path || '(no path)'}, which does not exist. Edit ${path.relative(HUB_ROOT, repoFile(name))}.`);
  return { name, dir: path.join(REPOS_DIR, name), ...r, path: git.repoRoot(r.path) };
}

export function addRepo(name, repoPath, extra = {}) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) throw new AgenticError(`Repo name "${name}" must be lowercase kebab-case.`);
  if (fs.existsSync(repoFile(name))) throw new AgenticError(`Repo "${name}" is already registered.`);
  if (!repoPath) throw new AgenticError('Usage: repo add <name> <path> [--base main] [--test "npm test"] [--setup "npm ci"]');
  const root = git.repoRoot(path.resolve(repoPath));
  const conf = { path: root, ...Object.fromEntries(Object.entries(extra).filter(([, v]) => v)) };
  writeJson(repoFile(name), conf);
  const ctx = path.join(REPOS_DIR, name, 'context.md');
  fs.writeFileSync(ctx, `Product: <one line on what this repo does and for whom>\nStack: <languages, frameworks, datastores>\nArchitecture notes: <a few key facts or a link>\nConventions: <API style, error format, time zones, idempotency, logging>\nTesting: <framework, where tests live, how to run them>\nDefinition of done: every scenario has a passing named test, openspec validate --strict is clean\n`);
  return { root, conf, context: ctx };
}

/** The registered repo whose checkout contains cwd, or null. */
export function inferRepo(cwd = process.cwd()) {
  const here = fs.realpathSync(cwd);
  for (const name of listRepos()) {
    const p = readJson(repoFile(name), {}).path;
    if (!p || !fs.existsSync(p)) continue;
    const root = fs.realpathSync(p);
    if (here === root || here.startsWith(root + path.sep)) return name;
  }
  return null;
}

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
/** Deep merge; objects merge key by key, arrays and scalars are replaced. */
export function mergeConfig(...layers) {
  const out = {};
  for (const layer of layers) {
    for (const [k, v] of Object.entries(layer || {})) {
      out[k] = isObj(v) && isObj(out[k]) ? mergeConfig(out[k], v) : v;
    }
  }
  return out;
}

/** config.base.json, then repos/<name>/repo.json, then repos/<name>/overrides.json. */
export function loadConfig(repo) {
  const base = readJson(path.join(HUB_ROOT, 'config.base.json'));
  const { path: _p, ...repoConf } = readJson(repoFile(repo.name));
  const overrides = readJson(path.join(repo.dir, 'overrides.json'), {});
  return mergeConfig(base, repoConf, overrides);
}

function copyFiles(from, to, written, workdir) {
  if (!fs.existsSync(from)) return;
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, e.name);
    const dst = path.join(to, e.name);
    const rel = path.relative(workdir, dst);
    if (e.isDirectory()) { copyFiles(src, dst, written, workdir); continue; }
    if (git.isTracked(workdir, rel)) continue; // the repo's own copy wins
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
    written.push(rel);
  }
}

/** Replace the `context: |` block of the base openspec config with the repo's context.md. */
function renderOpenspecConfig(repo) {
  const base = fs.readFileSync(path.join(HUB_ROOT, 'openspec.base.yaml'), 'utf8');
  const ctxFile = path.join(repo.dir, 'context.md');
  if (!fs.existsSync(ctxFile)) return applyAccepted(base, repo);
  const body = fs.readFileSync(ctxFile, 'utf8').trimEnd().split('\n').map(l => (l ? '  ' + l : '')).join('\n');
  const lines = base.split('\n');
  const start = lines.findIndex(l => /^context:\s*\|/.test(l));
  if (start < 0) return applyAccepted(base, repo);
  let end = start + 1;
  while (end < lines.length && (lines[end] === '' || /^\s/.test(lines[end]))) end++;
  return applyAccepted([...lines.slice(0, start), 'context: |', body, '', ...lines.slice(end)].join('\n'), repo);
}

/**
 * Put the hub's agents, schema and rendered openspec config into a checkout and hide them from git.
 * Safe to run again on resume. Files the repo already tracks are never overwritten.
 */
export function provision(config, repo, workdir) {
  const written = [];
  const agentsOut = path.join(workdir, '.claude', 'agents');
  copyFiles(path.join(HUB_ROOT, 'agents'), agentsOut, written, workdir);
  copyFiles(path.join(repo.dir, 'agents'), agentsOut, written, workdir); // per-repo role overrides
  copyFiles(path.join(HUB_ROOT, 'schemas', config.schema), path.join(workdir, 'openspec', 'schemas', config.schema), written, workdir);

  let warning = null;
  const cfgRel = path.join('openspec', 'config.yaml');
  if (git.isTracked(workdir, cfgRel)) {
    if (fs.existsSync(path.join(repo.dir, 'context.md'))) warning = `${cfgRel} is tracked in ${repo.name}; the hub's context.md is not applied.`;
  } else {
    fs.mkdirSync(path.join(workdir, 'openspec'), { recursive: true });
    fs.writeFileSync(path.join(workdir, cfgRel), renderOpenspecConfig(repo));
    written.push(cfgRel);
  }
  for (const d of ['specs', 'changes']) fs.mkdirSync(path.join(workdir, 'openspec', d), { recursive: true });

  git.excludeLocally(workdir, ['/.agentic/', ...written.map(w => '/' + w.split(path.sep).join('/'))]);
  return { written, warning };
}

/** Roles the pipeline needs, checked against the hub and the repo's own overrides. */
export function missingAssets(config, repo) {
  const roles = new Set([...Object.values(config.artifactRoles), 'implementer', 'code-reviewer']);
  const missing = [];
  for (const r of roles) {
    const f = `${r}.md`;
    if (!fs.existsSync(path.join(HUB_ROOT, 'agents', f)) && !fs.existsSync(path.join(repo.dir, 'agents', f))) missing.push(`agents/${f}`);
  }
  if (!fs.existsSync(path.join(HUB_ROOT, 'schemas', config.schema, 'schema.yaml'))) missing.push(`schemas/${config.schema}/schema.yaml`);
  return missing;
}

// ───────────────────────── changes and initiatives (read across repos) ─────────────────────────

export const STATE_ROOT = path.join(HUB_ROOT, 'state');
export const INIT_DIR = path.join(HUB_ROOT, 'initiatives');

export function loadChange(repo, id) {
  return readJson(path.join(STATE_ROOT, repo, `${id}.json`), null);
}

export function allChanges(onlyRepo = null) {
  if (!fs.existsSync(STATE_ROOT)) return [];
  const repos = onlyRepo ? [onlyRepo] : fs.readdirSync(STATE_ROOT, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name);
  return repos.flatMap(repo => {
    const dir = path.join(STATE_ROOT, repo);
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return [];
    return fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => ({ repo, ...readJson(path.join(dir, f)) }));
  });
}

export function listInitiatives() {
  if (!fs.existsSync(INIT_DIR)) return [];
  return fs.readdirSync(INIT_DIR).filter(f => f.endsWith('.json')).map(f => readJson(path.join(INIT_DIR, f)));
}

export function loadInitiative(id) {
  const i = readJson(path.join(INIT_DIR, `${id}.json`), null);
  if (!i) throw new AgenticError(`No initiative "${id}". List them with: initiative status`);
  return i;
}

export function saveInitiative(i) {
  i.updatedAt = new Date().toISOString();
  writeJson(path.join(INIT_DIR, `${i.id}.json`), i);
  store.syncInitiative(i);
}
