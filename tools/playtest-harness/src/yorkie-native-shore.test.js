'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { AUDIT_BLOCKS, shoreGeometry, assertShoreAudit, assertOwnerInShore, assertShoreEndpoint, assertStableShore, dryRestSupport, assertShoreBoardingGrace } = require('./yorkie-native-shore-fixture');
const { nativeShoreCases } = require('./yorkie-native-shore');
const base = { x: 0, y: 220, z: 0 };
const volume = r => (r.x2 - r.x1 + 1) * (r.y2 - r.y1 + 1) * (r.z2 - r.z1 + 1);
function validAudit(g) {
  const audit = {};
  for (const [name, block] of Object.entries(AUDIT_BLOCKS)) {
    audit[name] = { volume: volume(g[name]), counts: { [block]: volume(g[name]) } };
  }
  audit.rampState = { state: 'minecraft:stone_slab[type=bottom,waterlogged=false]' };
  return audit;
}

test('the walking bank exceeds the observed command and every clear fits native fill bounds', () => {
  for (const y of [-62, 220, 316]) {
    const g = shoreGeometry({ ...base, y });
    assert(g.endZ >= 44);
    assert(g.clear.every(r => volume(r) <= 32768));
    assert.equal(g.clear[0].z1, 8);assert.equal(g.clear.at(-1).z2, g.endZ);
    for (let i = 1; i < g.clear.length; i++) assert.equal(g.clear[i].z1, g.clear[i - 1].z2 + 1);
  }
  assert.throws(() => shoreGeometry({ ...base, x: NaN }));
});

for (const fault of [...Object.keys(AUDIT_BLOCKS), 'empty-volume', 'top-slab']) {
  test(`refuse unsafe ${fault} before any owner or pet mounts`, async () => {
    const g = shoreGeometry(base), audit = validAudit(g), commands = [];
    if (Object.hasOwn(AUDIT_BLOCKS, fault)) audit[fault].counts = {};
    if (fault === 'empty-volume') audit.floor.volume = 0;
    if (fault === 'top-slab') audit.rampState.state = 'minecraft:stone_slab[type=top,waterlogged=false]';
    assert.throws(() => assertShoreAudit(g, audit));
    const pet = { type: 'mushroom_yorkie:mushroom_yorkie', uuid: 'pet' };
    const snapshot = { saveName: 'Codex Shore', singleplayer: true, players: [{ uuid: 'owner', dimension: 'minecraft:overworld' }] };
    const context = { base, player: 'Owner', expectedSave: snapshot.saveName, playerUuid: 'owner', state: async () => snapshot,
      prepare: async () => {}, entity: () => pet, command: async text => commands.push(text),
      request: async (route, body) => {
        if (route === '/use-entity') return { target: { custom: { harness: true } } };
        if (route === '/block') return audit.rampState;
        assert.equal(route, '/count-blocks');
        const name = Object.keys(AUDIT_BLOCKS).find(key => JSON.stringify(g[key]) === JSON.stringify(body));
        assert(name);return audit[name];
      }
    };
    await assert.rejects(nativeShoreCases(context)[0].setup());
    assert(commands.every(c => !/^(ride|summon) /.test(c)));
  });
}

test('runtime boundary checks refuse approaching an edge or falling below the bank', () => {
  const g = shoreGeometry(base), s = position => ({ players: [{ position }] });
  assertOwnerInShore(s({ x: 0.5, y: 219, z: 0.5 }), g);
  for (const position of [{ x: 7, y: 220, z: 0 }, { x: 0, y: 220, z: 44 }, { x: 0, y: 217, z: 10 }]) {
    assert.throws(() => assertOwnerInShore(s(position), g), /boundary/);
  }
});

