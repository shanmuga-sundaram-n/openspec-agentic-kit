// Blocked gates, archive and merge: the build checks and the release stage.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SKIP, setup, start, approve, state, approvals, throughRelease } from '../helpers/scenario.mjs';
import { gitIn } from '../helpers/hub.mjs';

test('GATE003 a failing test command blocks the Merge gate until --override, and the override is recorded', { skip: SKIP }, t => {
  const { hub, name } = setup(t, { risk: 'low', test: 'false' });
  start(hub, name, 'low');
  const r = approve(hub, name);
  assert.equal(r.code, 0, r.out);
  assert.equal(state(hub, name).awaiting, 'G3');
  assert.ok(state(hub, name).checks.some(c => c.name === 'tests' && !c.ok));

  const refused = approve(hub, name, '--no-run');
  assert.notEqual(refused.code, 0);
  assert.match(refused.out, /check failed: tests/);

  const forced = approve(hub, name, '--override', '--note', 'known failure', '--no-run');
  assert.equal(forced.code, 0, forced.out);
  assert.match(approvals(hub, name), /G3 Merge approval \| approved \(override\) \|.*known failure/);
});

test('GIT004 release archives the change, merges it with a merge commit, and updates the main specs', { skip: SKIP }, t => {
  const { hub, target, name } = setup(t, { risk: 'low' });
  const r = throughRelease(hub, name);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /archived/);
  assert.match(r.out, /merged change\/demo-change into main/);

  const s = state(hub, name);
  assert.equal(s.status, 'done');
  assert.equal(s.merged, true);
  const parents = gitIn(target, 'log', '-1', '--format=%P', 'main').split(' ');
  assert.equal(parents.length, 2, 'no-ff leaves a merge commit');
  assert.match(gitIn(target, 'log', '-1', '--format=%s', 'main'), /^Merge change\/demo-change: demo-change/);
  assert.ok(fs.existsSync(path.join(target, 'openspec/specs/demo/spec.md')), 'delta specs were merged into the main specs');
  assert.ok(fs.existsSync(path.join(target, 'openspec/changes/archive')), 'the change was archived');
});

test('GIT005 a dirty main checkout is not merged into and the manual command is printed', { skip: SKIP }, t => {
  const { hub, target, name } = setup(t, { risk: 'low' });
  start(hub, name, 'low');
  approve(hub, name);
  fs.writeFileSync(path.join(target, 'README.md'), '# edited and not committed\n');
  const r = approve(hub, name);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /Not merged automatically: the main checkout has uncommitted changes/);
  assert.match(r.out, /git checkout main && git merge --no-ff change\/demo-change/);
  assert.equal(gitIn(target, 'log', '--merges', '--oneline').trim(), '');
  assert.notEqual(state(hub, name).merged, true);
});

test('GIT004 with strategy none the change is archived but the branch is left for you to merge', { skip: SKIP }, t => {
  const { hub, target, name } = setup(t, { risk: 'low', config: { merge: { strategy: 'none' } } });
  const r = throughRelease(hub, name);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /Branch change\/demo-change is ready to merge into main/);
  assert.equal(gitIn(target, 'log', '--merges', '--oneline').trim(), '');
  assert.ok(gitIn(target, 'branch', '--list', 'change/demo-change').includes('change/demo-change'));
});
