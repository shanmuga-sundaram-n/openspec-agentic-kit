// Local dashboard: every change as a pipeline with live status, plus review and approval from the browser.
// Status is read from the SQLite store (lib/store.mjs); only process liveness is checked live.
// Serves on 127.0.0.1 only. Actions never touch state directly: they run the CLI (approve, revise, resume,
// abort), so identity, approver lists, blockers and the approvals.md audit trail behave exactly as in a terminal.
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import * as hub from './hub.mjs';
import * as status from './status.mjs';
import * as store from './store.mjs';
import { readJson, tail } from './util.mjs';

const CLI = path.join(hub.HUB_ROOT, 'bin', 'agentic.mjs');
const TOKEN = crypto.randomBytes(24).toString('hex');
const PAGE = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'dashboard.html'), 'utf8');

// ─────────────────────────────── reading state ───────────────────────────────

const repoCache = new Map();
/** Merged config and checkout root for a repo; cached briefly because loading shells out to git. */
function repoInfo(name) {
  const hit = repoCache.get(name);
  if (hit && Date.now() - hit.at < 30_000) return hit;
  let info;
  try { const repo = hub.loadRepo(name); info = { at: Date.now(), root: repo.path, config: hub.loadConfig(repo) }; } catch {
    info = { at: Date.now(), root: null, config: readJson(path.join(hub.HUB_ROOT, 'config.base.json')) };
  }
  repoCache.set(name, info);
  return info;
}

const lockFile = (repo, id) => path.join(hub.STATE_ROOT, repo, `${id}.lock`);
/** Pid of the live process running this change, or null. */
function lockPid(repo, id) {
  try {
    const pid = Number(fs.readFileSync(lockFile(repo, id), 'utf8'));
    process.kill(pid, 0);
    return pid;
  } catch { return null; }
}

/** Add what only the live machine knows (is a process on it right now?) to a stored change. */
function withLiveness(c) {
  const pid = lockPid(c.repo, c.id);
  const active = !['done', 'aborted'].includes(c.status);
  const running = !!pid && !c.awaiting && active;
  if (running) {
    c.stages = c.stages.map(st => {
      if (st.state !== 'active') return st;
      let marked = false;
      return { ...st, items: st.items.map(it => (!marked && it.status === 'pending' ? (marked = true, { ...it, status: 'working' }) : it)) };
    });
  }
  return { ...c, running, stalled: c.status === 'running' && !pid, heldByTerminal: !!pid && !!c.awaiting, pid };
}

/** Display names for gate ids, merged across every repo's config (later repos win on conflict). */
function gateNames() {
  const out = {};
  for (const r of hub.listRepos()) for (const [id, g] of Object.entries(repoInfo(r).config.gates || {})) out[id] = { name: g.name || g.label, label: g.label };
  return out;
}

const refresh = () => store.reconcile(repoInfo);

export function snapshot() {
  refresh();
  const changes = store.listChanges().map(withLiveness);
  const live = new Map(changes.map(c => [`${c.repo}/${c.id}`, c]));
  const initiatives = store.initiatives().map(i => ({
    id: i.id, idea: i.idea, children: i.children.map(k => {
      const c = live.get(`${k.repo}/${k.id}`);
      return { repo: k.repo, id: k.id, status: c?.status || 'missing', awaiting: c?.awaiting || null, stages: c?.stages || [], running: !!c?.running };
    }),
  }));
  // Lists carry no documents or notes; the drawer fetches those.
  const slim = changes.map(({ checks, notes, decisions, gates, ...c }) => c);
  return { generatedAt: new Date().toISOString(), repos: hub.listRepos(), changes: slim, spend: store.spend(), spendByRole: store.spendByRole(), activity: store.recentEvents(25), initiatives, gateNames: gateNames() };
}

