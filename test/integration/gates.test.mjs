// Characterises gate behaviour through the real CLI. bin/agentic.mjs cannot be imported, so these tests
// pin its current decisions (policy by tier, blockers and override, approvers, revision targets)
// before they are extracted into lib/gates.mjs, and keep guarding them afterwards.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHub, createTargetRepo, openspecMissing } from '../helpers/hub.mjs';

const SKIP = openspecMissing() ?? false;

/** A hub with one repo and a change stopped at the Proposal gate (G1). */
function atG1(t, { risk = 'medium', email, config } = {}) {
  const hub = createHub(t);
  hub.addRepo('demo-repo', createTargetRepo(t, email ? { email } : {}), { config });
  const r = hub.run(['start', 'add a demo thing', '--repo', 'demo-repo', '--id', 'demo-change', '--risk', risk]);
  assert.equal(r.code, 0, r.out);
  assert.equal(hub.state('demo-repo', 'demo-change').awaiting, 'G1');
  return hub;
}
const approve = (hub, ...extra) => hub.run(['approve', 'demo-change', '--repo', 'demo-repo', '--no-run', ...extra]);
const approvals = hub => fs.readFileSync(`${hub.state('demo-repo', 'demo-change').workdir}/openspec/changes/demo-change/approvals.md`, 'utf8');

/** Put a change at the build gate (G3) with the given failing checks, without running the build. */
function atG3(hub, { checks = [], reviewBlocking = [] } = {}) {
  const file = hub.path('state', 'demo-repo', 'demo-change.json');
  const s = JSON.parse(fs.readFileSync(file, 'utf8'));
  Object.assign(s, { stageIndex: 2, status: 'awaiting', awaiting: 'G3', checks, reviewBlocking });
  fs.writeFileSync(file, JSON.stringify(s, null, 2));
}

test('GATE001 a medium-risk change waits for a human at the Proposal gate', { skip: SKIP }, t => {
  const hub = atG1(t, { risk: 'medium' });
  assert.equal(hub.state('demo-repo', 'demo-change').status, 'awaiting');
});

test('GATE001 approving the Proposal gate records the decision in approvals.md', { skip: SKIP }, t => {
  const hub = atG1(t);
  const r = approve(hub, '--note', 'looks fine');
  assert.equal(r.code, 0, r.out);
  assert.match(approvals(hub), /\| G1 Proposal approval \| approved \| Test Author <author@example\.com> \| medium \| looks fine \|/);
  assert.equal(hub.state('demo-repo', 'demo-change').gates.G1.status, 'approved');
});

test('GATE003 approval is refused while a check fails, and the message lists the blocker', { skip: SKIP }, t => {
  const hub = atG1(t);
  atG3(hub, { checks: [{ name: 'tests', ok: false, detail: 'boom' }] });
  const r = approve(hub);
  assert.notEqual(r.code, 0);
  assert.match(r.out, /has blockers:\n\s+check failed: tests/);
  assert.match(r.out, /approve with --override/);
  assert.equal(hub.state('demo-repo', 'demo-change').awaiting, 'G3');
});

test('GATE003 approval is refused while the reviewer has blocking findings', { skip: SKIP }, t => {
  const hub = atG1(t);
  atG3(hub, { reviewBlocking: ['- Null check missing'] });
  const r = approve(hub);
  assert.notEqual(r.code, 0);
  assert.match(r.out, /review: - Null check missing/);
});

test('GATE003 --override approves despite blockers and the record says so', { skip: SKIP }, t => {
  const hub = atG1(t);
  atG3(hub, { checks: [{ name: 'tests', ok: false, detail: 'boom' }] });
  const r = approve(hub, '--override', '--note', 'known flaky');
  assert.equal(r.code, 0, r.out);
  assert.match(approvals(hub), /\| G3 Merge approval \| approved \(override\) \|/);
  assert.equal(hub.state('demo-repo', 'demo-change').gates.G3.status, 'approved');
});

test('GATE004 a git email not on the approver list is refused', { skip: SKIP }, t => {
  const hub = atG1(t, { config: { gates: { G1: { approvers: ['boss@example.com'] } } } });
  const r = approve(hub);
  assert.notEqual(r.code, 0);
  assert.match(r.out, /author@example\.com is not an approver for Proposal approval/);
  assert.equal(hub.state('demo-repo', 'demo-change').awaiting, 'G1');
});

