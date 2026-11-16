'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { driveClientInput } = require('./client-input');
const PLAYER = '494f67d1-2009-4c26-bfcb-c41a89adaf80';

function fixture({ lostStart = false, unchangedWorld = false, wrongNativeInput = false, neverFinishes = false, frozen = false, wrongReceipt = false, cachedInput = false, stalledCleanup = false } = {}) {
  let reads = 0, body, cancelled = false;
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
      if (request.action === 'cancel') cancelled = true;
      if (cancelled) {
        const reply = receipt(stalledCleanup ? 'releasing' : 'complete', 'cancelled');
        reply.controlsReleased = true;return reply;
      }
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

test('cleared keys without a completed cleanup phase cannot be claimed as confirmed cleanup', async () => {
  const f = fixture({ stalledCleanup: true });
  await assert.rejects(driveClientInput(f.context, { mode: 'walk', ticks: 3, forward: true }, { timeoutMs: 0, pollMs: 25 }), error => {
    assert.match(error.message, /bounded wait/);
    assert.match(error.observed.cleanupError, /did not complete/);
    assert.equal(error.observed.cleanup, undefined);return true;
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

test('a failing gameplay observer cannot interrupt native cancellation receipt collection', async () => {
  const f = fixture();let observations = 0;
  await assert.rejects(driveClientInput(f.context, { mode: 'walk', ticks: 3, forward: true }, {
    onReceipt: () => { observations++;throw new Error('synthetic pet health loss'); }
  }), error => {
    assert.match(error.message, /pet health loss/);
    assert.equal(error.observed.cleanup.phase, 'complete');
    assert.equal(error.observed.cleanup.controlsReleased, true);
    assert.equal(error.observed.cleanupError, undefined);return true;
  });
  assert.equal(observations, 1);
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

function dismountFixture({ delayedServer = false, staysMounted = false, serverShiftHeld = false,
  wrongVehicle = false, missingNativeShift = false, heldRelease = false, clientStillMounted = false } = {}) {
  const source = { id: 7, uuid: '00000000-0000-0000-0000-000000000007', type: 'minecraft:oak_boat', position: { x: 0, y: 220, z: 0 } };
  let reads = 0, body;
  const calls = [];
  const snapshot = () => {
    const index = reads++;
    const riding = index === 0 || staysMounted || delayedServer && index === 1 || wrongVehicle;
    return { singleplayer: true, saveName: 'Codex Input Test', worldFrozen: false, overworldGameTime: index ? '23' : '20',
      players: [{ uuid: PLAYER, dimension: 'minecraft:overworld', position: { x: index ? 1 : 0, y: 220, z: 0 },
        shiftKeyDown: index > 0 && serverShiftHeld, nearbyEntities: [source],
        ...(riding ? { vehicle: { id: wrongVehicle && index ? 8 : source.id } } : {}) }] };
  };
  const receipt = outcome => ({ operationId: body.operationId, request: body, phase: 'complete', outcome,
    controlsReleased: true, appliedClientTicks: 2,
    clientFrames: [true, true, false].map((pressed, index) => ({ clientPlayerTick: 100 + index, freshKeyboardSample: true,
      clientOnFoot: !clientStillMounted, vehicleUuid: source.uuid,
      nativeInput: { forward: false, backward: false, left: false, right: false,
        shift: heldRelease && index === 2 || pressed && !missingNativeShift } })) });
  return { source, calls, context: { expectedSave: 'Codex Input Test', playerUuid: PLAYER, state: async () => snapshot(),
    request: async (route, request) => { assert.equal(route, '/client-input');calls.push(request);
      if (request.action === 'start') body = request;
      return receipt(request.action === 'cancel' ? 'cancelled' : 'completed'); } } };
}

test('native dismount requires key press/release and separately waits for server exit', async () => {
  const f = dismountFixture({ delayedServer: true });
  const r = await driveClientInput(f.context, { mode: 'dismount', ticks: 2, vehicleUuid: f.source.uuid }, { pollMs: 0 });
  assert.equal(r.after.players[0].vehicle, undefined);
  assert.equal(r.after.players[0].shiftKeyDown, false);
  assert.equal(r.serverDismount.length, 2);
  assert.deepEqual(f.calls.map(c => c.action), ['start', 'status']);
});

test('acknowledged dismount cannot pass without native key evidence and neutral release', async () => {
  for (const options of [{ missingNativeShift: true }, { heldRelease: true }, { clientStillMounted: true }]) {
    const f = dismountFixture(options);
    await assert.rejects(driveClientInput(f.context, { mode: 'dismount', ticks: 2, vehicleUuid: f.source.uuid }, { pollMs: 0 }));
    assert.equal(f.calls.at(-1).action, 'cancel');
  }
});

test('client exit cannot hide a still-mounted server, held server key or another vehicle', async () => {
  for (const options of [{ staysMounted: true }, { serverShiftHeld: true }, { wrongVehicle: true }]) {
    const f = dismountFixture(options);
    await assert.rejects(driveClientInput(f.context, { mode: 'dismount', ticks: 2, vehicleUuid: f.source.uuid }, { pollMs: 0, timeoutMs: 0 }), error => {
      assert.match(error.message, options.wrongVehicle ? /another vehicle/ : /Server did not confirm dismount and released shift/);
      assert.equal(error.observed.serverDismount.length, 1);
      assert.equal(error.observed.receipts[0].phase, 'complete');
      return true;
    });
    assert.equal(f.calls.at(-1).action, 'cancel');
  }
});

test('dismount refuses long bursts, directional movement and a missing source before dispatch', async () => {
  for (const controls of [{ ticks: 1 }, { ticks: 6 }, { ticks: 2, forward: true }, { ticks: 2, vehicleUuid: undefined }]) {
    const f = dismountFixture();
    await assert.rejects(driveClientInput(f.context, { mode: 'dismount', vehicleUuid: f.source.uuid, ...controls }));
    assert.equal(f.calls.length, 0);
  }
});

function jumpFixture(options = {}) {
  let body;
  const calls = [];
  const initial = { singleplayer: true, saveName: 'Codex Input Test', worldFrozen: false, overworldGameTime: '20',
    players: [{ uuid: PLAYER, dimension: 'minecraft:overworld', health: 20, shiftKeyDown: false, onGround: true, inWater: false,
      inWaterOrBubble: false, onClimbable: false, hasEffects: false, hurtTime: 0,
      abilities: { creative: false, spectator: false, flying: false }, position: { x: 0, y: 220, z: 0 }, positionPrecise: { x: 0, y: 220, z: 0 }, nearbyEntities: [] }] };
  const snapshot = rise => {
    const s = structuredClone(initial);s.overworldGameTime = '23';
    s.players[0].position.y += rise;s.players[0].positionPrecise.y += rise;s.players[0].onGround = rise === 0;
    if (options.serverGrounded) s.players[0].onGround = true;
    if (options.wrongPlayer) s.players[0].uuid = 'changed';
    if (options.changedMode) s.players[0].abilities.creative = true;
    if (options.frozen) s.worldFrozen = true;
    if (options.serverEffects) s.players[0].hasEffects = true;
    return s;
  };
  const receipt = (phase, outcome) => ({ operationId: body.operationId,
    request: { ...body, jumpServerOriginY: options.badServerOrigin ? 221 : 220, jumpServerSampleMillis: '991' }, phase, outcome,
    startedMillis: '1000', ...(phase === 'complete' ? { finishedMillis: '1150' } : {}),
    controlsReleased: phase === 'complete', appliedClientTicks: phase === 'complete' ? 2 : 0,
    serverSnapshot: { ...(phase === 'active' ? structuredClone(initial) : snapshot(options.noServerRise ? 0 : 0.42)),
      ...(options.noPostStartWorldProgress ? { overworldGameTime: '23' } : {}),
      inputObservationStartMillis: phase === 'active' ? '990' : options.lateServerJump ? '1200' : '1100',
      inputObservationEndMillis: phase === 'active' ? '991' : options.lateServerJump ? '1201' : '1101' },
    clientFrames: phase === 'active' ? [] : [true, true, false].map((pressed, i) => ({
      clientPlayerTick: 100 + i, freshKeyboardSample: true, clientOnFoot: !options.remounted,
      clientOnGround: Boolean(options.groundedRise),
      clientSampleMillis: String(1050 + i * 50), ownedJumpPress: i < 2, clientGroundedBeforeTick: i === 0,
      clientBeforeTickVelocityY: options.outsideImpulse ? 0.4 : -0.08, clientVelocity: { y: 0.3332 - i * 0.1 },
      clientVerticalCollision: Boolean(options.ceiling), unsafeJumpMotion: Boolean(options.unsafeMotion),
      clientJumpOriginY: options.missingOrigin ? undefined : 220 + (options.changedOrigin && i === 2 ? 0.1 : 0),
      clientPlayerPosition: { x: 0, y: 220 + (options.noClientRise ? 0 : 0.42 + i * 0.2), z: 0 }, clientJumpObserved: !options.noClientRise,
      nativeInput: { forward: true && i < 2, backward: false, left: false, right: false, jump: options.heldRelease && i === 2 || pressed && !options.noPress }
    })) });
  return { initial, calls, context: { expectedSave: initial.saveName, playerUuid: PLAYER,
    state: async () => body ? snapshot(options.noServerRise || options.landed ? 0 : 0.8) : structuredClone(initial),
    request: async (route, request) => { assert.equal(route, '/client-input');calls.push(request);
      if (request.action === 'start') { body = request;return receipt('active', 'pending'); }
      return receipt('complete', request.action === 'cancel' ? 'cancelled' : 'completed');
    } } };
}

test('native jump proves press/release, owned launch and server-accepted rise, even after landing', async () => {
  const f = jumpFixture({ landed: true });
  const r = await driveClientInput(f.context, { mode: 'jump', ticks: 2, forward: true }, { pollMs: 0 });
  assert(r.clientJumpHeight > 0.4 && r.serverJumpHeight > 0.4);
  assert.equal(r.after.players[0].onGround, true);
  assert.deepEqual(f.calls.map(c => c.action), ['start', 'status']);
});

test('jump acknowledgement cannot hide missing native press, release, rise or a changed origin', async () => {
  for (const [option, expected] of [
    ['noPress', /Requested controls/], ['heldRelease', /Native jump release/], ['noClientRise', /Native client upward/],
    ['missingOrigin', /Client jump origin/], ['changedOrigin', /Client jump origin/], ['remounted', /Native jump release/],
    ['noServerRise', /Server upward movement/], ['wrongPlayer', /Inspection player changed/], ['changedMode', /Jump changed owner mode/],
    ['frozen', /World froze during jump observation/], ['groundedRise', /Native client upward/], ['serverGrounded', /Server upward movement/],
    ['lateServerJump', /Server upward movement/], ['badServerOrigin', /bound request/], ['serverEffects', /Unsupported server jump physics/],
    ['outsideImpulse', /owned grounded jump launch/], ['ceiling', /owned grounded jump launch/], ['unsafeMotion', /owned grounded jump launch/],
    ['noPostStartWorldProgress', /Server upward movement/]
  ]) {
    const f = jumpFixture({ [option]: true });
    await assert.rejects(driveClientInput(f.context, { mode: 'jump', ticks: 2, forward: true }, { pollMs: 0, timeoutMs: 500 }), error => {
      assert.match(error.message, expected, option);
      assert(error.observed.receipts.some(r => r.phase === 'complete' && r.outcome === 'completed'), option);
      return true;
    });
    assert.equal(f.calls.at(-1).action, 'cancel');
  }
});

test('jump refuses invalid bounds, a vehicle, unsupported owner modes and unknown ground before dispatch', async () => {
  for (const change of [
    (p, c) => { c.ticks = 1; }, (p, c) => { c.ticks = 6; }, (p, c) => { c.vehicleUuid = 'boat'; },
    p => { p.vehicle = { id: 1 }; }, p => { p.onGround = false; }, p => { delete p.onGround; }, p => { p.inWater = true; },
    p => { p.shiftKeyDown = true; }, p => { p.health = 0; }, p => { p.abilities.creative = true; },
    p => { p.abilities.flying = true; }, p => { delete p.positionPrecise; }
  ]) {
    const f = jumpFixture(), controls = { mode: 'jump', ticks: 2, forward: true };change(f.initial.players[0], controls);
    await assert.rejects(driveClientInput(f.context, controls));assert.equal(f.calls.length, 0);
  }
});

test('the public jump CLI defaults to two ticks and records owned launch and accepted-motion evidence', async () => {
  const http = require('node:http'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
  const { execFile } = require('node:child_process'), f = jumpFixture();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'native-jump-cli-')), reportFile = path.join(directory, 'jump.json');
  const server = http.createServer(async (request, response) => {
    try {
      let body = '';for await (const chunk of request) body += chunk;
      const result = request.url === '/state' ? await f.context.state() : await f.context.request(request.url, JSON.parse(body));
      response.setHeader('content-type', 'application/json');response.end(JSON.stringify({ ok: true, ...result }));
    } catch (error) { response.statusCode = 500;response.end(JSON.stringify({ ok: false, error: error.message })); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const result = await new Promise(resolve => execFile(process.execPath, [path.join(__dirname, 'bridge-cli.js'), 'client-input', '--mode', 'jump',
      '--forward', 'true', '--port', String(server.address().port), '--expected-save', f.context.expectedSave, '--report-file', reportFile],
      { timeout: 10000 }, (error, stdout, stderr) => resolve({ error, stdout, stderr })));
    assert.ifError(result.error);assert.equal(JSON.parse(result.stdout).ok, true);
    assert.equal(f.calls[0].ticks, 2);
    const evidence = JSON.parse(fs.readFileSync(reportFile, 'utf8')).cases[0].observed;
    assert(evidence.clientJumpHeight > 0.4 && evidence.serverJumpHeight > 0.4);
  } finally { await new Promise(resolve => server.close(resolve));fs.rmSync(directory, { recursive: true }); }
});