/** Everything a reviewer needs at a gate: documents, code diff, checks, agent notes, audit trail and timeline. */
export function detail(repo, id) {
  refresh();
  const c = store.getChange(repo, id);
  if (!c) return null;
  const docs = store.documents(repo, id);
  return {
    ...withLiveness(c),
    files: docs.filter(d => d.kind !== 'approvals').map(d => ({ name: d.name, kind: d.kind, text: d.text })),
    approvals: docs.find(d => d.kind === 'approvals')?.text || '',
    events: store.events(repo, id),
    me: status.gitUser(repoInfo(repo).root),
  };
}

// ─────────────────────────────────── actions ───────────────────────────────────

const RISKS = ['low', 'medium', 'high'];

/** Start the CLI detached (it may run agents for a long time) and report an early failure if there is one. */
function launch(repo, id, args) {
  const logDir = path.join(hub.HUB_ROOT, 'runs', repo || '_hub', id || '_initiative');
  fs.mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, `ui-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
  const fd = fs.openSync(logFile, 'w');
  const child = spawn(process.execPath, [CLI, ...args, '--detach'], { cwd: hub.HUB_ROOT, detached: true, stdio: ['ignore', fd, fd], env: { ...process.env, AGENTIC_REPO: '', NO_COLOR: '1' } });
  fs.closeSync(fd);
  return new Promise(resolve => {
    const timer = setTimeout(() => { child.unref(); resolve({ ok: true, started: true }); }, 2500);
    child.on('exit', code => {
      clearTimeout(timer);
      const out = tail(fs.readFileSync(logFile, 'utf8').replace(/\x07/g, ''), 12);
      resolve(code === 0 ? { ok: true, started: false, output: out } : { ok: false, error: out || `exited with code ${code}` });
    });
    child.on('error', e => { clearTimeout(timer); resolve({ ok: false, error: e.message }); });
  });
}

const bad = message => ({ ok: false, error: message, status: 400 });

export async function act(body) {
  const { action, repo, id } = body;
  const str = v => (typeof v === 'string' ? v.trim().slice(0, 4000) : '');

  /** The idea goes by file so text that starts with "--" cannot be read as a flag. */
  const briefFile = text => {
    const dir = path.join(hub.HUB_ROOT, 'runs', '_ui');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `brief-${Date.now()}.md`);
    fs.writeFileSync(file, text);
    return file;
  };
  const validRisk = body.risk === undefined || body.risk === '' || RISKS.includes(body.risk);

  if (action === 'start') {
    if (!hub.listRepos().includes(repo)) return bad('Pick a registered repo.');
    if (!str(body.idea)) return bad('Describe the change.');
    if (!validRisk) return bad('Risk must be low, medium or high.');
    if (body.id && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(body.id)) return bad('The id must be lowercase kebab-case.');
    const args = ['start', '--file', briefFile(str(body.idea)), '--repo', repo];
    if (body.id) args.push('--id', body.id);
    if (body.risk) args.push('--risk', body.risk);
    return launch(repo, '_ui', args);
  }

  if (action === 'initiative-start') {
    const repos = Array.isArray(body.repos) ? body.repos : [];
    if (repos.length < 2 || new Set(repos).size !== repos.length || !repos.every(r => hub.listRepos().includes(r))) return bad('Pick at least two different registered repos.');
    if (!str(body.idea)) return bad('Describe the work.');
    if (!validRisk) return bad('Risk must be low, medium or high.');
    if (body.id && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(body.id)) return bad('The id must be lowercase kebab-case.');
    const args = ['initiative', 'start', '--file', briefFile(str(body.idea)), '--repos', repos.join(',')];
    if (body.id) args.push('--id', body.id);
    if (body.risk) args.push('--risk', body.risk);
    return launch(null, '_ui', args);
  }

  if (action === 'initiative-resume') {
    if (!/^[a-z0-9-]+$/.test(String(id)) || !hub.listInitiatives().some(i => i.id === id)) return bad('Unknown initiative.');
    return launch(null, id, ['initiative', 'resume', id]);
  }

  if (action === 'initiative-approve') {
    if (!/^[a-z0-9-]+$/.test(String(id)) || !hub.listInitiatives().some(i => i.id === id)) return bad('Unknown initiative.');
    const args = ['initiative', 'approve', id];
    if (str(body.note)) args.push('--note', str(body.note));
    if (body.partial) args.push('--partial');
    return launch(null, id, args);
  }

  if (!hub.listRepos().includes(repo) || !/^[a-z0-9-]+$/.test(String(id))) return bad('Unknown change.');
  const s = hub.loadChange(repo, id);
  if (!s) return bad('Unknown change.');
  if (lockPid(repo, id)) return bad(s.awaiting ? 'A terminal session is holding this gate. Answer it there, or stop that process first.' : 'Agents are running for this change right now.');
  const { config } = repoInfo(repo);
  const base = ['--repo', repo];

  switch (action) {
    case 'approve': {
      if (!s.awaiting) return bad('This change is not waiting at a gate.');
      const args = ['approve', id, ...base];
      if (str(body.note)) args.push('--note', str(body.note));
      if (body.override) args.push('--override');
      if (s.awaiting === 'G1' && RISKS.includes(body.risk) && body.risk !== s.risk) args.push('--risk', body.risk);
      return launch(repo, id, args);
    }
    case 'revise': {
      if (!s.awaiting) return bad('This change is not waiting at a gate.');
      const feedback = str(body.feedback);
      if (!feedback) return bad('Say what should change.');
      const stages = config.stages.slice(0, s.stageIndex + 1).map(x => x.id);
      if (body.stage && !stages.includes(body.stage)) return bad('Unknown stage.');
      const file = path.join(hub.HUB_ROOT, 'runs', repo, id, `ui-feedback-${Date.now()}.md`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, feedback); // by file, so feedback that starts with "--" cannot be read as a flag
      return launch(repo, id, ['revise', id, ...base, '--file', file, ...(body.stage ? ['--stage', body.stage] : [])]);
    }
    case 'resume': return launch(repo, id, ['resume', id, ...base, ...(body.force ? ['--force'] : [])]);
    case 'abort': return launch(repo, id, ['abort', id, ...base]);
    default: return bad('Unknown action.');
  }
}

// ─────────────────────────────────── server ───────────────────────────────────

export function serve(port) {
  const send = (res, code, body, type = 'application/json') =>
    res.writeHead(code, { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-store' }).end(typeof body === 'string' ? body : JSON.stringify(body));

  const server = http.createServer(async (req, res) => {
    try {
      // Loopback only: reject foreign Host headers (DNS rebinding) and foreign Origins (cross-site requests).
      const host = req.headers.host || '';
      const allowed = [`127.0.0.1:${port}`, `localhost:${port}`];
      if (!allowed.includes(host)) return send(res, 403, { error: 'forbidden host' });
      const url = new URL(req.url, 'http://x');

      if (req.method === 'GET' && url.pathname === '/') return send(res, 200, PAGE.replace('__TOKEN__', TOKEN), 'text/html');
      if (req.method === 'GET' && url.pathname === '/api') return send(res, 200, snapshot());
      if (req.method === 'GET' && url.pathname === '/api/change') {
        const d = detail(url.searchParams.get('repo'), url.searchParams.get('id'));
        return d ? send(res, 200, d) : send(res, 404, { error: 'not found' });
      }
      if (req.method === 'POST' && url.pathname === '/api/act') {
        if (req.headers['x-agentic-token'] !== TOKEN) return send(res, 403, { ok: false, error: 'Bad token. Reload the page.' });
        if (req.headers.origin && !allowed.some(h => req.headers.origin === `http://${h}`)) return send(res, 403, { ok: false, error: 'forbidden origin' });
        let raw = '';
        for await (const chunk of req) { raw += chunk; if (raw.length > 100_000) return send(res, 413, { ok: false, error: 'too large' }); }
        let body;
        try { body = JSON.parse(raw); } catch { return send(res, 400, { ok: false, error: 'bad json' }); }
        const r = await act(body);
        return send(res, r.status || 200, r);
      }
      send(res, req.method === 'GET' ? 404 : 405, { error: 'not found' });
    } catch (e) {
      send(res, 500, { ok: false, error: e.message });
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}
