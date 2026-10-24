import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const C = process.stdout.isTTY && !process.env.NO_COLOR
  ? { b: s => `\x1b[1m${s}\x1b[0m`, dim: s => `\x1b[2m${s}\x1b[0m`, g: s => `\x1b[32m${s}\x1b[0m`, r: s => `\x1b[31m${s}\x1b[0m`, y: s => `\x1b[33m${s}\x1b[0m`, c: s => `\x1b[36m${s}\x1b[0m` }
  : { b: s => s, dim: s => s, g: s => s, r: s => s, y: s => s, c: s => s };

process.stdout.on('error', e => { if (e.code === 'EPIPE') process.exit(0); throw e; });

export function say(msg = '') { process.stdout.write(msg + '\n'); }
export function step(msg) { say(`${C.c('▸')} ${msg}`); }
export function ok(msg) { say(`${C.g('✓')} ${msg}`); }
export function warn(msg) { say(`${C.y('!')} ${msg}`); }
export function fail(msg) { say(`${C.r('✗')} ${msg}`); }

export class AgenticError extends Error {}

/** Run a command synchronously. Returns { code, stdout, stderr }. */
export function run(cmd, args, { cwd, input, env } = {}) {
  const r = spawnSync(cmd, args, { cwd, input, env: { ...process.env, ...env }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw new AgenticError(`Could not run ${cmd}: ${r.error.message}`);
  return { code: r.status ?? 1, stdout: r.stdout || '', stderr: r.stderr || '' };
}

/** Run a shell command line (for user-configured commands like "npm test"). */
export function shell(line, { cwd, env } = {}) {
  return run(process.platform === 'win32' ? 'cmd' : 'sh', process.platform === 'win32' ? ['/c', line] : ['-c', line], { cwd, env });
}

/** Run a command asynchronously with stdin, timeout and captured output. */
export function runAsync(cmd, args, { cwd, input, timeoutMs, env } = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', timedOut = false;
    const timer = timeoutMs ? setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, timeoutMs) : null;
    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });
    child.on('error', e => { if (timer) clearTimeout(timer); resolve({ code: 127, stdout, stderr: stderr + e.message, timedOut }); });
    child.on('close', code => { if (timer) clearTimeout(timer); resolve({ code: code ?? 1, stdout, stderr, timedOut }); });
    if (input) child.stdin.write(input);
    child.stdin.end();
  });
}

export function readJson(file, fallback = undefined) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {
    if (fallback !== undefined) return fallback;
    throw new AgenticError(`Cannot read ${file}: ${e.message}`);
  }
}

export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

export function tail(text, lines = 40) {
  const all = String(text || '').trimEnd().split('\n');
  return all.slice(-lines).join('\n');
}

export function slugify(text, maxWords = 6) {
  const stop = new Set(['a', 'an', 'the', 'to', 'of', 'for', 'and', 'or', 'in', 'on', 'with', 'we', 'i', 'want', 'need', 'should', 'so', 'that', 'be', 'is']);
  const words = String(text).toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/[\s-]+/).filter(w => w && !stop.has(w));
  return words.slice(0, maxWords).join('-').slice(0, 50).replace(/-+$/, '') || `change-${Date.now()}`;
}

export function nowStamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  const offMin = -d.getTimezoneOffset();
  const sign = offMin >= 0 ? '+' : '-';
  const off = `${sign}${pad(Math.floor(Math.abs(offMin) / 60))}:${pad(Math.abs(offMin) % 60)}`;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())} ${off}`;
}

export function walk(dir, { skip = ['node_modules', '.git', 'dist', 'build', 'coverage', '.agentic'] } = {}) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, { skip }));
    else out.push(p);
  }
  return out;
}

export function countLines(file) {
  try { return fs.readFileSync(file, 'utf8').split('\n').length; } catch { return 0; }
}
