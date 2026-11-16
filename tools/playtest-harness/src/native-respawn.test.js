'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { respawnNativeOwner } = require('./native-respawn');
const { assertLivingTestOwner } = require('./yorkie-world');

const expectedSave = 'Codex Respawn Test', playerUuid = '11111111-1111-1111-1111-111111111111';
const snapshot = (health = 0) => ({ saveName: expectedSave, singleplayer: true, hardcore: false,
  players: [{ uuid: playerUuid, health, abilities: { spectator: false }, dimension: 'ResourceKey[minecraft:dimension / minecraft:overworld]' }] });
function fixture(frames) {
  const calls = []; let index = 0;
  return { calls, expectedSave, playerUuid, state: async () => frames[Math.min(index++, frames.length - 1)],
    request: async (route, body) => { calls.push({ route, body }); return { ok: true, accepted: true, ...body }; } };
}
test('acknowledgement alone is not respawn proof; wait for the original owner alive', async () => {
  const context = fixture([snapshot(), snapshot(), snapshot(20)]);
  const result = await respawnNativeOwner(context, { pollMs: 0 });
  assert.equal(context.calls.length, 1);
  assert.equal(result.snapshots.length, 2);
  assert.equal(result.after.players[0].health, 20);
});
test('an accepted respawn that stays dead times out without another request', async () => {
  const context = fixture([snapshot()]);
  await assert.rejects(respawnNativeOwner(context, { timeoutMs: 1, pollMs: 1 }), /not confirmed alive/);
  assert.equal(context.calls.length, 1);
});
for (const fault of ['alive', 'unknown-health', 'wrong-player', 'wrong-save', 'family-save', 'multiplayer', 'hardcore', 'unknown-hardcore']) {
  test(`refuse ${fault} before a native request`, async () => {
    const s = snapshot();
    if (fault === 'alive') s.players[0].health = 20;
    if (fault === 'unknown-health') delete s.players[0].health;
    if (fault === 'wrong-player') s.players[0].uuid = 'another';
    if (fault === 'wrong-save') s.saveName = 'Codex Other';
    if (fault === 'family-save') s.saveName = 'Family';
    if (fault === 'multiplayer') s.singleplayer = false;
    if (fault === 'hardcore') s.hardcore = true;
    if (fault === 'unknown-hardcore') delete s.hardcore;
    const context = fixture([s]); if (fault === 'family-save') context.expectedSave = s.saveName;
    await assert.rejects(respawnNativeOwner(context)); assert.equal(context.calls.length, 0);
  });
}
for (const fault of ['player', 'save', 'dimension', 'ack', 'spectator']) {
  test(`retain observed ${fault} change and refuse success`, async () => {
    const after = snapshot(20), context = fixture([snapshot(), after]);
    if (fault === 'player') after.players[0].uuid = 'changed';
    if (fault === 'save') after.saveName = 'Codex Changed';
    if (fault === 'dimension') after.players[0].dimension = 'minecraft:the_nether';
    if (fault === 'spectator') after.players[0].abilities.spectator = true;
    if (fault === 'ack') context.request = async () => ({ ok: true, accepted: true, expectedSave, playerUuid: 'changed' });
    await assert.rejects(respawnNativeOwner(context), error => {
      assert.equal(error.observed.attempted, true);
      if (fault !== 'ack') assert.equal(error.observed.snapshots[0], after);
      return true;
    });
  });
}
test('matrix preflight rejects a dead owner while leaving read-only snapshots usable', () => {
  assert.throws(() => assertLivingTestOwner(snapshot(), expectedSave), /explicit native respawn/);
  assertLivingTestOwner(snapshot(20), expectedSave);
});
