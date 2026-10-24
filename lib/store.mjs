// SQLite store behind the dashboard: change status, documents, an event timeline and initiatives.
// The JSON state files stay the runner's source of truth; this is a queryable, durable view of them.
// Writers: the runner (sync on every save) and the dashboard (reconcile on every poll, which also
// picks up runs from an older runner process). Needs node:sqlite (Node 22.13+); without it every call is a no-op.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as status from './status.mjs';
import { readJson } from './util.mjs';

const HUB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DB_FILE = path.join(HUB, 'data', 'agentic.db');
const STATE_ROOT = path.join(HUB, 'state');
const RUNS_ROOT = path.join(HUB, 'runs');
const INIT_DIR = path.join(HUB, 'initiatives');

let DatabaseSync = null;
let unavailable = null;
{
  // node:sqlite prints an ExperimentalWarning on load; keep it out of the runner's output.
  const emit = process.emitWarning;
  process.emitWarning = (w, ...rest) => (/SQLite/i.test(String(w?.message || w)) ? undefined : emit.call(process, w, ...rest));
  try { ({ DatabaseSync } = await import('node:sqlite')); } catch (e) { unavailable = e.message; } finally { process.emitWarning = emit; }
}

export const available = () => !!DatabaseSync;
export const unavailableReason = () => `node:sqlite is not available in Node ${process.versions.node}${unavailable ? ` (${unavailable})` : ''}. Use Node 22.13 or later for the dashboard.`;

let db = null;
function conn() {
  if (db || !DatabaseSync) return db;
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  db = new DatabaseSync(DB_FILE);
  db.exec(`PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;
CREATE TABLE IF NOT EXISTS changes(
  repo TEXT NOT NULL, id TEXT NOT NULL, status TEXT, awaiting TEXT, risk TEXT, cost REAL, stage_index INTEGER,
  updated_at TEXT, src_mtime REAL, summary TEXT NOT NULL, PRIMARY KEY(repo, id));
CREATE TABLE IF NOT EXISTS documents(
  repo TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL, text TEXT NOT NULL, PRIMARY KEY(repo, id, name));
CREATE TABLE IF NOT EXISTS events(
  seq INTEGER PRIMARY KEY AUTOINCREMENT, repo TEXT NOT NULL, id TEXT NOT NULL, at TEXT NOT NULL, type TEXT NOT NULL,
  gate TEXT, actor TEXT, message TEXT, note TEXT, cost REAL, seconds REAL, ok INTEGER, ref TEXT);
CREATE INDEX IF NOT EXISTS events_change ON events(repo, id, seq);
CREATE INDEX IF NOT EXISTS events_recent ON events(at);
CREATE UNIQUE INDEX IF NOT EXISTS events_ref ON events(repo, id, type, ref);
CREATE TABLE IF NOT EXISTS initiatives(id TEXT PRIMARY KEY, idea TEXT, children TEXT NOT NULL, updated_at TEXT, src_mtime REAL);`);
  return db;
}

let warned = false;
const guard = fn => (...args) => {
  try { return fn(...args); } catch (e) {
    if (!warned) { warned = true; process.stderr.write(`store: ${e.message} (the UI may be stale; JSON state is unaffected)\n`); }
  }
};

function tx(d, fn) {
  d.exec('BEGIN IMMEDIATE');
  try { fn(); d.exec('COMMIT'); } catch (e) { d.exec('ROLLBACK'); throw e; }
}

// ───────────────────────────────────── writes ─────────────────────────────────────

const stamp = ms => new Date(ms).toISOString();
/** "2026-10-22T17-03-16-680Z-research.json" -> ISO time of that run. */
const runTime = f => { const m = f.match(/^(\d{4}-\d\d-\d\dT)(\d\d)-(\d\d)-(\d\d)-(\d+Z)/); return m ? `${m[1]}${m[2]}:${m[3]}:${m[4]}.${m[5]}` : new Date().toISOString(); };

function addEvent(d, repo, id, e) {
  d.prepare('INSERT OR IGNORE INTO events(repo,id,at,type,gate,actor,message,note,cost,seconds,ok,ref) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(repo, id, e.at || new Date().toISOString(), e.type, e.gate ?? null, e.actor ?? null, e.message ?? null, e.note ?? null, e.cost ?? null, e.seconds ?? null, e.ok == null ? null : e.ok ? 1 : 0, e.ref ?? null);
}

/** Agent runs are recorded by the runner as one JSON log each; turn the unseen ones into events. */
function ingestRuns(d, repo, id) {
  const dir = path.join(RUNS_ROOT, repo, id);
  if (!fs.existsSync(dir)) return;
  const seen = new Set(d.prepare("SELECT ref FROM events WHERE repo=? AND id=? AND type='agent'").all(repo, id).map(r => r.ref));
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json') || f.startsWith('ui-') || seen.has(f)) continue;
    const log = readJson(path.join(dir, f), null);
    if (!log) continue;
    addEvent(d, repo, id, { at: runTime(f), type: 'agent', actor: log.role, message: log.label, cost: log.cost || 0, seconds: log.seconds || 0, ok: log.exitCode === 0 && !log.timedOut, ref: f });
  }
}

