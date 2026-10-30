import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHub, createTargetRepo, REAL_HUB, STUB, openspecMissing } from '../helpers/hub.mjs';
import { mkTmp, rm, writeTree } from '../helpers/tmp.mjs';
import { artifactPrompt } from '../../lib/agent.mjs';

const listing = d => (fs.existsSync(path.join(REAL_HUB, d)) ? fs.readdirSync(path.join(REAL_HUB, d)).sort() : []);

test('REG001 the harness registers a repo in a copy of the hub and leaves the real hub untouched', t => {
  const before = { repos: listing('repos'), state: listing('state'), runs: listing('runs') };
  const hub = createHub(t);
  const target = createTargetRepo(t);
  hub.addRepo('demo-repo', target);

  const list = hub.run(['repo', 'list']);
  assert.equal(list.code, 0, list.out);
  assert.match(list.out, /demo-repo/);
  assert.equal(JSON.parse(fs.readFileSync(hub.path('repos', 'demo-repo', 'repo.json'), 'utf8')).path, target);
  assert.ok(fs.existsSync(hub.path('repos', 'demo-repo', 'context.md')), 'a context.md template is written');
  assert.deepEqual({ repos: listing('repos'), state: listing('state'), runs: listing('runs') }, before);
});

test('harness: the target repo is a clean git checkout on main with one commit', t => {
  const target = createTargetRepo(t);
  const r = spawnSync('git', ['log', '--oneline'], { cwd: target, encoding: 'utf8' });
  assert.equal(r.stdout.trim().split('\n').length, 1);
  assert.equal(spawnSync('git', ['status', '--porcelain'], { cwd: target, encoding: 'utf8' }).stdout, '');
});

function runStub({ cwd, artifact, scenario = {}, stateDir }) {
  const instr = path.join('.agentic', 'tmp', `${artifact}.instructions.json`);
  writeTree(cwd, { [instr]: JSON.stringify({ outputPath: artifact === 'specs' ? 'specs/**/*.md' : `${artifact}.md` }) });
  const prompt = artifactPrompt({ state: { id: 'demo', idea: 'x', decisions: [] }, artifact, role: 'spec-author', instructionsFile: instr, outputPath: 'openspec/changes/demo/x.md', revision: null });
  const r = spawnSync(STUB, ['-p', '--output-format', 'json', '--agent', 'spec-author'], {
    cwd, input: prompt, encoding: 'utf8',
    env: { ...process.env, STUB_SCENARIO: JSON.stringify(scenario), STUB_STATE_DIR: stateDir },
  });
  return { code: r.status, json: JSON.parse(r.stdout.slice(r.stdout.indexOf('{'))) };
}

test('harness: the stub writes the artifact the real prompt asks for and replies in the runner JSON shape', t => {
  const cwd = mkTmp(); const stateDir = mkTmp();
  t.after(() => { rm(cwd); rm(stateDir); });
  fs.chmodSync(STUB, 0o755);
  const r = runStub({ cwd, artifact: 'proposal', scenario: { risk: 'low' }, stateDir });
  assert.equal(r.code, 0);
  assert.equal(r.json.is_error, false);
  assert.equal(typeof r.json.total_cost_usd, 'number');
  assert.match(fs.readFileSync(path.join(cwd, 'openspec/changes/demo/proposal.md'), 'utf8'), /Risk tier: low/);
});

test('harness: the stub writes spec files under specs/<capability>/ for the glob output', t => {
  const cwd = mkTmp(); const stateDir = mkTmp();
  t.after(() => { rm(cwd); rm(stateDir); });
  const r = runStub({ cwd, artifact: 'specs', stateDir });
  assert.equal(r.code, 0);
  assert.ok(fs.existsSync(path.join(cwd, 'openspec/changes/demo/specs/demo/spec.md')));
});

