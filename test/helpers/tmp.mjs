import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Make a throwaway directory; the caller removes it with `rm(dir)` (use `t.after`). */
export function mkTmp(prefix = 'agentic-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function rm(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

/** Write files from a { 'relative/path': 'content' } map under `root`. */
export function writeTree(root, files) {
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  }
  return root;
}