/** Gate decisions are rows of approvals.md: | When | Gate | Decision | By | Risk | Note |. */
function ingestApprovals(d, repo, id, text) {
  for (const line of text.split('\n')) {
    const cells = line.split(/(?<!\\)\|/).slice(1, -1).map(c => c.trim().replace(/\\\|/g, '|'));
    if (cells.length < 6 || !/^\d{4}-\d\d-\d\d /.test(cells[0])) continue;
    const when = new Date(cells[0].replace(' ', 'T').replace(' ', ''));
    addEvent(d, repo, id, { at: isNaN(when) ? new Date().toISOString() : when.toISOString(), type: 'gate', gate: cells[1].split(' ')[0], actor: cells[3], message: cells[2], note: cells[5], ref: line });
  }
}

/**
 * Record the current state of one change. `s` is the runner's state object; ctx = { repo, config, root }.
 * Safe to call as often as you like: documents are replaced, events are deduplicated.
 */
export const sync = guard((s, ctx) => {
  const d = conn();
  if (!d) return;
  const { repo, config, root } = ctx;
  const full = { ...s, repo };
  const { summary, files, approvals } = status.derive(full, config, root);
  const settled = ['done', 'failed', 'aborted'].includes(s.status);
  const diff = s.awaiting || settled ? status.codeDiff(full) : null;
  let mtime = 0;
  try { mtime = fs.statSync(path.join(STATE_ROOT, repo, `${s.id}.json`)).mtimeMs; } catch { /* state not on disk yet */ }

  tx(d, () => {
    const prev = d.prepare('SELECT status, awaiting, stage_index FROM changes WHERE repo=? AND id=?').get(repo, s.id);
    d.prepare(`INSERT INTO changes(repo,id,status,awaiting,risk,cost,stage_index,updated_at,src_mtime,summary) VALUES(?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(repo,id) DO UPDATE SET status=excluded.status, awaiting=excluded.awaiting, risk=excluded.risk, cost=excluded.cost,
        stage_index=excluded.stage_index, updated_at=excluded.updated_at, src_mtime=excluded.src_mtime, summary=excluded.summary`)
      .run(repo, s.id, s.status, s.awaiting || null, s.risk, s.costUsd || 0, s.stageIndex, s.updatedAt || null, mtime, JSON.stringify(summary));

    // Keep what we have when the worktree is gone: a merged change still needs its documents in the UI.
    const put = (name, kind, text) => d.prepare('INSERT INTO documents(repo,id,name,kind,text) VALUES(?,?,?,?,?) ON CONFLICT(repo,id,name) DO UPDATE SET kind=excluded.kind, text=excluded.text').run(repo, s.id, name, kind, text);
    if (files.length) {
      d.prepare("DELETE FROM documents WHERE repo=? AND id=? AND kind='md'").run(repo, s.id);
      for (const f of files) put(f.name, 'md', f.text);
    }
    if (diff) put('code diff', 'diff', diff);
    if (approvals) put('approvals.md', 'approvals', approvals);

    if (!prev) addEvent(d, repo, s.id, { at: s.createdAt, type: 'created', message: String(s.idea || '').split('\n')[0].slice(0, 200) });
    if (!prev || prev.status !== s.status || prev.awaiting !== (s.awaiting || null) || prev.stage_index !== s.stageIndex) {
      const stage = config.stages[Math.min(s.stageIndex, config.stages.length - 1)];
      const what = s.awaiting ? `waiting for approval at ${s.awaiting}` : s.status === 'failed' ? `failed: ${String(s.error || '').split('\n')[0].slice(0, 160)}` : s.status;
      addEvent(d, repo, s.id, { at: s.updatedAt, type: 'status', gate: s.awaiting || null, message: `${what} · stage ${stage?.id}` });
    }
    ingestRuns(d, repo, s.id);
    if (approvals) ingestApprovals(d, repo, s.id, approvals);
  });
});

