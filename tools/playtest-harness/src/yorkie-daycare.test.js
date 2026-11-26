'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { phaseAt, runDaycare } = require('./yorkie-daycare');

test('daycare stops starting fetches at dusk and returns before bedtime', () => {
  for (const [time, expected] of [
    [0, 'walk'], [11499, 'walk'], [11500, 'dusk'], [11999, 'dusk'],
    [12000, 'return'], [13499, 'return'], [13500, 'sleep'], [22999, 'sleep'], [23000, 'walk'],
  ]) {
    assert.equal(phaseAt(time), expected, `daylight tick ${time}`);
  }
});

test('daycare rejects remote bridges and unbounded durations before connecting', async () => {
  await assert.rejects(runDaycare('http://192.0.2.1:57321', {}), /loopback/);
  await assert.rejects(runDaycare('http://127.0.0.1:57321', { seconds: '-1' }), /--seconds/);
  await assert.rejects(runDaycare('http://127.0.0.1:57321', { seconds: 'NaN' }), /--seconds/);
});
