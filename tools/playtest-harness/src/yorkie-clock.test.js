'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { GAME_TIME_MODULUS, elapsedWorldTicks, advanceWorldTicks } = require('./yorkie-clock');

test('frozen stepping waits for world progress even when the server counter has advanced', async () => {
  const clocks = [100, 100, 100, 101];
  const commands = []; let stateReads = 0;
  const command = async text => { commands.push(text); return { success: true, result: text === 'time query gametime' ? clocks.shift() : 1 }; };
  const snapshot = await advanceWorldTicks(command, async () => { stateReads++; return { tickCount: 99999 }; }, 1, 'step', { pollIntervalMs: 0 });
  assert.equal(stateReads, 1);
  assert.equal(commands.filter(c => c === 'time query gametime').length, 4);
  assert.equal(commands.filter(c => c === 'tick step 1t').length, 1);
  assert.equal(snapshot.tickAudit.elapsedTicks, 1);
});

test('native clock wrap and a stalled frozen world cannot produce a false completed step', async () => {
  assert.equal(elapsedWorldTicks(GAME_TIME_MODULUS - 1, 1), 2);
  await assert.rejects(advanceWorldTicks(async text => ({ success: true, result: text.startsWith('time') ? 5 : 1 }),
    async () => { throw Error('Should not read completion state'); }, 1, 'step', { timeoutMs: 1, pollIntervalMs: 0 }), /did not complete/);
});

test('invalid or rejected clock evidence stops before issuing a tick mutation', async () => {
  for (const result of [{ success: false, result: 3 }, { success: true, result: NaN }, { success: true, result: -1 }]) {
    const commands = [];
    await assert.rejects(advanceWorldTicks(async text => { commands.push(text); return result; }, async () => ({}), 1, 'step'));
    assert.deepEqual(commands, ['time query gametime']);
  }
});

test('rejected tick commands cannot be passed by an otherwise advancing world', async () => {
  let queries = 0;
  await assert.rejects(advanceWorldTicks(async text => text.startsWith('time')
    ? { success: true, result: ++queries } : { success: false, result: 0 },
  async () => { throw Error('Must not read completion state'); }, 1, 'step'), /tick request failed/);
  assert.equal(queries, 1);
});
