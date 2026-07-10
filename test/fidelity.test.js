import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateVote } from '../api/fidelity.js';

const good = { name: 'Bo', answers: [{ id: 'p1abc', correctReal: true, fit: 'same' }, { id: 'p2', correctReal: false, fit: 'different' }] };

test('validateVote accepts a well-formed submission', () => {
  assert.equal(validateVote(good), true);
});

test('validateVote rejects malformed submissions', () => {
  assert.equal(validateVote(null), false);
  assert.equal(validateVote({}), false);
  assert.equal(validateVote({ answers: [] }), false);                                                        // empty
  assert.equal(validateVote({ answers: Array(21).fill(good.answers[0]) }), false);                           // too many
  assert.equal(validateVote({ answers: [{ id: 'p1', correctReal: 'yes', fit: 'same' }] }), false);           // non-bool
  assert.equal(validateVote({ answers: [{ id: 'p1', correctReal: true, fit: 'perfect' }] }), false);         // bad enum
  assert.equal(validateVote({ answers: [{ id: '../etc', correctReal: true, fit: 'same' }] }), false);        // bad id
});
