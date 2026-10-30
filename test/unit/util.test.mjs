import test from 'node:test';
import assert from 'node:assert/strict';
import { slugify } from '../../lib/util.mjs';

test('slugify makes kebab-case and drops stop words', () => {
  assert.equal(slugify('Add a refund window to payouts'), 'add-refund-window-payouts');
});

test('slugify keeps at most six words', () => {
  assert.equal(slugify('one two three four five six seven eight'), 'one-two-three-four-five-six');
});

test('slugify strips punctuation and lowercases', () => {
  assert.equal(slugify('Fix: OAuth (v2) login!!'), 'fix-oauth-v2-login');
});

test('slugify caps the length at 50 characters without a trailing hyphen', () => {
  const out = slugify('internationalization internationalization internationalization');
  assert.ok(out.length <= 50);
  assert.ok(!out.endsWith('-'));
});

test('slugify falls back to a change-<time> id for input with no usable words', () => {
  assert.match(slugify('the of and'), /^change-\d+$/);
  assert.match(slugify('!!!'), /^change-\d+$/);
});
