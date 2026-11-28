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
