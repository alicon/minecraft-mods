const assert = require('node:assert/strict');
const test = require('node:test');

const cell = (x, y, z, type) => ({ x, y, z, b: `minecraft:${type}` });
const bed = [3, 64, 0];
const door = [1, 64, 0];
const entrance = [0, 64, 0];
const inside = [2, 64, 0];
const house = [
  ...[-1, 0, 1, 2, 3, 4].map(x => cell(x, 63, 0, 'oak_planks')),
  cell(3, 64, 0, 'red_bed'), cell(4, 64, 0, 'red_bed'),
  cell(1, 64, 0, 'oak_door'), cell(1, 65, 0, 'oak_door'),
  cell(2, 66, 0, 'oak_planks'), cell(3, 66, 0, 'oak_planks'),
];

test('a sheltered bed needs a complete bed, overhead cover and a supported doorway', async () => {
  const { shelteredBed } = await import('./expedition-shelter.mjs');
  assert.deepEqual(shelteredBed(house, bed), { bed, door, entrance, inside });
  assert.equal(shelteredBed(house.filter(c => !(c.x === 4 && c.y === 64)), bed), undefined);
  assert.equal(shelteredBed(house.filter(c => c.y !== 66), bed), undefined);
  assert.equal(shelteredBed(house.filter(c => !(c.x === 0 && c.y === 63)), bed), undefined);
});

test('the player enters through a wooden door and closes it from inside', async () => {
  const { enterShelter } = await import('./expedition-shelter.mjs');
  for (const startsOpen of [false, true]) {
    let open = startsOpen;
    let inHouse = false;
    const clicks = [];
    const action = async (name, args) => {
      if (name === 'go_to') {
        assert.deepEqual(args.pos, inside);
        if (open) inHouse = true;
        return { arrived: open };
      }
      if (name === 'look') return {};
      if (name === 'observe') return { crosshair: { pos: door } };
      if (name === 'interact_block') {
        assert.deepEqual(args.pos, door);
        clicks.push(inHouse);
        open = !open;
        return { success: true };
      }
      assert.fail(name);
    };
    assert.equal(await enterShelter(action, { door, entrance, inside }), true);
    assert.deepEqual(clicks, startsOpen ? [true] : [false, true]);
    assert.ok(inHouse && !open);
  }
});

test('a nearby house gives the Survival run a bed before it starts hunting for wool', async () => {
  const { prepareAdoptionCamp } = await import('./expedition-home.mjs');
  const player = { inWorld: true, health: 20, food: 20, position: { x: 0.5, y: 64, z: 0.5 },
    crosshair: { pos: door } };
  const action = async (name, args) => {
    switch (name) {
      case 'get_inventory': return { slots: [] };
      case 'observe': return player;
      case 'scan_blocks':
        assert.ok(args.blocks.includes('minecraft:red_bed'));
        return { matches: [{ positions: [bed] }] };
      case 'get_blocks': return { cells: house };
      case 'go_to': return { arrived: true };
      case 'look': return {};
      case 'interact_block': return { success: true };
      default: assert.fail(`Unexpected ${name}`);
    }
  };
  assert.deepEqual(await prepareAdoptionCamp(action, () => assert.fail('No bed crafting needed'),
    () => assert.fail('No animal scouting needed')), { bed, door, entrance });
});