function endpoint() {
  return { pet: { health: 12, maxHealth: 12, air: 300, maxAir: 300, custom: { harness: true }, tameable: { orderedToSit: false },
    position: { x: 1, y: 220, z: 10 }, inWater: false, onGround: true }, owner: { position: { x: 0, y: 220, z: 10 } },
    footBlock: { block: 'minecraft:grass_block' }, ownerFootBlock: { block: 'minecraft:grass_block' }, initialSit: false, sawWet: true };
}
test('recovery needs block support, breathing, the expected order and the owner nearby', () => {
  assertShoreEndpoint(endpoint());
  for (const fault of ['hurt', 'air', 'wet', 'airborne', 'passenger', 'unsupported', 'far', 'order', 'owner-water']) {
    const e = endpoint();
    if (fault === 'hurt') e.pet.health = 11;
    if (fault === 'air') delete e.pet.air;
    if (fault === 'wet') e.pet.inWater = true;
    if (fault === 'airborne') e.pet.onGround = false;
    if (fault === 'passenger') e.pet.vehicle = { id: 1 };
    if (fault === 'unsupported') e.footBlock.block = 'minecraft:air';
    if (fault === 'far') e.pet.position.x = 10;
    if (fault === 'order') e.pet.tameable.orderedToSit = true;
    if (fault === 'owner-water') e.ownerFootBlock.block = 'minecraft:water';
    assert.throws(() => assertShoreEndpoint(e), fault);
  }
});
test('dry sitting needs original support while observed wet sitting requires release and recovery', () => {
  const e = endpoint();e.initialSit = true;e.sawWet = false;e.pet.tameable.orderedToSit = true;e.pet.position.x = 15;
  e.geometry = shoreGeometry(base);e.boatUuid = 'boat';e.restAnchor = { ...e.pet.position };
  e.snapshot = { players: [{ nearbyEntities: [{ uuid: 'boat', id: 2, type: 'minecraft:oak_boat', position: { x: 15, y: 219.4375, z: 10 } }] }] };
  e.pet.position.y = 220;e.snapshot.players[0].nearbyEntities[0].position.y = 219.4375;
  assertShoreEndpoint(e);
  e.sawWet = true;assert.throws(() => assertShoreEndpoint(e));
  e.pet.tameable.orderedToSit = false;e.pet.position.x = 1;assertShoreEndpoint(e);
});
test('native shore axes are independently selectable and disable inspection care', () => {
  const cases = nativeShoreCases({});assert.equal(cases.length, 8);
  assert.equal(new Set(cases.map(c => c.name)).size, 8);
  assert(cases.every(c => c.inspectionPet === false && c.inputs.ownerMode === 'survival'));
});

test('a good final endpoint cannot hide a late recovery loss or skipped world sample', () => {
  const frames = Array.from({ length: 40 }, (_, i) => {
    const e = endpoint();Object.assign(e.pet, { uuid: 'pet', maxAir: 300, noGravity: false });e.pet.tameable.ownedByPlayer = true;
    return { worldFrozen: true, tickAudit: { before: i, after: i + 1, elapsedTicks: 1 }, players: [{ ...e.owner, nearbyEntities: [e.pet] }] };
  });
  const identity = { petUuid: 'pet', initialSit: false, sawWet: true };
  assertStableShore(frames, identity);
  for (const fault of ['late-wet', 'late-jump', 'late-air-loss', 'late-distance', 'missing-pet', 'tick-gap', 'short-window']) {
    const changed = structuredClone(frames), sample = changed[30], pet = sample.players[0].nearbyEntities[0];
    if (fault === 'late-wet') pet.inWater = true;
    if (fault === 'late-jump') pet.onGround = false;
    if (fault === 'late-air-loss') pet.air = 290;
    if (fault === 'late-distance') pet.position.x = 12;
    if (fault === 'missing-pet') pet.uuid = 'replacement';
    if (fault === 'tick-gap') sample.tickAudit.before++;
    if (fault === 'short-window') changed.shift();
    assert.throws(() => assertStableShore(changed, identity), fault);
  }
});

