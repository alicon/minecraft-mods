'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { waitForSavedShutdown, assertRestartIdentity } = require('./saved-client-restart');

test('saved log alone cannot allow launch while the original process remains alive', async () => {
  let clock = 0;
  await assert.rejects(waitForSavedShutdown({ readFreshLog: () => 'All dimensions are saved', isAlive: () => true,
    now: () => clock, sleep: async ms => { clock += ms; }, timeoutMs: 1000 }), /refusing to launch/);
});

test('process exit alone cannot allow launch without fresh save completion', async () => {
  let clock = 0;
  await assert.rejects(waitForSavedShutdown({ readFreshLog: () => 'Stopping server', isAlive: () => false,
    now: () => clock, sleep: async ms => { clock += ms; }, timeoutMs: 1000 }), /refusing to launch/);
});

test('shutdown waits for both independent native facts and keeps the save evidence', async () => {
  let clock = 0;
  const result = await waitForSavedShutdown({ readFreshLog: () => clock >= 250 ? 'Stopping server\nAll dimensions are saved' : '',
    isAlive: () => clock < 750, now: () => clock, sleep: async ms => { clock += ms; }, timeoutMs: 1000 });
  assert.equal(clock, 750);
  assert.equal(result.saveCompleted, true);
  assert.equal(result.processExited, true);
  assert.deepEqual(result.saveLogLines, ['Stopping server', 'All dimensions are saved']);
});

test('a matching save name in a different profile or with different jars is rejected', () => {
  const original = { savePath: '/profiles/Dad/saves/Codex Test' };
  const jars = { 'mushroom.jar': 'original', 'bridge.jar': 'bridge' };
  assertRestartIdentity(original, original, jars, jars);
  assert.throws(() => assertRestartIdentity(original, { savePath: '/profiles/Other/saves/Codex Test' }, jars, jars), /profile\/save path/);
  assert.throws(() => assertRestartIdentity(original, original, jars, { ...jars, 'mushroom.jar': 'changed' }), /jars changed/);
});
