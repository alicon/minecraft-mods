'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { selectionFor } = require('./yorkie-matrix-selection');

const cases = [
  { name: 'sleep-hungry', inputs: { time: 'night', flying: false, hungry: true } },
  { name: 'sleep-fed', inputs: { time: 'night', flying: false, hungry: false } },
  { name: 'flight', inputs: { time: 'day', flying: true, hungry: false } },
  { name: 'walk', inputs: { time: 'day', flying: false, hungry: false } },
];

test('a case budget is replayable with the same seed and preserves the input catalog', () => {
  assert.equal(selectionFor(cases, {}).cases, cases);
  const order = selectionFor(cases, { seed: '119', limit: '2' }).plan.order;
  assert.equal(new Set(order).size, 2);
  assert.deepEqual(selectionFor(cases, { seed: '119', limit: '2' }).plan.order, order);
  assert.notDeepEqual(selectionFor(cases, { seed: '120', limit: '2' }).plan.order, order);
  assert.equal(cases[0].name, 'sleep-hungry');
  assert.throws(() => selectionFor(cases, { limit: '0' }), /--limit/);
  assert.throws(() => selectionFor(cases, { seed: true }), /--seed/);
});

test('a prior gameplay finding selects the exact repro and a nearby variant before unrelated actions', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'yorkie-selection-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const priorReport = path.join(directory, 'previous.json');
  fs.writeFileSync(priorReport, JSON.stringify({
    scenario: 'yorkie-matrix',
    cases: [
      { ...cases[0], status: 'failed' },
      { ...cases[2], status: 'setup_failed' },
    ],
  }));
  const selection = selectionFor(cases, { seed: '119', limit: '2', priorReport });
  assert.deepEqual(selection.plan.order, ['sleep-hungry', 'sleep-fed']);
  assert.deepEqual(selection.plan.priorReport.findings, ['sleep-hungry']);
  assert.match(selection.plan.priorReport.sha256, /^[0-9a-f]{64}$/);
});
