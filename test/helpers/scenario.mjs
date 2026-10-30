// Shared steps for end-to-end scenarios: a hub copy with one registered repo and the stub agent.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHub, createTargetRepo, openspecMissing } from './hub.mjs';

export const SKIP = openspecMissing() ?? false;
export const ID = 'demo-change';

export function setup(t, { risk = 'medium', config, test: testCmd, name = 'demo-repo' } = {}) {
  const hub = createHub(t);
  const target = createTargetRepo(t);
  hub.addRepo(name, target, { test: testCmd, config });
  hub.scenario = { risk };
  return { hub, target, name };
}

export const start = (hub, name, risk = 'medium', id = ID) => hub.run(['start', 'add a demo thing', '--repo', name, '--id', id, '--risk', risk]);
export const approve = (hub, name, ...extra) => hub.run(['approve', ID, '--repo', name, ...extra]);
export const state = (hub, name) => hub.state(name, ID);
export const approvals = (hub, name) => fs.readFileSync(path.join(state(hub, name).workdir, 'openspec/changes', ID, 'approvals.md'), 'utf8');
export const runLogs = (hub, name, label) => fs.readdirSync(hub.path('runs', name, ID)).filter(f => f.endsWith(`-${label}.json`)).map(f => JSON.parse(fs.readFileSync(hub.path('runs', name, ID, f), 'utf8')));

/** Drive a low-risk change through G1 and G3 so the release stage runs. */
export function throughRelease(hub, name) {
  assert.equal(start(hub, name, 'low').code, 0);
  assert.equal(approve(hub, name).code, 0);          // G1, then design auto-approves, then build to G3
  return approve(hub, name);                          // G3, then retrospective, G4 (auto at low), archive and merge
}
