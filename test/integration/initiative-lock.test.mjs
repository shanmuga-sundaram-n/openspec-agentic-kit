// Cross-repo initiatives (linked gates) and the single-runner lock.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHub, createTargetRepo } from '../helpers/hub.mjs';
import { SKIP, ID, setup, start, state } from '../helpers/scenario.mjs';

test('INIT003 linked approval needs every active change at the same gate unless --partial', { skip: SKIP }, t => {
  const hub = createHub(t);
  hub.scenario = { risk: 'medium' };
  hub.addRepo('repo-a', createTargetRepo(t));
  hub.addRepo('repo-b', createTargetRepo(t));
  const started = hub.run(['initiative', 'start', 'add a demo thing', '--repos', 'repo-a,repo-b', '--id', 'init1']);
  assert.equal(started.code, 0, started.out);
  const status = hub.run(['initiative', 'status', 'init1']);
  assert.match(status.out, /repo-a\s+waiting at G1/);
  assert.match(status.out, /repo-b\s+waiting at G1/);

  // Move repo-a ahead of repo-b so the gates are no longer aligned.
  assert.equal(hub.run(['approve', 'init1-repo-a', '--repo', 'repo-a']).code, 0);
  assert.equal(hub.state('repo-a', 'init1-repo-a').awaiting, 'G2');

  const refused = hub.run(['initiative', 'approve', 'init1']);
  assert.notEqual(refused.code, 0);
  assert.match(refused.out, /Linked gates need every active change waiting at the same gate/);
  assert.match(refused.out, /repo-a: waiting at G2/);
  assert.match(refused.out, /repo-b: waiting at G1/);

  const partial = hub.run(['initiative', 'approve', 'init1', '--partial']);
  assert.equal(partial.code, 0, partial.out);
  assert.equal(hub.state('repo-b', 'init1-repo-b').awaiting, 'G2');
  assert.equal(hub.state('repo-a', 'init1-repo-a').awaiting, 'G3');
});

test('INIT003 aligned changes are approved together', { skip: SKIP }, t => {
  const hub = createHub(t);
  hub.scenario = { risk: 'medium' };
  hub.addRepo('repo-a', createTargetRepo(t));
  hub.addRepo('repo-b', createTargetRepo(t));
  hub.run(['initiative', 'start', 'add a demo thing', '--repos', 'repo-a,repo-b', '--id', 'init1']);
  const r = hub.run(['initiative', 'approve', 'init1']);
  assert.equal(r.code, 0, r.out);
  assert.equal(hub.state('repo-a', 'init1-repo-a').awaiting, 'G2');
  assert.equal(hub.state('repo-b', 'init1-repo-b').awaiting, 'G2');
});

test('PIPE004 a live lock from another process refuses a second runner', { skip: SKIP }, t => {
  const { hub, name } = setup(t);
  start(hub, name);
  fs.writeFileSync(hub.path('state', name, `${ID}.lock`), String(process.pid));
  const r = hub.run(['resume', ID, '--repo', name]);
  assert.notEqual(r.code, 0);
  assert.match(r.out, new RegExp(`already being run by process ${process.pid}`));
});

test('PIPE004 a lock left by a dead process is replaced', { skip: SKIP }, t => {
  const { hub, name } = setup(t);
  start(hub, name);
  const dead = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' });
  fs.writeFileSync(hub.path('state', name, `${ID}.lock`), dead.stdout);
  const r = hub.run(['resume', ID, '--repo', name]);
  assert.equal(r.code, 0, r.out);
  assert.equal(state(hub, name).awaiting, 'G1');
});
