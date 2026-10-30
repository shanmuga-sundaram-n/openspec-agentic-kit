import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { parseDeltaSpecs, specTrace, riskTier, reviewBlocking } from '../../lib/checks.mjs';
import { mkTmp, rm, writeTree } from '../helpers/tmp.mjs';

const SPEC = `# Spec Delta

## ADDED Requirements

### Requirement: PAY-012 Refund window
The system SHALL refuse refunds after 30 days.

#### Scenario: Inside the window
- **WHEN** a refund is requested on day 10
- **THEN** it is accepted

#### Scenario: Outside the window
- **WHEN** a refund is requested on day 31
- **THEN** it is refused

## MODIFIED Requirements

### Requirement: PAY-003 Receipts
Receipts SHALL list the refund.

#### Scenario: Receipt shows refund
- **WHEN** a refund completes
- **THEN** the receipt lists it

## REMOVED Requirements

### Requirement: PAY-001 Legacy export
**Reason**: gone
`;

function setup(t, extra = {}) {
  const cwd = mkTmp();
  t.after(() => rm(cwd));
  writeTree(cwd, { 'openspec/changes/c1/specs/payments/spec.md': SPEC, ...extra });
  return cwd;
}

test('BLD004 parses ADDED and MODIFIED requirement ids with their scenarios', t => {
  const cwd = setup(t);
  const { reqs, problems } = parseDeltaSpecs(path.join(cwd, 'openspec/changes/c1'));
  assert.deepEqual(problems, []);
  assert.deepEqual(reqs.map(r => [r.id, r.scenarios.length]), [['PAY-012', 2], ['PAY-003', 1]]);
});

test('BLD004 ignores REMOVED requirements', t => {
  const cwd = setup(t);
  const { reqs } = parseDeltaSpecs(path.join(cwd, 'openspec/changes/c1'));
  assert.ok(!reqs.some(r => r.id === 'PAY-001'));
});

test('BLD004 reports a requirement without an id', t => {
  const cwd = mkTmp();
  t.after(() => rm(cwd));
  writeTree(cwd, { 'openspec/changes/c1/specs/a/spec.md': '## ADDED Requirements\n\n### Requirement: No id here\nText.\n' });
  const { problems } = parseDeltaSpecs(path.join(cwd, 'openspec/changes/c1'));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /without an ID/);
});

test('BLD004 trace passes when each requirement has a test reference per scenario', t => {
  const cwd = setup(t, {
    'test/pay.test.js': "test('PAY012 inside the window', () => {});\ntest('PAY012 outside the window', () => {});\ntest('PAY003 receipt', () => {});\n",
  });
  const r = specTrace(cwd, 'c1', { testPaths: ['test'] });
  assert.equal(r.ok, true, r.detail);
});

test('BLD004 trace fails and names a requirement with too few test references', t => {
  const cwd = setup(t, { 'test/pay.test.js': "test('PAY012 inside the window', () => {});\ntest('PAY003 receipt', () => {});\n" });
  const r = specTrace(cwd, 'c1', { testPaths: ['test'] });
  assert.equal(r.ok, false);
  assert.match(r.detail, /PAY-012: 1 test reference\(s\) for 2 scenario\(s\)/);
});

test('BLD004 trace accepts the id with a hyphen, underscore or space', t => {
  const cwd = setup(t, { 'test/pay.test.js': "// PAY-012\n// PAY_012\n// PAY 003\n" });
  const r = specTrace(cwd, 'c1', { testPaths: ['test'] });
  assert.equal(r.ok, true, r.detail);
});

test('BLD004 trace only scans files matching the test file pattern', t => {
  const cwd = setup(t, { 'test/helper.js': "PAY012 PAY012 PAY003\n" });
  const r = specTrace(cwd, 'c1', { testPaths: ['test'] });
  assert.equal(r.ok, false);
});

test('BLD004 trace requires scenarios to appear in test-plan.md when asked', t => {
  const cwd = setup(t, {
    'test/pay.test.js': "PAY012 PAY012 PAY003\n",
    'openspec/changes/c1/test-plan.md': 'Inside the window\nReceipt shows refund\n',
  });
  const r = specTrace(cwd, 'c1', { testPaths: ['test'], requireTestPlanMention: true });
  assert.equal(r.ok, false);
  assert.match(r.detail, /not in test-plan\.md: "Outside the window"/);
});

test('BLD004 trace fails when the change has no requirements at all', t => {
  const cwd = mkTmp();
  t.after(() => rm(cwd));
  writeTree(cwd, { 'openspec/changes/c1/proposal.md': 'x' });
  const r = specTrace(cwd, 'c1', { testPaths: ['test'] });
  assert.equal(r.ok, false);
  assert.match(r.detail, /No ADDED or MODIFIED requirements/);
});

test('GATE002 riskTier reads the tier line in any common formatting', t => {
  const cwd = mkTmp();
  t.after(() => rm(cwd));
  const tier = body => {
    writeTree(cwd, { 'openspec/changes/c1/proposal.md': body });
    return riskTier(cwd, 'c1');
  };
  assert.equal(tier('## Risk\nRisk tier: low\nbecause'), 'low');
  assert.equal(tier('Risk tier: **High** (money)'), 'high');
  assert.equal(tier('Risk tier:medium'), 'medium');
});

test('GATE002 riskTier returns null for a missing line, an unknown tier or a missing file', t => {
  const cwd = mkTmp();
  t.after(() => rm(cwd));
  assert.equal(riskTier(cwd, 'c1'), null);
  writeTree(cwd, { 'openspec/changes/c1/proposal.md': 'No tier here' });
  assert.equal(riskTier(cwd, 'c1'), null);
  writeTree(cwd, { 'openspec/changes/c1/proposal.md': 'Risk tier: critical' });
  assert.equal(riskTier(cwd, 'c1'), null);
});

test('BLD006 reviewBlocking lists bullets under the Blocking heading only', t => {
  const cwd = mkTmp();
  t.after(() => rm(cwd));
  const file = path.join(cwd, 'review.md');
  writeTree(cwd, { 'review.md': '## Blocking\n- Null deref in refund.js\n* Missing auth check\n\n## Should fix\n- Rename a variable\n' });
  assert.deepEqual(reviewBlocking(file), ['- Null deref in refund.js', '* Missing auth check']);
});

test('BLD006 reviewBlocking treats "none" and a missing section as no blockers', t => {
  const cwd = mkTmp();
  t.after(() => rm(cwd));
  const file = path.join(cwd, 'review.md');
  writeTree(cwd, { 'review.md': '## Blocking\n- None\n\n## Nits\n- x\n' });
  assert.deepEqual(reviewBlocking(file), []);
  writeTree(cwd, { 'review.md': '## Nits\n- x\n' });
  assert.deepEqual(reviewBlocking(file), []);
});

test('BLD006 reviewBlocking returns null when review.md does not exist', t => {
  const cwd = mkTmp();
  t.after(() => rm(cwd));
  assert.equal(reviewBlocking(path.join(cwd, 'review.md')), null);
});
