'use strict';

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { assertInspectionWorld } = require('./yorkie-post-run');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const DIRECTIONS = ['forward', 'backward', 'left', 'right'];

function nativeMillis(value) {
  assert(typeof value === 'string' && /^-?\d+$/.test(value), 'Native input timing evidence is unavailable');
  return BigInt(value);
}

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
  assert(['walk', 'boat', 'dismount', 'jump'].includes(controls.mode), 'Input mode must be walk, boat, dismount or jump');
  assert(Number.isInteger(controls.ticks) && controls.ticks >= 1 && controls.ticks <= 100, 'Invalid native input duration');
  assert(Object.keys(controls).every(k => ['mode', 'ticks', 'vehicleUuid', ...DIRECTIONS].includes(k)), 'Unknown native input control');
  for (const key of DIRECTIONS) assert(controls[key] === undefined || typeof controls[key] === 'boolean', 'Input flags must be Boolean');
  const body = { action: 'start', expectedSave, playerUuid, operationId: randomUUID(), ...controls };
  for (const key of DIRECTIONS) body[key] ??= false;
  assert(!(body.forward && body.backward || body.left && body.right), 'Opposing native input directions are unsupported');
  const dismount = controls.mode === 'dismount';
  const jump = controls.mode === 'jump';
  assert(!dismount || controls.ticks >= 2 && controls.ticks <= 5 && DIRECTIONS.every(k => body[k] === false), 'Dismount requires 2 to 5 ticks without directional controls');
  assert(!dismount || before.players[0].shiftKeyDown === false, 'Dismount requires an observed released server shift key');
  if (jump) {
    const p = before.players[0];
    assert(controls.ticks >= 2 && controls.ticks <= 5, 'Jump requires 2 to 5 ticks');
    assert(p.onGround === true && p.inWater === false && p.shiftKeyDown === false && Number.isFinite(p.health) && p.health > 0
      && p.inWaterOrBubble === false && p.onClimbable === false && p.hasEffects === false && p.hurtTime === 0
      && p.abilities?.creative === false && p.abilities?.spectator === false && p.abilities?.flying === false,
    'Jump requires a grounded, dry, non-creative living owner with released Shift');
    assert(Number.isFinite(p.positionPrecise?.y), 'Jump requires precise native server position');
  }
  const vehicle = snapshot => snapshot.players[0].nearbyEntities.find(e => e.uuid === controls.vehicleUuid);
  if (controls.mode === 'boat' || dismount) {
    const original = vehicle(before);
    assert(original && before.players[0].vehicle?.id === original.id, 'Input fixture is not driving its expected vehicle');
  } else assert(!before.players[0].vehicle && controls.vehicleUuid === undefined, 'Walking/jump input requires a player on foot');
  const observed = { request: body, before, receipts: [] };
  let finished = false, attemptedStart = false;
  function checkInterrupted() {
    if (signal?.aborted) throw new Error('Native client input interrupted');
  }
  async function call(action, observe = true) {
    const reply = await request('/client-input', action === 'start' ? body : { action, expectedSave, playerUuid, operationId: body.operationId });
    assert(observed.receipts.length < 1000, 'Native input receipt limit exceeded');
    observed.receipts.push(reply);
    assert(reply.operationId === body.operationId && ['active', 'releasing', 'complete'].includes(reply.phase), 'Input receipt has the wrong operation');
    assert(reply.request?.playerUuid === playerUuid && reply.request?.expectedSave === expectedSave, 'Input receipt has the wrong identity');
    assert(['mode', 'ticks', ...DIRECTIONS].every(k => reply.request[k] === body[k])
      && reply.request.vehicleUuid === body.vehicleUuid, 'Input receipt describes different controls');
    if (observe) await onReceipt(observed);
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
    assert(Array.isArray(frames) && frames.length >= controls.ticks && frames.length <= controls.ticks + (dismount || jump ? 40 : 6), 'Native input trace has an invalid bound');
    for (const [index, frame] of frames.entries()) {
      assert(frame.freshKeyboardSample === true && Number.isInteger(frame.clientPlayerTick), 'Input trace reused cached keyboard state');
      if (index) assert(frame.clientPlayerTick > frames[index - 1].clientPlayerTick, 'Input trace did not advance native player ticks');
    }
    const matching = frames.filter(frame => DIRECTIONS.every(k => frame.nativeInput?.[k] === body[k])
      && (!dismount || frame.nativeInput?.shift === true) && (!jump || frame.nativeInput?.jump === true));
    assert(matching.length >= controls.ticks, 'Requested controls were not observed in native client input');
    assert(DIRECTIONS.every(k => frames.at(-1).nativeInput?.[k] === false), 'The final native input sample is not neutral');
    if (dismount) {
      assert(frames.at(-1).nativeInput?.shift === false, 'Dismount key release was not observed');
      assert(frames.at(-1).clientOnFoot === true, 'Native client did not leave the source vehicle');
      assert(frames.every(frame => frame.vehicleUuid === controls.vehicleUuid), 'Dismount trace lost the source vehicle');
    }
    if (jump) {
      assert(frames.at(-1).nativeInput?.jump === false && frames.at(-1).clientOnFoot === true, 'Native jump release or on-foot state was not observed');
      assert(frames.every(f => Number.isFinite(f.clientJumpOriginY) && f.clientJumpOriginY === frames[0].clientJumpOriginY), 'Client jump origin changed');
      observed.clientJumpHeight = Math.max(...frames.filter(f => f.clientOnGround === false).map(f => f.clientPlayerPosition?.y - f.clientJumpOriginY));
      assert(frames.at(-1).clientJumpObserved === true && Number.isFinite(observed.clientJumpHeight) && observed.clientJumpHeight > 0.05,
        'Native client upward movement was not observed');
      assert(frames.some(f => f.ownedJumpPress === true && f.clientGroundedBeforeTick === true && f.nativeInput.jump === true
        && f.clientJumpObserved === true && f.clientOnGround === false && f.unsafeJumpMotion === false
        && f.clientBeforeTickVelocityY <= 0.01 && f.clientVelocity?.y > 0.05 && f.clientVerticalCollision === false),
      'An owned grounded jump launch was not observed');
      const started = nativeMillis(reply.startedMillis), finishedAt = nativeMillis(reply.finishedMillis);
      assert(finishedAt >= started && finishedAt - started <= 15000n, 'Invalid native jump ownership window');
      assert(observed.receipts.every(r => r.startedMillis === reply.startedMillis), 'Native jump start time changed');
      assert(frames.every(f => nativeMillis(f.clientSampleMillis) >= started && nativeMillis(f.clientSampleMillis) <= finishedAt), 'Client jump sample is outside input ownership');
      observed.inputWindow = { startedMillis: reply.startedMillis, finishedMillis: reply.finishedMillis };
    }
    let after = await state();
    observed.after = after;
    if (dismount) observed.serverDismount = [after];
    assertInspectionWorld(after, context);
    if (dismount) {
      const acknowledgementDeadline = Math.min(deadline, performance.now() + 2000);
      while (after.players[0].vehicle || after.players[0].shiftKeyDown !== false
        || BigInt(after.overworldGameTime) <= BigInt(before.overworldGameTime)) {
        assert(after.worldFrozen === false, 'World froze during dismount acknowledgement');
        assert(!after.players[0].vehicle || after.players[0].vehicle.id === vehicle(before).id, 'Server player entered another vehicle during dismount');
        assert(performance.now() < acknowledgementDeadline, 'Server did not confirm dismount and released shift within the bounded wait');
        await sleep(pollMs);
        await call('status');
        checkInterrupted();
        after = await state();
        observed.after = after;
        observed.serverDismount.push(after);
        assertInspectionWorld(after, context);
      }
      assert(vehicle(after)?.uuid === controls.vehicleUuid, 'Dismount source vehicle disappeared from server observation');
    }
    if (jump) {
      const startReceipt = observed.receipts[0], origin = startReceipt.serverSnapshot;
      assert(origin, 'Start receipt is missing its server origin');
      assertInspectionWorld(origin, context);
      const serverOriginY = origin.players[0].positionPrecise?.y;
      assert(Number.isFinite(serverOriginY) && Math.abs(serverOriginY - before.players[0].positionPrecise.y) <= 0.125
        && Math.abs(serverOriginY - frames[0].clientJumpOriginY) <= 0.125, 'Jump origin changed between server and client');
      const started = nativeMillis(observed.inputWindow.startedMillis), finishedAt = nativeMillis(observed.inputWindow.finishedMillis);
      const originSample = nativeMillis(origin.inputObservationEndMillis);
      assert(started >= originSample && started - originSample <= 1000n, 'Jump server origin is stale');
      assert(observed.receipts.every(r => r.request.jumpServerOriginY === serverOriginY
        && r.request.jumpServerSampleMillis === origin.inputObservationEndMillis), 'Jump server origin does not match the bound request');
      observed.jumpOrigin = { serverY: serverOriginY, clientY: frames[0].clientJumpOriginY, sampleMillis: origin.inputObservationEndMillis };
      observed.serverJump = observed.receipts.map(r => r.serverSnapshot);
      const inspectJump = snapshot => {
        assert(snapshot, 'Jump receipt is missing a server snapshot');
        assertInspectionWorld(snapshot, context);
        const sampleStart = nativeMillis(snapshot.inputObservationStartMillis), sampleEnd = nativeMillis(snapshot.inputObservationEndMillis);
        assert(sampleEnd >= sampleStart, 'Invalid server observation interval');
        if (sampleStart < started || sampleEnd > finishedAt) return 0;
        assert(snapshot.worldFrozen === false, 'World froze during jump observation');
        const p = snapshot.players[0];
        assert(!p.vehicle && p.abilities?.creative === false && p.abilities?.spectator === false && p.abilities?.flying === false,
          'Jump changed owner mode or vehicle');
        assert(Number.isFinite(p.positionPrecise?.y), 'Server jump position is unavailable');
        assert(p.inWaterOrBubble === false && p.onClimbable === false && p.hasEffects === false && p.hurtTime === 0,
          'Unsupported server jump physics');
        return p.onGround === false && BigInt(snapshot.overworldGameTime) > BigInt(origin.overworldGameTime)
          ? p.positionPrecise.y - serverOriginY : 0;
      };
      observed.serverJumpHeight = Math.max(...observed.serverJump.map(inspectJump));
      assert(observed.serverJumpHeight > 0.05, 'Server upward movement was not observed during input ownership');
    }
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
        // Gameplay observers may be the original source of failure. Keep
        // cleanup independent so that same assertion cannot interrupt release.
        let reply = await call('cancel', false);
        const deadline = performance.now() + 2000;
        while (reply.phase !== 'complete' && performance.now() < deadline) {
          await sleep(pollMs);
          reply = await call('status', false);
        }
        assert(reply.phase === 'complete' && reply.controlsReleased === true, 'Native input cleanup did not complete with confirmed release');
        observed.cleanup = reply;
      } catch (error) { observed.cleanupError = error.message; }
    }
  }
}

module.exports = { driveClientInput };