test('GATE004 a listed approver is accepted, whatever the letter case', { skip: SKIP }, t => {
  const hub = atG1(t, { config: { gates: { G1: { approvers: ['AUTHOR@Example.com'] } } } });
  const r = approve(hub);
  assert.equal(r.code, 0, r.out);
  assert.equal(hub.state('demo-repo', 'demo-change').gates.G1.status, 'approved');
});

test('GATE004 an empty approver list lets anyone approve', { skip: SKIP }, t => {
  const hub = atG1(t);
  assert.equal(approve(hub).code, 0);
});

test('GATE005 revise sends the change back to the current stage with feedback and resets the gate', { skip: SKIP }, t => {
  const hub = atG1(t);
  const r = hub.run(['revise', 'demo-change', '--repo', 'demo-repo', 'tighten the scope', '--no-run']);
  assert.equal(r.code, 0, r.out);
  const s = hub.state('demo-repo', 'demo-change');
  assert.equal(s.revision.stage, 'intent');
  assert.equal(s.revision.feedback, 'tighten the scope');
  assert.deepEqual(s.revision.pendingStages, ['intent']);
  assert.equal(s.gates.G1.status, 'pending');
  assert.equal(s.status, 'running');
  assert.match(approvals(hub), /\| revise → intent \|/);
});

test('GATE005 revise to a later stage than the current one is refused', { skip: SKIP }, t => {
  const hub = atG1(t);
  const r = hub.run(['revise', 'demo-change', '--repo', 'demo-repo', 'x', '--stage', 'build', '--no-run']);
  assert.notEqual(r.code, 0);
  assert.match(r.out, /Cannot revise stage "build"; choose the current or an earlier stage/);
});

test('GATE005 revise to an earlier stage resets every gate from there and queues those stages', { skip: SKIP }, t => {
  const hub = atG1(t);
  atG3(hub);
  const file = hub.path('state', 'demo-repo', 'demo-change.json');
  const s0 = JSON.parse(fs.readFileSync(file, 'utf8'));
  s0.gates = { G1: { status: 'approved' }, G2: { status: 'approved' } };
  fs.writeFileSync(file, JSON.stringify(s0));
  const r = hub.run(['revise', 'demo-change', '--repo', 'demo-repo', 'rethink the design', '--stage', 'design', '--no-run']);
  assert.equal(r.code, 0, r.out);
  const s = hub.state('demo-repo', 'demo-change');
  assert.equal(s.stageIndex, 1);
  assert.deepEqual(s.revision.pendingStages, ['design', 'build']);
  assert.equal(s.gates.G1.status, 'approved');
  assert.equal(s.gates.G2.status, 'pending');
  assert.equal(s.gates.G3.status, 'pending');
});

test('GATE005 revise needs feedback and a change that is waiting at a gate', { skip: SKIP }, t => {
  const hub = atG1(t);
  assert.match(hub.run(['revise', 'demo-change', '--repo', 'demo-repo', '--no-run']).out, /Say what should change/);
  approve(hub);
  assert.match(hub.run(['revise', 'demo-change', '--repo', 'demo-repo', 'x', '--no-run']).out, /is not waiting at a gate/);
});

test('GATE001 at low risk the Design gate approves itself and the change runs on to the Merge gate', { skip: SKIP }, t => {
  const hub = atG1(t, { risk: 'low' });
  hub.scenario = { risk: 'low' };
  const r = hub.run(['approve', 'demo-change', '--repo', 'demo-repo']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /Design review: auto-approved \(low risk\)/);
  const s = hub.state('demo-repo', 'demo-change');
  assert.equal(s.gates.G2.status, 'auto');
  assert.equal(s.awaiting, 'G3');
  assert.match(approvals(hub), /\| G2 Design review \| auto-approved \| agentic runner \| low \| policy: low risk \|/);
});

test('GATE001 at medium risk the Design gate waits for a human', { skip: SKIP }, t => {
  const hub = atG1(t, { risk: 'medium' });
  const r = hub.run(['approve', 'demo-change', '--repo', 'demo-repo']);
  assert.equal(r.code, 0, r.out);
  const s = hub.state('demo-repo', 'demo-change');
  assert.equal(s.awaiting, 'G2');
  assert.equal(s.gates.G2, undefined);
});