export const syncInitiative = guard(i => {
  const d = conn();
  if (!d) return;
  let mtime = 0;
  try { mtime = fs.statSync(path.join(INIT_DIR, `${i.id}.json`)).mtimeMs; } catch { /* not on disk yet */ }
  d.prepare(`INSERT INTO initiatives(id,idea,children,updated_at,src_mtime) VALUES(?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET idea=excluded.idea, children=excluded.children, updated_at=excluded.updated_at, src_mtime=excluded.src_mtime`)
    .run(i.id, i.idea, JSON.stringify(i.children), i.updatedAt || null, mtime);
});

/**
 * Bring the store up to date with the state files on disk: new changes, changes written by a runner that
 * does not know about the store, and initiatives. Cheap when nothing changed (one stat per file).
 * `infoFor(repo)` returns { config, root }.
 */
export const reconcile = guard(infoFor => {
  const d = conn();
  if (!d) return;
  const known = new Map(d.prepare('SELECT repo, id, src_mtime FROM changes').all().map(r => [`${r.repo}/${r.id}`, r.src_mtime]));
  if (fs.existsSync(STATE_ROOT)) {
    for (const e of fs.readdirSync(STATE_ROOT, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      for (const f of fs.readdirSync(path.join(STATE_ROOT, e.name)).filter(n => n.endsWith('.json'))) {
        const file = path.join(STATE_ROOT, e.name, f);
        const id = f.slice(0, -5);
        const mtime = fs.statSync(file).mtimeMs;
        if ((known.get(`${e.name}/${id}`) ?? -1) >= mtime) continue;
        const s = readJson(file, null);
        if (s) sync(s, { repo: e.name, ...infoFor(e.name) });
      }
    }
  }
  if (fs.existsSync(INIT_DIR)) {
    const seen = new Map(d.prepare('SELECT id, src_mtime FROM initiatives').all().map(r => [r.id, r.src_mtime]));
    for (const f of fs.readdirSync(INIT_DIR).filter(n => n.endsWith('.json'))) {
      const file = path.join(INIT_DIR, f);
      if ((seen.get(f.slice(0, -5)) ?? -1) >= fs.statSync(file).mtimeMs) continue;
      const i = readJson(file, null);
      if (i) syncInitiative(i);
    }
  }
});

// ───────────────────────────────────── reads ─────────────────────────────────────

const parse = r => ({ repo: r.repo, id: r.id, ...JSON.parse(r.summary) });

export function listChanges() {
  const d = conn();
  if (!d) return [];
  const last = d.prepare("SELECT message, at FROM events WHERE repo=? AND id=? AND type='agent' ORDER BY seq DESC LIMIT 1");
  return d.prepare('SELECT repo, id, summary FROM changes ORDER BY updated_at DESC').all().map(r => {
    const c = parse(r);
    const l = last.get(r.repo, r.id);
    c.lastRun = l ? { label: l.message, at: l.at } : null;
    return c;
  });
}

export function getChange(repo, id) {
  const d = conn();
  const r = d?.prepare('SELECT repo, id, summary FROM changes WHERE repo=? AND id=?').get(repo, id);
  return r ? parse(r) : null;
}

export const documents = (repo, id) => conn()?.prepare('SELECT name, kind, text FROM documents WHERE repo=? AND id=? ORDER BY rowid').all(repo, id) || [];

export const events = (repo, id, limit = 200) =>
  conn()?.prepare('SELECT at, type, gate, actor, message, note, cost, seconds, ok FROM events WHERE repo=? AND id=? ORDER BY at DESC, seq DESC LIMIT ?').all(repo, id, limit) || [];

export const recentEvents = (limit = 25) =>
  conn()?.prepare('SELECT repo, id, at, type, gate, actor, message, note, cost, seconds, ok FROM events ORDER BY at DESC, seq DESC LIMIT ?').all(limit) || [];

export const spend = () => conn()?.prepare('SELECT repo, SUM(cost) AS total, COUNT(*) AS changes FROM changes GROUP BY repo ORDER BY total DESC').all() || [];

/** Agent spend broken down by role, from the run events. */
export const spendByRole = () =>
  conn()?.prepare("SELECT actor AS role, SUM(cost) AS total, COUNT(*) AS runs, SUM(seconds) AS seconds FROM events WHERE type='agent' GROUP BY actor ORDER BY total DESC").all() || [];

export const initiatives = () =>
  conn()?.prepare('SELECT id, idea, children FROM initiatives ORDER BY updated_at DESC').all().map(r => ({ id: r.id, idea: r.idea, children: JSON.parse(r.children) })) || [];
