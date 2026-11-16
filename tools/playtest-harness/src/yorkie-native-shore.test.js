'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { shoreGeometry, assertShoreAudit, assertOwnerInShore, assertShoreEndpoint, assertStableShore } = require('./yorkie-native-shore-fixture');
const { nativeShoreCases } = require('./yorkie-native-shore');
const base = { x: 0, y: 220, z: 0 };
const volume = r => (r.x2 - r.x1 + 1) * (r.y2 - r.y1 + 1) * (r.z2 - r.z1 + 1);
function validAudit(g) {
  const audit = {};
  for (const [name, block] of [['floor', 'minecraft:grass_block'], ['headroom', 'minecraft:air'], ['bottom', 'minecraft:stone'], ['ramp', 'minecraft:stone_slab']]) {
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

for (const fault of ['floor', 'headroom', 'bottom', 'ramp', 'empty-volume', 'top-slab']) {
  test(`refuse unsafe ${fault} before any owner or pet mounts`, async () => {
    const g = shoreGeometry(base), audit = validAudit(g), commands = [];
    if (['floor', 'headroom', 'bottom', 'ramp'].includes(fault)) audit[fault].counts = {};
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
        const name = ['floor', 'headroom', 'bottom', 'ramp'].find(key => JSON.stringify(g[key]) === JSON.stringify(body));
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
  return { pet: { health: 12, maxHealth: 12, air: 300, custom: { harness: true }, tameable: { orderedToSit: false },
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
test('dry sitting retains its order while observed wet sitting requires release and recovery', () => {
  const e = endpoint();e.initialSit = true;e.sawWet = false;e.pet.tameable.orderedToSit = true;e.pet.position.x = 15;
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
