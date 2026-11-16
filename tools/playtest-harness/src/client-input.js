'use strict';

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { assertInspectionWorld } = require('./yorkie-post-run');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const DIRECTIONS = ['forward', 'backward', 'left', 'right'];

function distance(a, b) {
  for (const point of [a, b]) assert(point && ['x', 'y', 'z'].every(k => Number.isFinite(point[k])), 'Input movement position is missing');
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

// Caller owns the shared bridge lock. Acceptance is never a movement verdict.
async function driveClientInput(context, controls, { timeoutMs = 20000, pollMs = 50, onReceipt = () => {}, signal } = {}) {
  const { request, state, expectedSave, playerUuid } = context;
  const before = await state();
  assertInspectionWorld(before, context);
  assert(before.worldFrozen === false, 'Native client input requires an unfrozen world');
  assert(typeof before.overworldGameTime === 'string' && /^-?\d+$/.test(before.overworldGameTime), 'Native server world clock is unavailable');
  assert(['walk', 'boat'].includes(controls.mode), 'Input mode must be walk or boat');
  assert(Number.isInteger(controls.ticks) && controls.ticks >= 1 && controls.ticks <= 100, 'Invalid native input duration');
  assert(Object.keys(controls).every(k => ['mode', 'ticks', 'vehicleUuid', ...DIRECTIONS].includes(k)), 'Unknown native input control');
  for (const key of DIRECTIONS) assert(controls[key] === undefined || typeof controls[key] === 'boolean', 'Input flags must be Boolean');
  const body = { action: 'start', expectedSave, playerUuid, operationId: randomUUID(), ...controls };
  for (const key of DIRECTIONS) body[key] ??= false;
  assert(!(body.forward && body.backward || body.left && body.right), 'Opposing native input directions are unsupported');
  const vehicle = snapshot => snapshot.players[0].nearbyEntities.find(e => e.uuid === controls.vehicleUuid);
  if (controls.mode === 'boat') {
    const original = vehicle(before);
    assert(original && before.players[0].vehicle?.id === original.id, 'Input fixture is not driving its expected vehicle');
  } else assert(!before.players[0].vehicle && controls.vehicleUuid === undefined, 'Walking input requires a player on foot');
  const observed = { request: body, before, receipts: [] };
  let finished = false, attemptedStart = false;
  function checkInterrupted() {
    if (signal?.aborted) throw new Error('Native client input interrupted');
  }
  async function call(action) {
    const reply = await request('/client-input', action === 'start' ? body : { action, expectedSave, playerUuid, operationId: body.operationId });
    assert(observed.receipts.length < 1000, 'Native input receipt limit exceeded');
    observed.receipts.push(reply);
    assert(reply.operationId === body.operationId && ['active', 'releasing', 'complete'].includes(reply.phase), 'Input receipt has the wrong operation');
    assert(reply.request?.playerUuid === playerUuid && reply.request?.expectedSave === expectedSave, 'Input receipt has the wrong identity');
    assert(['mode', 'ticks', ...DIRECTIONS].every(k => reply.request[k] === body[k])
      && reply.request.vehicleUuid === body.vehicleUuid, 'Input receipt describes different controls');
    await onReceipt(observed);
    return reply;
  }
  try {
    const deadline = performance.now() + timeoutMs;
    checkInterrupted();
    attemptedStart = true;
    let reply = await call('start');
    checkInterrupted();
    while (reply.phase !== 'complete') {
      assert(performance.now() < deadline, 'Native client input did not finish within its bounded wait');
      await sleep(pollMs);
      reply = await call('status');
      checkInterrupted();
    }
    assert(reply.outcome === 'completed' && reply.controlsReleased === true, `Native input ended as ${reply.outcome}`);
    assert(reply.appliedClientTicks === controls.ticks, 'Native input tick count differs from the request');
    const frames = reply.clientFrames;
    assert(Array.isArray(frames) && frames.length >= controls.ticks && frames.length <= controls.ticks + 6, 'Native input trace has an invalid bound');
    const matching = frames.filter(frame => DIRECTIONS.every(k => frame.nativeInput?.[k] === body[k]));
    assert(matching.length >= controls.ticks, 'Requested controls were not observed in native client input');
    assert(DIRECTIONS.every(k => frames.at(-1).nativeInput?.[k] === false), 'The final native input sample is not neutral');
    const after = await state();
    assertInspectionWorld(after, context);
    observed.after = after;
    assert(after.worldFrozen === false, 'World froze during native input');
    observed.serverTicksElapsed = (BigInt(after.overworldGameTime) - BigInt(before.overworldGameTime)).toString();
    assert(BigInt(observed.serverTicksElapsed) > 0n, 'Client input completed without native server-world progress');
    observed.playerDisplacement = distance(before.players[0].position, after.players[0].position);
    if (controls.mode === 'boat') {
      assert(after.players[0].vehicle?.id === vehicle(after)?.id && vehicle(after)?.uuid === controls.vehicleUuid, 'Input lost its original vehicle driver');
      observed.vehicleDisplacement = distance(vehicle(before).position, vehicle(after).position);
    }
    finished = true;
    return observed;
  } catch (error) {
    error.observed = observed;
    throw error;
  } finally {
    if (attemptedStart && !finished) {
      try {
        let reply = await call('cancel');
        const deadline = performance.now() + 2000;
        while (reply.phase !== 'complete' && performance.now() < deadline) {
          await sleep(pollMs);
          reply = await call('status');
        }
        assert(reply.controlsReleased === true, 'Native input cleanup was not confirmed');
        observed.cleanup = reply;
      } catch (error) { observed.cleanupError = error.message; }
    }
  }
}

module.exports = { driveClientInput };
