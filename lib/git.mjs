import fs from 'node:fs';
import path from 'node:path';
import { run, AgenticError, tail } from './util.mjs';

function git(args, cwd, { allowFail = false } = {}) {
  const r = run('git', args, { cwd });
  if (r.code !== 0 && !allowFail) throw new AgenticError(`git ${args.join(' ')} failed:\n${tail(r.stderr || r.stdout, 15)}`);
  return r;
}

export function repoRoot(cwd = process.cwd()) {
  const r = git(['rev-parse', '--show-toplevel'], cwd, { allowFail: true });
  if (r.code !== 0) throw new AgenticError('Not inside a git repository. Run the runner from your project root.');
  return r.stdout.trim();
}

export function currentBranch(cwd) {
  return git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd).stdout.trim();
}

export function isClean(cwd) {
  return git(['status', '--porcelain'], cwd).stdout.trim() === '';
}

export function user(cwd) {
  const name = git(['config', 'user.name'], cwd, { allowFail: true }).stdout.trim() || process.env.USER || 'unknown';
  const email = git(['config', 'user.email'], cwd, { allowFail: true }).stdout.trim() || '';
  return { name, email };
}

export function branchExists(cwd, branch) {
  return git(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], cwd, { allowFail: true }).code === 0;
}

export function addWorktree(root, dir, branch, base) {
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  git(['worktree', 'add', '-b', branch, dir, base], root);
}

export function removeWorktree(root, dir) {
  git(['worktree', 'remove', '--force', dir], root, { allowFail: true });
}

export function switchNewBranch(cwd, branch, base) {
  git(['switch', '-c', branch, base], cwd);
}

export function commitAll(cwd, message) {
  git(['add', '-A'], cwd);
  if (git(['diff', '--cached', '--quiet'], cwd, { allowFail: true }).code === 0) return false;
  git(['commit', '-q', '-m', message], cwd);
  return true;
}

export function diffStat(cwd, base) {
  return git(['diff', '--stat', `${base}...HEAD`], cwd, { allowFail: true }).stdout.trim();
}

export function merge(root, { base, branch, strategy, message }) {
  if (currentBranch(root) !== base) {
    return { merged: false, reason: `the main checkout is on ${currentBranch(root)}, not ${base}` };
  }
  if (!isClean(root)) return { merged: false, reason: `the main checkout has uncommitted changes` };
  let r;
  if (strategy === 'squash') {
    r = git(['merge', '--squash', branch], root, { allowFail: true });
    if (r.code === 0) r = git(['commit', '-q', '-m', message], root, { allowFail: true });
  } else if (strategy === 'ff-only') {
    r = git(['merge', '--ff-only', branch], root, { allowFail: true });
  } else {
    r = git(['merge', '--no-ff', '-m', message, branch], root, { allowFail: true });
  }
  if (r.code !== 0) {
    git(['merge', '--abort'], root, { allowFail: true });
    return { merged: false, reason: tail(r.stderr || r.stdout, 8) };
  }
  return { merged: true };
}

export function push(root, base) {
  const r = git(['push', 'origin', base], root, { allowFail: true });
  return r.code === 0 ? null : tail(r.stderr, 6);
}

export function deleteBranch(root, branch) {
  git(['branch', '-D', branch], root, { allowFail: true });
}

/** True when git tracks anything at this path (file or directory) in the checkout. */
export function isTracked(cwd, rel) {
  return git(['ls-files', '--', rel], cwd, { allowFail: true }).stdout.trim() !== '';
}

/** Hide hub-managed paths from git in this checkout without touching the repo's .gitignore. */
export function excludeLocally(cwd, patterns) {
  const r = git(['rev-parse', '--path-format=absolute', '--git-path', 'info/exclude'], cwd);
  const file = r.stdout.trim();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const have = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n') : [];
  const add = patterns.filter(p => !have.includes(p));
  if (add.length) fs.appendFileSync(file, (have.length && have.at(-1) !== '' ? '\n' : '') + add.join('\n') + '\n');
}
