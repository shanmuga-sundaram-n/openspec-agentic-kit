// Runs the suite with explicit file paths. A directory argument fails on Node 22 and globs are missing
// on Node 20, while a bare `node --test` would also execute helpers and fixtures under test/.
// Usage: node test/run.mjs [unit|integration]
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { walk } from '../lib/util.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const only = process.argv[2];
const dirs = only ? [only] : ['unit', 'integration'];
const files = dirs
  .flatMap(d => walk(path.join(root, 'test', d)))
  .filter(f => f.endsWith('.test.mjs'))
  .sort();

if (!files.length) {
  console.log(`No test files found in test/${dirs.join(', test/')}.`);
  process.exit(0);
}
const r = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit', cwd: root });
process.exit(r.status ?? 1);