test('harness: the stub fails the first n calls for an artifact and succeeds afterwards', t => {
  const cwd = mkTmp(); const stateDir = mkTmp();
  t.after(() => { rm(cwd); rm(stateDir); });
  const scenario = { failTimes: { design: 2 } };
  assert.equal(runStub({ cwd, artifact: 'design', scenario, stateDir }).code, 1);
  assert.equal(runStub({ cwd, artifact: 'design', scenario, stateDir }).code, 1);
  assert.equal(runStub({ cwd, artifact: 'design', scenario, stateDir }).code, 0);
  assert.ok(fs.existsSync(path.join(cwd, 'openspec/changes/demo/design.md')));
});

test('harness: the stub can report success without writing the file', t => {
  const cwd = mkTmp(); const stateDir = mkTmp();
  t.after(() => { rm(cwd); rm(stateDir); });
  const r = runStub({ cwd, artifact: 'design', scenario: { skip: ['design'] }, stateDir });
  assert.equal(r.code, 0);
  assert.ok(!fs.existsSync(path.join(cwd, 'openspec/changes/demo/design.md')));
});

test('harness: the captured claude output sample has the fields the runner reads', () => {
  const sample = JSON.parse(fs.readFileSync(path.join(REAL_HUB, 'test/fixtures/claude-output.sample.json'), 'utf8'));
  // The same extraction lib/agent.mjs performs on stdout.
  const text = JSON.stringify(sample);
  const out = JSON.parse(text.slice(text.indexOf('{')));
  assert.equal(typeof out.result, 'string');
  assert.equal(typeof out.total_cost_usd, 'number');
  assert.equal(out.is_error, false);
  assert.ok(!String(out.subtype).startsWith('error'));
});

test('harness: the stub output parses with the same fields as the captured sample', t => {
  const cwd = mkTmp(); const stateDir = mkTmp();
  t.after(() => { rm(cwd); rm(stateDir); });
  const sample = JSON.parse(fs.readFileSync(path.join(REAL_HUB, 'test/fixtures/claude-output.sample.json'), 'utf8'));
  const { json } = runStub({ cwd, artifact: 'proposal', stateDir });
  for (const key of ['type', 'subtype', 'is_error', 'result', 'total_cost_usd']) {
    assert.equal(typeof json[key], typeof sample[key], `stub field "${key}" differs in type from the captured sample`);
  }
});

test('harness: openspecMissing gives a clear skip reason when the binary is not on PATH', () => {
  const reason = openspecMissing({ PATH: '' });
  assert.match(reason, /openspec CLI is not installed/);
});

test('harness: integration files skip rather than fail when openspec is missing', { skip: openspecMissing() ?? false }, () => {
  // Pattern for every file that starts changes: `const SKIP = openspecMissing() ?? false;` then `{ skip: SKIP }`.
  assert.equal(openspecMissing(), null);
});

test('harness: addRepo points the repo agent command at the stub through overrides.json', t => {
  const hub = createHub(t);
  hub.addRepo('demo-repo', createTargetRepo(t));
  const o = JSON.parse(fs.readFileSync(hub.path('repos', 'demo-repo', 'overrides.json'), 'utf8'));
  assert.equal(o.agent.command, STUB);
});

test('harness: the stub reviewer reports blocking findings for the first n reviews only', t => {
  const cwd = mkTmp(); const stateDir = mkTmp();
  t.after(() => { rm(cwd); rm(stateDir); });
  const review = () => {
    const prompt = 'You are the Code Reviewer in a pipeline.\nChange: demo\nWrite your findings to openspec/changes/demo/review.md with exactly these sections:';
    spawnSync(STUB, ['-p', '--agent', 'code-reviewer'], { cwd, input: prompt, encoding: 'utf8', env: { ...process.env, STUB_SCENARIO: JSON.stringify({ blockingReview: 1 }), STUB_STATE_DIR: stateDir } });
    return fs.readFileSync(path.join(cwd, 'openspec/changes/demo/review.md'), 'utf8');
  };
  assert.match(review(), /## Blocking\n- Null check missing/);
  assert.match(review(), /## Blocking\n- None/);
});