test('dry sitting rejects unsupported hulls, late drift and lost air while allowing native reboarding', () => {
  const geometry = shoreGeometry(base);
  const pet = { id: 1, uuid: 'pet', inWater: false, onGround: true, noGravity: false, air: 300, maxAir: 300,
    position: { x: 0.5, y: 220, z: 0.5 } };
  const boat = { id: 2, uuid: 'boat', type: 'minecraft:oak_boat', position: { x: 0.5, y: 219.4375, z: 0.5 }, passengers: [] };
  const snapshot = { players: [{ nearbyEntities: [pet, boat] }] };
  const rest = { geometry, boatUuid: 'boat', restAnchor: { ...pet.position } };
  assert.equal(dryRestSupport(pet, snapshot, rest), 'original-boat-hull');
  for (const fault of ['wet', 'unsupported', 'drift', 'missing-boat', 'low-air', 'flying', 'wrong-vehicle']) {
    const s = structuredClone(snapshot), p = s.players[0].nearbyEntities[0], b = s.players[0].nearbyEntities[1];
    if (fault === 'wet') p.inWater = true;
    if (fault === 'unsupported') p.position.y += 0.2;
    if (fault === 'drift') { p.position.x += 1.1;b.position.x += 1.1; }
    if (fault === 'missing-boat') b.uuid = 'replacement';
    if (fault === 'low-air') p.air = 299;
    if (fault === 'flying') p.noGravity = true;
    if (fault === 'wrong-vehicle') p.vehicle = { id: 3 };
    assert.throws(() => dryRestSupport(p, s, rest), fault);
  }
  pet.vehicle = { id: 2 };pet.onGround = false;boat.passengers = [{ id: 1 }];
  assert.equal(dryRestSupport(pet, snapshot, rest), 'original-boat-passenger');
  const frames = Array.from({ length: 40 }, (_, i) => {
    const s = structuredClone(snapshot);Object.assign(s.players[0].nearbyEntities[0], { health: 12, maxHealth: 12,
      custom: { harness: true }, tameable: { ownedByPlayer: true, orderedToSit: true } });
    return { ...s, worldFrozen: true, tickAudit: { before: i, after: i + 1, elapsedTicks: 1 } };
  });
  assertStableShore(frames, { ...rest, petUuid: 'pet', initialSit: true, sawWet: false });
  frames[30].players[0].nearbyEntities[0].position.x += 1.1;
  assert.throws(() => assertStableShore(frames, { ...rest, petUuid: 'pet', initialSit: true, sawWet: false }), /drifted/);
});

for (const fault of ['released', 'unreleased', 'mismatched']) test(`missing receipt snapshot cannot hide ${fault} cleanup`, async () => {
  const released = fault !== 'unreleased', confirmed = fault === 'released';
  const pet = { id: 1, uuid: 'pet', type: 'mushroom_yorkie:mushroom_yorkie', health: 12, maxHealth: 12,
    air: 300, fallDistance: 0, lastDamageType: 'unavailable', inWater: false, noGravity: false,
    custom: { harness: true }, tameable: { ownedByPlayer: true }, position: { x: 0.5, y: 220, z: 0.5 } };
  const boat = { id: 2, uuid: 'boat', type: 'minecraft:oak_boat' };
  const before = { saveName: 'Codex Shore', singleplayer: true, worldFrozen: false, overworldGameTime: '1',
    players: [{ uuid: 'owner', health: 20, dimension: 'minecraft:overworld', shiftKeyDown: false,
      vehicle: { id: 2 }, position: { x: 0.5, y: 220, z: 0.5 }, nearbyEntities: [pet, boat] }] };
  let start, cancelled = false;
  const context = { state: async () => before, entity: () => pet, expectedSave: before.saveName, playerUuid: 'owner',
    request: async (route, body) => {
      assert.equal(route, '/client-input');
      if (body.action === 'start') start = body;
      else { assert.equal(body.action, 'cancel');cancelled = true; }
      return { operationId: cancelled && fault === 'mismatched' ? 'wrong-operation' : body.operationId, request: start, phase: cancelled ? 'complete' : 'active',
        controlsReleased: cancelled && released, outcome: cancelled ? 'cancelled' : 'running' };
    } };
  const result = {};
  await assert.rejects(nativeShoreCases(context)[0].run({ before, petUuid: 'pet', boatUuid: 'boat',
    bank: { geometry: shoreGeometry(base) } }, result, () => {}), error => {
    assert.match(error.message, /missing its server snapshot/);
    if (!confirmed) assert.match(error.message, /release unconfirmed/);
    return true;
  });
  assert(cancelled);assert.equal(result.observed.inputRelease.confirmed, confirmed);
  if (!confirmed) assert.match(result.observed.inputRelease.cleanupError, /confirmed release|wrong operation/);
});

test('native help forbids early reboarding but permits the original boat at tick 200', () => {
  const boat = { id: 2, uuid: 'boat' }, pet = { vehicle: { id: 2 } };
  const snapshot = ticks => ({ overworldGameTime: String(1000 + ticks), players: [{ nearbyEntities: [boat] }] });
  const context = { boatUuid: 'boat', helpGameTime: '1000' };
  for (const tick of [0, 1, 199]) assert.throws(() => assertShoreBoardingGrace(snapshot(tick), pet, context), /grace/);
  for (const tick of [200, 240]) assertShoreBoardingGrace(snapshot(tick), pet, context);
  pet.vehicle.id = 3;assert.throws(() => assertShoreBoardingGrace(snapshot(240), pet, context), /different vehicle/);
  delete pet.vehicle;assertShoreBoardingGrace(snapshot(1), pet, context);
});
