#!/usr/bin/env node
// Stands in for `claude -p --agent <role>` in integration tests: no model, no network.
// It reads the real prompt from stdin, writes canned content from test/fixtures/artifacts/,
// and prints the same JSON shape the runner parses (see test/fixtures/claude-output.sample.json).
//
// Scenario switches arrive as JSON in STUB_SCENARIO:
//   risk          tier written into proposal.md (default "medium")
//   cost          total_cost_usd reported per call (default 0.01)
//   failTimes     { "<artifact>": n }  exit 1 with no file for the first n calls of that artifact
//   skip          [ "<artifact>" ]     exit 0 without writing the file
//   blockingReview  true | n           the reviewer reports a blocking finding (always, or for the first n reviews)
// Call counters live in STUB_STATE_DIR so they survive across the runner's separate processes.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const role = args[args.indexOf('--agent') + 1];
const prompt = fs.readFileSync(0, 'utf8');
const sc = JSON.parse(process.env.STUB_SCENARIO || '{}');
const stateDir = process.env.STUB_STATE_DIR;

function bump(key) {
  if (!stateDir) return 1;
  fs.mkdirSync(stateDir, { recursive: true });
  const f = path.join(stateDir, key.replace(/[^\w.-]/g, '_'));
  const n = (fs.existsSync(f) ? Number(fs.readFileSync(f, 'utf8')) : 0) + 1;
  fs.writeFileSync(f, String(n));
  return n;
}

function reply(text, { error = false } = {}) {
  process.stdout.write(JSON.stringify({
    type: 'result', subtype: error ? 'error_during_execution' : 'success', is_error: error,
    num_turns: 1, total_cost_usd: sc.cost ?? 0.01, result: text,
  }) + '\n');
  process.exit(error ? 1 : 0);
}

const changeId = (prompt.match(/^Change:\s*(\S+)/m) || [])[1];
const fill = s => s.replace(/\{\{id\}\}/g, changeId).replace(/\{\{risk\}\}/g, sc.risk || 'medium');
const fixture = name => fill(fs.readFileSync(path.join(here, '..', 'fixtures', 'artifacts', `${name}.md`), 'utf8'));
const write = (rel, content) => { fs.mkdirSync(path.dirname(rel), { recursive: true }); fs.writeFileSync(rel, content); };

if (/You are the Implementer/.test(prompt)) {
  const tasks = path.join('openspec', 'changes', changeId, 'tasks.md');
  if (fs.existsSync(tasks)) write(tasks, fs.readFileSync(tasks, 'utf8').replace(/- \[ \]/g, '- [x]'));
  const specs = path.join('openspec', 'changes', changeId, 'specs');
  const lines = [];
  for (const f of fs.existsSync(specs) ? fs.readdirSync(specs, { recursive: true }).filter(x => x.endsWith('.md')) : []) {
    const text = fs.readFileSync(path.join(specs, f), 'utf8');
    for (const m of text.matchAll(/### Requirement:\s*([A-Z][A-Z0-9]+)-(\d+)/g)) lines.push(`test('${m[1]}${m[2]} demo works', () => {});`);
  }
  if (lines.length) write(path.join('test', `${changeId}.test.js`), lines.join('\n') + '\n');
  reply('Tasks completed: all. Tasks blocked: none. Test results: pass (stub).');
}

if (/You are the Code Reviewer/.test(prompt)) {
  const file = (prompt.match(/Write your findings to (\S+) with/) || [])[1];
  const n = bump('review');
  const blocking = sc.blockingReview === true || (Number.isInteger(sc.blockingReview) && n <= sc.blockingReview);
  write(file, `# Review\n\n## Blocking\n${blocking ? '- Null check missing in demo.js' : '- None'}\n\n## Should fix\n- None\n\n## Nits\n- None\n\n## Spec conformance\n- DEMO-001: conforms\n`);
  reply(blocking ? '1 blocking finding.' : '0 blocking findings. Looks good.');
}

const artifact = (prompt.match(/the "([\w-]+)" artifact/) || [])[1];
const instrFile = (prompt.match(/Read (\S+\.instructions\.json)/) || [])[1];
if (!artifact || !instrFile) reply(`stub: unrecognised prompt for role ${role}`, { error: true });

const calls = bump(`artifact-${artifact}`);
if ((sc.failTimes?.[artifact] || 0) >= calls) reply(`stub: simulated failure ${calls} for ${artifact}`, { error: true });
if (sc.skip?.includes(artifact)) reply(`stub: skipped ${artifact}`);

const { outputPath } = JSON.parse(fs.readFileSync(instrFile, 'utf8'));
const rel = outputPath.includes('*') ? path.join('specs', 'demo', 'spec.md') : outputPath;
write(path.join('openspec', 'changes', changeId, rel), fixture(artifact));
reply(`Wrote ${artifact}.\nOpen questions: none`);
