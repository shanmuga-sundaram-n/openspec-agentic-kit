// Integration harness: runs the real CLI from a throwaway copy of the hub against a throwaway git repo,
// with a stub in place of `claude`. Hub paths come from each module's own location, so state, runs,
// repos and worktrees all land in the copy and never in the real hub.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkTmp, rm } from './tmp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REAL_HUB = path.resolve(HERE, '..', '..');
export const STUB = path.join(HERE, 'claude-stub.mjs');

const COPY = ['bin', 'lib', 'agents', 'schemas'];
const COPY_FILES = ['config.base.json', 'openspec.base.yaml'];

/** Why integration tests should skip, or null when the `openspec` CLI is available. */
export function openspecMissing(env = process.env) {
  const r = spawnSync('openspec', ['--version'], { encoding: 'utf8', env });
  return r.status === 0 ? null : 'the openspec CLI is not installed (npm install -g @fission-ai/openspec)';
}

const GIT_ENV = {
  GIT_AUTHOR_NAME: 'Test Author', GIT_AUTHOR_EMAIL: 'author@example.com',
  GIT_COMMITTER_NAME: 'Test Author', GIT_COMMITTER_EMAIL: 'author@example.com',
  GIT_CONFIG_NOSYSTEM: '1',
};

function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_ENV } });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout.trim();
}

/** A git repo with one commit on `main`. Pass `email` to set the approver identity used by gates. */
export function createTargetRepo(t, { email = 'author@example.com', files = { 'README.md': '# target\n' } } = {}) {
  const dir = fs.realpathSync(mkTmp('agentic-target-'));
  t.after(() => rm(dir));
  git(dir, 'init', '-b', 'main');
  git(dir, 'config', 'user.name', 'Test Author');
  git(dir, 'config', 'user.email', email);
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), content);
  }
  git(dir, 'add', '-A');
  git(dir, 'commit', '-m', 'initial');
  return dir;
}

export function gitIn(dir, ...args) { return git(dir, ...args); }

/** Copy the hub into a temp dir and return helpers bound to it. */
export function createHub(t) {
  const root = fs.realpathSync(mkTmp('agentic-hub-'));
  t.after(() => rm(root));
  for (const d of COPY) fs.cpSync(path.join(REAL_HUB, d), path.join(root, d), { recursive: true });
  for (const f of COPY_FILES) fs.copyFileSync(path.join(REAL_HUB, f), path.join(root, f));
  fs.chmodSync(STUB, 0o755);
  const stubState = path.join(root, '.stub-state');

  const hub = {
    root,
    stubState,
    scenario: {},
    bin: path.join(root, 'bin', 'agentic.mjs'),

    /** Run the CLI. Returns { code, out } where out is stdout and stderr together. */
    run(args, { env = {}, cwd = root } = {}) {
      const r = spawnSync(process.execPath, [hub.bin, ...args], {
        cwd, encoding: 'utf8',
        env: {
          ...process.env, ...GIT_ENV, NO_COLOR: '1', AGENTIC_REPO: '', OPENSPEC_TELEMETRY: '0',
          STUB_STATE_DIR: stubState, STUB_SCENARIO: JSON.stringify(hub.scenario), ...env,
        },
      });
      return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
    },

    /** Register a repo and point its agents at the stub. */
    addRepo(name, repoPath, { test = 'true', config = {} } = {}) {
      const r = hub.run(['repo', 'add', name, repoPath, '--base', 'main', '--test', test]);
      if (r.code !== 0) throw new Error(`repo add failed:\n${r.out}`);
      hub.override(name, { agent: { command: STUB }, ...config });
    },

    /** Deep-merge settings into repos/<name>/overrides.json. */
    override(name, patch) {
      const file = path.join(root, 'repos', name, 'overrides.json');
      const cur = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
      fs.writeFileSync(file, JSON.stringify({ ...cur, ...patch, agent: { ...cur.agent, ...patch.agent } }, null, 2));
    },

    state(name, id) {
      return JSON.parse(fs.readFileSync(path.join(root, 'state', name, `${id}.json`), 'utf8'));
    },
    path: (...p) => path.join(root, ...p),
  };
  return hub;
}
