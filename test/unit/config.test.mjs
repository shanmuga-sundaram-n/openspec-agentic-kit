import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeConfig } from '../../lib/hub.mjs';

test('REG002 later layers win for scalars', () => {
  assert.deepEqual(mergeConfig({ a: 1 }, { a: 2 }, { a: 3 }), { a: 3 });
});

test('REG002 objects merge key by key', () => {
  const out = mergeConfig(
    { roles: { implementer: { model: 'opus', maxTurns: 10 } } },
    { roles: { implementer: { model: 'sonnet' } } },
  );
  assert.deepEqual(out, { roles: { implementer: { model: 'sonnet', maxTurns: 10 } } });
});

test('REG002 arrays are replaced, not concatenated', () => {
  const out = mergeConfig({ extraChecks: [{ name: 'lint' }, { name: 'types' }] }, { extraChecks: [{ name: 'e2e' }] });
  assert.deepEqual(out.extraChecks, [{ name: 'e2e' }]);
});

test('REG002 an object replaces a scalar and a scalar replaces an object', () => {
  assert.deepEqual(mergeConfig({ a: 1 }, { a: { b: 2 } }), { a: { b: 2 } });
  assert.deepEqual(mergeConfig({ a: { b: 2 } }, { a: 1 }), { a: 1 });
});

test('REG002 empty, null and undefined layers are ignored', () => {
  assert.deepEqual(mergeConfig({ a: 1 }, undefined, null, {}), { a: 1 });
  assert.deepEqual(mergeConfig(), {});
});

test('REG002 merging does not mutate its inputs', () => {
  const base = { roles: { x: { model: 'opus' } } };
  const snapshot = JSON.stringify(base);
  mergeConfig(base, { roles: { x: { model: 'sonnet' } } });
  assert.equal(JSON.stringify(base), snapshot);
});
