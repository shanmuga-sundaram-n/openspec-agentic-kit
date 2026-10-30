// Start, approve, revise and resume: the stage loop and its gates, through the real CLI with a stub agent.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SKIP, ID, setup, start, approve, state, approvals, runLogs } from '../helpers/scenario.mjs';

test('PIPE001 start writes the intent artifacts and stops at the Proposal gate', { skip: SKIP }, t => {
  const { hub, name } = setup(t);
  const r = start(hub, name);
  assert.equal(r.code, 0, r.out);
  const s = state(hub, name);
  assert.equal(s.status, 'awaiting');
  assert.equal(s.awaiting, 'G1');
  assert.equal(s.stageIndex, 0);
  const dir = path.join(s.workdir, 'openspec/changes', ID);
  assert.ok(fs.existsSync(path.join(dir, 'research.md')));
  assert.ok(fs.existsSync(path.join(dir, 'proposal.md')));
  assert.match(r.out, /Waiting for Proposal approval/);
});

test('PIPE003 state is saved at the gate and resume continues from it without redoing work', { skip: SKIP }, t => {
  const { hub, name } = setup(t);
  start(hub, name);
  const before = fs.readdirSync(hub.path('runs', name, ID)).length;
  const r = hub.run(['resume', ID, '--repo', name]);
  assert.equal(r.code, 0, r.out);
  assert.equal(state(hub, name).awaiting, 'G1');
  assert.equal(fs.readdirSync(hub.path('runs', name, ID)).length, before, 'no agent should run again');
});

test('GATE007 approving continues to the Design gate and every decision is in approvals.md', { skip: SKIP }, t => {
  const { hub, name } = setup(t);
  start(hub, name);
  const r = approve(hub, name, '--note', 'go ahead');
  assert.equal(r.code, 0, r.out);
  const s = state(hub, name);
  assert.equal(s.awaiting, 'G2');
  assert.equal(s.stageIndex, 1);
  const rows = approvals(hub, name).split('\n').filter(l => l.startsWith('| 20'));
  assert.equal(rows.length, 1);
  assert.match(rows[0], /G1 Proposal approval \| approved \| Test Author <author@example\.com> \| medium \| go ahead/);
});

test('GATE005 a revision re-runs the stage and its prompt carries the feedback', { skip: SKIP }, t => {
  const { hub, name } = setup(t);
  start(hub, name);
  const r = hub.run(['revise', ID, '--repo', name, 'narrow the scope to one endpoint']);
  assert.equal(r.code, 0, r.out);
  const prompts = runLogs(hub, name, 'proposal-rev').map(l => l.prompt);
  assert.equal(prompts.length, 1);
  assert.match(prompts[0], /REVISION REQUESTED at gate Proposal approval/);
  assert.match(prompts[0], /narrow the scope to one endpoint/);
  assert.equal(state(hub, name).awaiting, 'G1');
  assert.equal(state(hub, name).revision, null);
});

test('GATE006 an approval note reaches later agents as a human decision', { skip: SKIP }, t => {
  const { hub, name } = setup(t);
  start(hub, name);
  approve(hub, name, '--note', 'Use Postgres, not SQLite');
  const prompt = runLogs(hub, name, 'design')[0].prompt;
  assert.match(prompt, /Decisions recorded by human approvers/);
  assert.match(prompt, /\[Proposal approval\] Use Postgres, not SQLite/);
});

test('PIPE005 an artifact that fails twice marks the change failed, and resume completes it', { skip: SKIP }, t => {
  const { hub, name } = setup(t);
  start(hub, name);
  hub.scenario = { risk: 'medium', failTimes: { design: 2 } };
  const first = approve(hub, name);
  assert.notEqual(first.code, 0);
  assert.match(first.out, /could not produce "design"/);
  let s = state(hub, name);
  assert.equal(s.status, 'failed');
  assert.match(s.error, /could not produce "design"/);

  const second = hub.run(['resume', ID, '--repo', name]);
  assert.equal(second.code, 0, second.out);
  s = state(hub, name);
  assert.equal(s.status, 'awaiting');
  assert.equal(s.awaiting, 'G2');
  assert.equal(s.error, null);
});

test('PIPE005 an agent that exits cleanly without writing the file is retried once, then fails', { skip: SKIP }, t => {
  const { hub, name } = setup(t);
  start(hub, name);
  hub.scenario = { risk: 'medium', skip: ['design'] };
  const r = approve(hub, name);
  assert.notEqual(r.code, 0);
  assert.match(r.out, /design: file not written/);
  assert.equal(runLogs(hub, name, 'design').length, 2);
});
