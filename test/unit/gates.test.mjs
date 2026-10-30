import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { policyFor, isAutoApproved, isApprover, gateBlockers, revisionTargetIndex } from '../../lib/gates.mjs';

const base = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../config.base.json'), 'utf8'));
const TIERS = ['low', 'medium', 'high'];

test('GATE001 the default policy: G2 and G4 auto-approve at low risk, every other gate and tier needs a human', () => {
  const expected = {
    G1: { low: 'human', medium: 'human', high: 'human' },
    G2: { low: 'auto', medium: 'human', high: 'human' },
    G3: { low: 'human', medium: 'human', high: 'human' },
    G4: { low: 'auto', medium: 'human', high: 'human' },
  };
  for (const [gate, row] of Object.entries(expected)) {
    for (const tier of TIERS) assert.equal(policyFor(base.gates[gate], tier), row[tier], `${gate} at ${tier}`);
  }
});

test('GATE001 a tier with no configured policy needs a human', () => {
  assert.equal(policyFor({ policy: { low: 'auto' } }, 'high'), 'human');
  assert.equal(policyFor({}, 'low'), 'human');
});

test('GATE001 auto approves only when nothing is blocking', () => {
  assert.equal(isAutoApproved('auto', []), true);
  assert.equal(isAutoApproved('auto', ['check failed: tests']), false);
  assert.equal(isAutoApproved('human', []), false);
  assert.equal(isAutoApproved('human', ['x']), false);
});

test('GATE003 blockers are failed checks and blocking review findings, only at stages that run them', () => {
  const state = { checks: [{ name: 'tests', ok: false }, { name: 'lint', ok: true }], reviewBlocking: ['- Null check'] };
  assert.deepEqual(gateBlockers(state, { checks: true, review: true }), ['check failed: tests', 'review: - Null check']);
  assert.deepEqual(gateBlockers(state, { checks: true }), ['check failed: tests']);
  assert.deepEqual(gateBlockers(state, { review: true }), ['review: - Null check']);
  assert.deepEqual(gateBlockers(state, {}), []);
});

test('GATE003 missing check and review lists mean no blockers', () => {
  assert.deepEqual(gateBlockers({}, { checks: true, review: true }), []);
});

test('GATE003 the real stages: only build runs checks and review, so other gates never have blockers', () => {
  const state = { checks: [{ name: 'tests', ok: false }], reviewBlocking: ['- x'] };
  for (const stage of base.stages) {
    const blockers = gateBlockers(state, stage);
    assert.equal(blockers.length > 0, Boolean(stage.checks || stage.review), stage.id);
  }
});

test('GATE004 an empty or missing approver list lets anyone approve, even with no email', () => {
  assert.equal(isApprover([], 'a@x.com'), true);
  assert.equal(isApprover(undefined, ''), true);
  assert.equal(isApprover(null, undefined), true);
});

test('GATE004 only a listed email approves, ignoring letter case', () => {
  assert.equal(isApprover(['Boss@X.com'], 'boss@x.com'), true);
  assert.equal(isApprover(['boss@x.com'], 'BOSS@X.COM'), true);
  assert.equal(isApprover(['boss@x.com'], 'other@x.com'), false);
});

test('GATE004 with a list, a missing or empty git email is refused', () => {
  assert.equal(isApprover(['boss@x.com'], ''), false);
  assert.equal(isApprover(['boss@x.com'], undefined), false);
});

test('GATE005 revision target defaults to the current stage', () => {
  assert.equal(revisionTargetIndex(base.stages, 2, 'build', undefined), 2);
});

test('GATE005 revision target may be an earlier stage', () => {
  assert.equal(revisionTargetIndex(base.stages, 2, 'build', 'intent'), 0);
  assert.equal(revisionTargetIndex(base.stages, 2, 'build', 'design'), 1);
});

test('GATE005 revision target cannot be a later stage or an unknown one', () => {
  assert.throws(() => revisionTargetIndex(base.stages, 1, 'design', 'build'), /Cannot revise stage "build"; choose the current or an earlier stage/);
  assert.throws(() => revisionTargetIndex(base.stages, 1, 'design', 'nope'), /Cannot revise stage "nope"/);
});
