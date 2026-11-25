'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { captureMatrixFailure } = require('./yorkie-failure-capture');

function fixture() {
  const world = { saveName: 'Codex Failure Test', singleplayer: true, worldFrozen: false,
    players: [{ uuid: 'owner', dimension: 'minecraft:overworld', health: 20,
      position: { x: 0.5, y: 220, z: 0.5 }, velocity: { x: 0.1, y: -0.08, z: 0 },
      onGround: false, vehicle: { id: 7 }, nearbyEntities: [{ type: 'mushroom_yorkie:mushroom_yorkie' }] }] };
  const ui = { screen: 'pause-menu', hud: true, chat: ['original player-facing warning'] };
  const commands = [], requests = [], delays = [];
  const context = { expectedSave: world.saveName, playerUuid: 'owner', runId: 'run', state: async () => structuredClone(world),
    command: async text => {
      commands.push(text);
      if (text === 'tick freeze') world.worldFrozen = true;
      else {
        // Model the relevant native teleport side effects: a camera workaround
        // must never reach this branch during evidence capture.
        delete world.players[0].vehicle;world.players[0].velocity.y = 0;world.players[0].onGround = true;
      }
    },
    request: async (route, body) => {
      requests.push({ route, body });
      if (body.resume) ui.screen = null;
      if (body.hideGui) ui.hud = false;
      if (body.clearChat) ui.chat = [];
      return { file: 'failure.png' };
    } };
  return { context, world, ui, commands, requests, delay: async ms => { delays.push(ms); }, delays };
}

for (const stopOnFailure of [false, true]) test(`failure photo preserves native owner and view, investigative=${stopOnFailure}`, async () => {
  const f = fixture(), owner = structuredClone(f.world.players[0]), ui = structuredClone(f.ui);
  const result = await captureMatrixFailure(f.context, { name: 'boat', stopOnFailure }, { delay: f.delay });
  assert.deepEqual(f.world.players[0], owner);assert.deepEqual(f.ui, ui);
  assert.deepEqual(f.commands, stopOnFailure ? ['tick freeze'] : []);
  assert.deepEqual(f.requests, [{ route: '/screenshot', body: { name: 'yorkie-run-boat-failure.png',
    resume: false, hideGui: false, clearChat: false } }]);
  assert.equal(result.screenshot, 'failure.png');assert.equal(result.camera.skipped, true);
  assert.equal(result.cameraState.players[0].vehicle.id, 7);
  assert.equal(f.world.worldFrozen, stopOnFailure);assert.deepEqual(f.delays, [300, 150]);
});

test('changed save, owner, dimension or player count refuse capture before any screenshot', async () => {
  for (const afterFirstRead of [false, true]) for (const fault of ['save', 'owner', 'dimension', 'multiplayer']) {
    const f = fixture();let reads = 0;
    f.context.state = async () => {
      const s = structuredClone(f.world);
      if (reads++ > 0 || !afterFirstRead) {
        if (fault === 'save') s.saveName = 'Family Save';
        if (fault === 'owner') s.players[0].uuid = 'other-owner';
        if (fault === 'dimension') s.players[0].dimension = 'minecraft:the_nether';
        if (fault === 'multiplayer') s.players.push({ uuid: 'other-owner' });
      }
      return s;
    };
    await assert.rejects(captureMatrixFailure(f.context, { name: 'boat', stopOnFailure: true }, { delay: f.delay }));
    assert.equal(f.requests.length, 0);
    if (!afterFirstRead) assert.equal(f.commands.length, 0);
  }
});

test('an unconfirmed investigative freeze fails without touching the view', async () => {
  const f = fixture();f.context.command = async text => f.commands.push(text);
  await assert.rejects(captureMatrixFailure(f.context, { name: 'boat', stopOnFailure: true }, { delay: f.delay }), /frozen world/);
  assert.equal(f.requests.length, 0);assert.equal(f.ui.screen, 'pause-menu');assert.equal(f.world.players[0].vehicle.id, 7);
});

test('an investigative client pause preserves the screen and pending tick without sending a freeze command', async () => {
  const f = fixture();
  f.world.integratedServerPaused = true;
  f.world.frozenTicksRemaining = 1;
  const result = await captureMatrixFailure(f.context, { name: 'boat', stopOnFailure: true },
    { delay: f.delay, clientPaused: true });
  assert.deepEqual(f.commands, []);
  assert.equal(f.ui.screen, 'pause-menu');
  assert.equal(result.cameraState.frozenTicksRemaining, 1);
  assert.equal(result.screenshot, 'failure.png');
});
