const assert = require('node:assert/strict');
const test = require('node:test');

const dog = { id: 6014, uuid: 'original', type: 'mushroom_yorkie:mushroom_yorkie',
  name: 'Mushroom', pos: [3, 64, 0], health: 5, distance: 3, recentlyHurt: true };
const spider = { id: 6300, type: 'minecraft:spider', pos: [3.5, 64, 0],
  distance: 3.5, hostile: true, health: 2 };
const player = { inWorld: true, health: 20, position: { x: 0, y: 64, z: 0 }, attackStrength: 1 };

test('an injured original dog interrupts normal work and the player hits only the creature under the crosshair', async () => {
  const { defendCompanion } = await import('./expedition-companion.mjs');
  for (const crosshair of [spider.id, dog.id]) {
    const hits = [];
    const look = [];
    const sameName = { ...dog, id: 2686, uuid: 'different', health: 20 };
    const action = async (name, args) => {
      switch (name) {
        case 'get_entities': return { entities: [sameName, dog, spider] };
        case 'stop': return {};
        case 'get_inventory': return { slots: [{ slot: 2, id: 'minecraft:stone_sword' }] };
        case 'select_slot': return {};
        case 'look': look.push(args.entityId); return {};
        case 'observe': return { ...player, crosshair: { type: 'entity', id: crosshair } };
        case 'attack_entity': hits.push(args.entityId); return {};
        default: assert.fail(name);
      }
    };
    assert.equal(await defendCompanion(action, player, dog.uuid), true);
    assert.deepEqual(look, [spider.id]);
    assert.deepEqual(hits, crosshair === spider.id ? [spider.id] : []);
  }
});

test('companion defense clears the grass in the strike sightline before resuming the same attack', async () => {
  const { defendCompanion } = await import('./expedition-companion.mjs');
  const zombie = { ...spider, type: 'minecraft:zombie', pos: [3, 65, 0], distance: 3 };
  const grass = [2, 65, 0];
  const strikes = [];
  let cleared = false;
  const action = async (name, args) => {
    switch (name) {
      case 'get_entities': return { entities: [dog, zombie] };
      case 'get_inventory': return { slots: [], selectedSlot: 0 };
      case 'look': assert.equal(args.entityId, zombie.id); return {};
      case 'stop': return {};
      case 'observe': return { ...player, crosshair: cleared ? { type: 'entity', id: zombie.id }
        : { type: 'block', block: 'minecraft:short_grass', pos: grass } };
      case 'break_block':
        assert.deepEqual(args.pos, grass);
        cleared = true;
        return { broken: true };
      case 'attack_entity': strikes.push(args.entityId); return {};
      default: assert.fail(name);
    }
  };
  assert.equal(await defendCompanion(action, player, dog.uuid), true);
  assert.deepEqual(strikes, [zombie.id]);
});

test('reaching a spider attacking the dog converts the same interrupt into a sword strike', async () => {
  const { defendCompanion } = await import('./expedition-companion.mjs');
  const distantDog = { ...dog, pos: [6, 64, -1], distance: 6.1 };
  const distantSpider = { ...spider, pos: [7, 64, 0], distance: 7 };
  const strikes = [];
  let approached = false;
  const action = async (name, args) => {
    switch (name) {
      case 'get_entities': return { entities: [distantDog, { ...distantSpider, distance: approached ? 2.3 : 7 }] };
      case 'stop': return {};
      case 'go_to':
        assert.equal(args.entityId, spider.id);
        approached = true;
        return { arrived: true, position: [4.7, 64, 0] };
      case 'get_inventory': return { slots: [{ slot: 0, id: 'minecraft:stone_sword' }], selectedSlot: 0 };
      case 'look': return {};
      case 'observe': return { ...player, crosshair: { type: 'entity', id: spider.id } };
      case 'attack_entity': strikes.push(args.entityId); return {};
      default: assert.fail(name);
    }
  };
  assert.equal(await defendCompanion(action, player, dog.uuid), true);
  assert.deepEqual(strikes, [spider.id]);
});

test('defense closes distance while a zombie is still far from the player but beside the injured dog', async () => {
  const { defendCompanion } = await import('./expedition-companion.mjs');
  const injuredDog = { ...dog, pos: [12, 64, 0], distance: 12, health: 7 };
  const zombie = { ...spider, type: 'minecraft:zombie', pos: [14, 64, 0], distance: 14 };
  const moves = [];
  const action = async (name, args) => {
    if (name === 'get_entities') {
      return { entities: [injuredDog, { ...zombie, distance: moves.length ? 8 : zombie.distance }] };
    }
    if (name === 'stop') return {};
    if (name === 'go_to') {
      moves.push(args);
      return { arrived: false, position: [6, 64, 0] };
    }
    assert.fail(name);
  };
  assert.equal(await defendCompanion(action, player, injuredDog.uuid), true);
  assert.deepEqual(moves, [{ entityId: zombie.id, stopDistance: 2.3, maxTicks: 24 }]);
});

test('when a creeper is close to the original dog, retreat without swinging', async () => {
  const { defendCompanion } = await import('./expedition-companion.mjs');
  const closeDog = { ...dog, pos: [1, 64, 0], distance: 1, recentlyHurt: false, health: 20 };
  const creeper = { ...spider, type: 'minecraft:creeper', pos: [2, 64, 0] };
  const moves = [];
  const ground = Array.from({ length: 13 }, (_, i) => ({ x: i - 6, y: 63, z: 0, b: 'minecraft:dirt' }));
  const action = async (name, args) => {
    switch (name) {
      case 'get_entities': return { entities: [closeDog, creeper] };
      case 'stop': return {};
      case 'get_blocks': return { cells: ground };
      case 'go_to': moves.push(args.pos); return { arrived: true };
      default: assert.fail(name);
    }
  };
  assert.equal(await defendCompanion(action, player, dog.uuid), true);
  assert.equal(moves.length, 1);
  assert.ok(moves[0][0] < 0);
});

test('a creeper between the player and injured Mushroom overrides a melee rescue', async () => {
  const { defendCompanion } = await import('./expedition-companion.mjs');
  const injuredDog = { ...dog, pos: [11, 64, 0], distance: 11 };
  const nearbyCreeper = { ...spider, id: 3240, type: 'minecraft:creeper', pos: [4, 64, 0], distance: 4 };
  const attacker = { ...spider, pos: [12, 64, 0], distance: 12 };
  const ground = Array.from({ length: 13 }, (_, i) => ({ x: i - 6, y: 63, z: 0, b: 'minecraft:dirt' }));
  const moves = [];
  const action = async (name, args) => {
    if (name === 'get_entities') return { entities: [injuredDog, nearbyCreeper, attacker] };
    if (name === 'stop') return {};
    if (name === 'get_blocks') return { cells: ground };
    if (name === 'go_to') {
      assert.ok(args.pos[0] < 0);
      moves.push(args.pos);
      return { arrived: true };
    }
    assert.fail(name);
  };
  assert.equal(await defendCompanion(action, player, injuredDog.uuid), true);
  assert.equal(moves.length, 1);
});

test('harmless nearby mobs and injury to another dog leave the current task alone', async () => {
  const { defendCompanion } = await import('./expedition-companion.mjs');
  const unhurt = { ...dog, recentlyHurt: false, health: 20 };
  const anotherDog = { ...dog, uuid: 'different' };
  const action = async name => {
    assert.equal(name, 'get_entities');
    return { entities: [unhurt, anotherDog, spider] };
  };
  assert.equal(await defendCompanion(action, player, unhurt.uuid), false);
});
