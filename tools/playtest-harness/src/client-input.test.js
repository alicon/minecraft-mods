'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { driveClientInput } = require('./client-input');
const PLAYER = '494f67d1-2009-4c26-bfcb-c41a89adaf80';

function fixture({ lostStart = false, unchangedWorld = false, wrongNativeInput = false, neverFinishes = false, frozen = false, wrongReceipt = false, cachedInput = false } = {}) {
  let reads = 0, body;
  const calls = [];
  function state() {
    const after = reads++ > 0;
    return { singleplayer: true, saveName: 'Codex Input Test', worldFrozen: frozen,
      overworldGameTime: after && !unchangedWorld ? '23' : '20',
      players: [{ uuid: PLAYER, dimension: 'minecraft:overworld', position: { x: after ? 1 : 0, y: 220, z: 0 }, nearbyEntities: [] }] };
  }
  function receipt(phase, outcome) {
    const active = { forward: !wrongNativeInput, backward: false, left: false, right: false };
    const neutral = { forward: false, backward: false, left: false, right: false };
    return { operationId: body.operationId, request: body, phase, outcome, controlsReleased: phase === 'complete',
      appliedClientTicks: 3, clientFrames: [...Array.from({ length: 3 }, () => ({ nativeInput: active })), { nativeInput: neutral }]
        .map((frame, index) => ({ ...frame, freshKeyboardSample: !cachedInput, clientPlayerTick: 100 + index })) };
  }
  const context = { state: async () => state(), expectedSave: 'Codex Input Test', playerUuid: PLAYER,
    request: async (route, request) => {
      assert.equal(route, '/client-input');calls.push(request);
      if (request.action === 'start') {
        body = request;
        if (lostStart) throw new Error('synthetic lost acceptance reply');
        const reply = receipt('active', 'pending');
        if (wrongReceipt) reply.operationId = 'another-operation';
        return reply;
      }
      if (request.action === 'cancel') return receipt('complete', 'cancelled');
      return neverFinishes ? receipt('active', 'pending') : receipt('complete', 'completed');
    } };
  return { context, calls };
}

test('native input verifies exact client samples, neutral release and separate server progress', async () => {
  const f = fixture();
  const observed = await driveClientInput(f.context, { mode: 'walk', ticks: 3, forward: true }, { pollMs: 0 });
  assert.equal(observed.serverTicksElapsed, '3');
  assert.equal(observed.playerDisplacement, 1);
  assert.deepEqual(f.calls.map(c => c.action), ['start', 'status']);
});

test('lost acceptance still cancels the operation ID chosen before dispatch', async () => {
  const f = fixture({ lostStart: true });
  await assert.rejects(driveClientInput(f.context, { mode: 'walk', ticks: 3, forward: true }), error => {
    assert.match(error.message, /lost acceptance/);
    assert.equal(error.observed.cleanup.outcome, 'cancelled');return true;
  });
  assert.equal(f.calls[0].operationId, f.calls[1].operationId);
  assert.equal(f.calls[1].action, 'cancel');
});

test('client tick receipts cannot hide a frozen server world or unapplied native buttons', async () => {
  for (const options of [{ unchangedWorld: true }, { wrongNativeInput: true }, { cachedInput: true }]) {
    const f = fixture(options);
    await assert.rejects(driveClientInput(f.context, { mode: 'walk', ticks: 3, forward: true }, { pollMs: 0 }));
    assert.equal(f.calls.at(-1).action, 'cancel');
  }
});

test('timeout preserves the failed observations and verifies cancellation', async () => {
  const f = fixture({ neverFinishes: true });
  await assert.rejects(driveClientInput(f.context, { mode: 'walk', ticks: 3, forward: true }, { timeoutMs: 0 }), error => {
    assert.match(error.message, /bounded wait/);assert.equal(error.observed.cleanup.controlsReleased, true);return true;
  });
});

test('an interrupted caller cancels and retains its original failure', async () => {
  const f = fixture();
  const abort = new AbortController();
  await assert.rejects(driveClientInput(f.context, { mode: 'walk', ticks: 3, forward: true }, {
    signal: abort.signal, onReceipt: () => abort.abort()
  }), error => {
    assert.match(error.message, /interrupted/);assert.equal(error.observed.cleanup.outcome, 'cancelled');return true;
  });
});

test('a mismatched receipt is preserved while cleanup still targets the original operation', async () => {
  const f = fixture({ wrongReceipt: true });
  await assert.rejects(driveClientInput(f.context, { mode: 'walk', ticks: 3, forward: true }), error => {
    assert.equal(error.observed.receipts[0].operationId, 'another-operation');
    assert.equal(error.observed.cleanup.operationId, f.calls[0].operationId);return true;
  });
});

test('wrong save, frozen setup, invalid duration and string flags never dispatch movement', async () => {
  for (const controls of [{ mode: 'walk', ticks: 101 }, { mode: 'walk', ticks: 3, forward: 'false' }]) {
    const f = fixture();await assert.rejects(driveClientInput(f.context, controls));assert.equal(f.calls.length, 0);
  }
  const f = fixture();f.context.expectedSave = 'Family Save';
  await assert.rejects(driveClientInput(f.context, { mode: 'walk', ticks: 3 }));assert.equal(f.calls.length, 0);
  const frozen = fixture({ frozen: true });
  await assert.rejects(driveClientInput(frozen.context, { mode: 'walk', ticks: 3 }));assert.equal(frozen.calls.length, 0);
});
