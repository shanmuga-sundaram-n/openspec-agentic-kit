import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseProposals, harvest, decide, applyAccepted, loadLessons } from '../../lib/lessons.mjs';
import { mkTmp, rm, writeTree } from '../helpers/tmp.mjs';

const retro = block => `# Retrospective\n\nText.\n\n\`\`\`json lessons\n${block}\n\`\`\`\n`;

function repoWith(t, lessons) {
  const dir = mkTmp();
  t.after(() => rm(dir));
  if (lessons) fs.writeFileSync(path.join(dir, 'lessons.json'), JSON.stringify(lessons));
  return { name: 'demo', dir };
}

const YAML = `schema: agentic-sdlc

context: |
  Product: demo
  Testing: jest

rules:
  proposal:
    - Declare a risk tier
  specs:
    - Use stable IDs
`;

test('LSN001 parseProposals reads rules per artifact and context facts', () => {
  const out = parseProposals(retro('{"rules":{"specs":["Add a negative scenario"],"tasks":["List files per task"]},"context":["Money is stored in cents"]}'));
  assert.deepEqual(out, [
    { kind: 'rule', artifact: 'specs', text: 'Add a negative scenario' },
    { kind: 'rule', artifact: 'tasks', text: 'List files per task' },
    { kind: 'context', text: 'Money is stored in cents' },
  ]);
});

test('LSN001 parseProposals ignores unknown artifacts, blanks and collapses whitespace', () => {
  const out = parseProposals(retro('{"rules":{"verification":["x"],"design":["  two   spaces\\n here ", ""]}}'));
  assert.deepEqual(out, [{ kind: 'rule', artifact: 'design', text: 'two spaces here' }]);
});

test('LSN001 parseProposals returns nothing for a missing block or invalid JSON', () => {
  assert.deepEqual(parseProposals('# Retro\nno block'), []);
  assert.deepEqual(parseProposals(retro('{not json')), []);
});

test('LSN001 harvest queues new proposals as pending and skips duplicates', t => {
  const repo = repoWith(t);
  writeTree(repo.dir, { 'retro.md': retro('{"rules":{"specs":["A"]},"context":["B"]}') });
  const file = path.join(repo.dir, 'retro.md');
  assert.equal(harvest(repo, 'chg-1', file), 2);
  assert.equal(harvest(repo, 'chg-2', file), 0);
  const lessons = loadLessons(repo);
  assert.deepEqual(lessons.map(l => [l.id, l.status, l.change]), [[1, 'pending', 'chg-1'], [2, 'pending', 'chg-1']]);
});

test('LSN001 harvest returns 0 when the retrospective is missing', t => {
  const repo = repoWith(t);
  assert.equal(harvest(repo, 'chg-1', path.join(repo.dir, 'nope.md')), 0);
});

test('LSN002 decide accepts one pending lesson by id', t => {
  const repo = repoWith(t, [{ id: 1, status: 'pending' }, { id: 2, status: 'pending' }]);
  decide(repo, '2', 'accepted');
  assert.deepEqual(loadLessons(repo).map(l => l.status), ['pending', 'accepted']);
});

test('LSN002 decide all rejects every pending lesson and leaves decided ones alone', t => {
  const repo = repoWith(t, [{ id: 1, status: 'accepted' }, { id: 2, status: 'pending' }, { id: 3, status: 'pending' }]);
  const hit = decide(repo, 'all', 'rejected');
  assert.equal(hit.length, 2);
  assert.deepEqual(loadLessons(repo).map(l => l.status), ['accepted', 'rejected', 'rejected']);
});

test('LSN002 decide fails when there is no matching pending lesson', t => {
  const repo = repoWith(t, [{ id: 1, status: 'accepted' }]);
  assert.throws(() => decide(repo, '1', 'rejected'), /No pending lesson "1"/);
});

test('LSN003 applyAccepted leaves the yaml alone when nothing is accepted', t => {
  const repo = repoWith(t, [{ id: 1, kind: 'rule', artifact: 'specs', text: 'x', status: 'pending' }]);
  assert.equal(applyAccepted(YAML, repo), YAML);
});

test('LSN003 applyAccepted appends a rule to an existing artifact key', t => {
  const repo = repoWith(t, [{ id: 1, kind: 'rule', artifact: 'specs', text: 'Add a negative scenario', status: 'accepted' }]);
  const out = applyAccepted(YAML, repo);
  assert.match(out, /  specs:\n    - Use stable IDs\n    - "Add a negative scenario"\n/);
});

test('LSN003 applyAccepted creates the artifact key when it is new', t => {
  const repo = repoWith(t, [{ id: 1, kind: 'rule', artifact: 'tasks', text: 'List files', status: 'accepted' }]);
  const out = applyAccepted(YAML, repo);
  assert.match(out, /  tasks:\n    - "List files"\n/);
  assert.ok(out.indexOf('  tasks:') > out.indexOf('  specs:'));
});

test('LSN003 applyAccepted adds context facts under the context block', t => {
  const repo = repoWith(t, [{ id: 1, kind: 'context', text: 'Money is stored in cents', status: 'accepted' }]);
  const out = applyAccepted(YAML, repo);
  assert.match(out, /  Testing: jest\n  Learned from past changes:\n  - Money is stored in cents\n/);
});

test('LSN003 applyAccepted escapes quotes in rule text', t => {
  const repo = repoWith(t, [{ id: 1, kind: 'rule', artifact: 'specs', text: 'Say "no" to magic numbers', status: 'accepted' }]);
  assert.match(applyAccepted(YAML, repo), /- "Say \\"no\\" to magic numbers"/);
});
