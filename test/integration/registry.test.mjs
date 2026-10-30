// Repo registration through the real CLI. No agents run, so these do not need the openspec CLI.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHub, createTargetRepo } from '../helpers/hub.mjs';

test('REG001 a name that is not lowercase kebab-case is refused and nothing is written', t => {
  const hub = createHub(t);
  const target = createTargetRepo(t);
  for (const bad of ['Demo_Repo', 'demo repo', '-demo']) {
    const r = hub.run(['repo', 'add', bad, target]);
    assert.notEqual(r.code, 0, bad);
    assert.match(r.out, /must be lowercase kebab-case/);
  }
  assert.equal(fs.existsSync(hub.path('repos')), false);
});

test('REG001 registering a name twice is refused and the first registration is kept', t => {
  const hub = createHub(t);
  const target = createTargetRepo(t);
  assert.equal(hub.run(['repo', 'add', 'demo-repo', target]).code, 0);
  const before = fs.readFileSync(hub.path('repos', 'demo-repo', 'repo.json'), 'utf8');
  const r = hub.run(['repo', 'add', 'demo-repo', target, '--test', 'npm test']);
  assert.notEqual(r.code, 0);
  assert.match(r.out, /"demo-repo" is already registered/);
  assert.equal(fs.readFileSync(hub.path('repos', 'demo-repo', 'repo.json'), 'utf8'), before);
});
