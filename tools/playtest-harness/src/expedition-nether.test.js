const assert = require('node:assert/strict');
const test = require('node:test');

function portalCells(axis, missing) {
  const at = (along, y, normal, b) => axis === 'x' ? { x: along, y, z: normal, b } : { x: normal, y, z: along, b };
  const frame = [[0, -1], [1, -1], [-1, 0], [2, 0], [-1, 1], [2, 1], [-1, 2], [2, 2], [0, 3], [1, 3]];
  return [
    ...frame.filter(([along, y]) => !missing || `${along},${y}` !== String(missing))
      .map(([along, y]) => at(along, y, 0, 'minecraft:obsidian')),
    ...[-3, -2, -1, 1, 2, 3].map(normal => at(0, -1, normal, 'minecraft:cobblestone')),
  ];
}

test('portal search matches both axes, budgets the exact repair and selects a dry landing', async () => {
  const { findPortalFrame } = await import('./expedition-nether.mjs');
  for (const axis of ['x', 'z']) {
    const cells = portalCells(axis, [-1, 2]);
    const player = axis === 'x' ? { x: 0.5, y: 0, z: 4.5 } : { x: 4.5, y: 0, z: 0.5 };
    assert.equal(findPortalFrame(cells, player), undefined);
    assert.deepEqual(findPortalFrame(cells, player, 1), {
      axis, lit: false, opening: [0, 0, 0], missing: [axis === 'x' ? [-1, 2, 0] : [0, 2, -1]],
      landing: axis === 'x' ? [0, 0, 3] : [3, 0, 0],
    });
  }
});

test('portal search rejects crying obsidian and refuses a landing across lava or a drop', async () => {
  const { findPortalFrame } = await import('./expedition-nether.mjs');
  const player = { x: 0.5, y: 0, z: 4.5 };
  const cells = portalCells('x');
  const crying = cells.map(block => block.x === -1 && block.y === 2
    ? { ...block, b: 'minecraft:crying_obsidian' } : block);
  assert.equal(findPortalFrame(crying, player, 1), undefined);
  const blocked = cells.filter(block => !(block.y === -1 && block.z === -1));
  blocked.push({ x: 0, y: 0, z: 1, b: 'minecraft:lava' });
  assert.equal(findPortalFrame(blocked, player), undefined);
});

test('the Survival route loots obsidian and flint and crafts its own ignition', async () => {
  const { prepareNetherPortal } = await import('./expedition-nether.mjs');
  const chest = [2, 0, 3];
  const area = [...portalCells('x', [-1, 2]), { x: chest[0], y: chest[1], z: chest[2], b: 'minecraft:chest' }];
  const player = { inWorld: true, health: 20, food: 20, gameTime: 500, timeOfDay: 500, dimension: 'minecraft:overworld',
    position: { x: 0.5, y: 0, z: 3.5 }, crosshair: { pos: chest, block: 'minecraft:chest' } };
  const inventory = new Set(['minecraft:iron_ingot']);
  const content = new Set(['minecraft:obsidian', 'minecraft:flint', 'minecraft:cobblestone']);
  const actions = [];
  const action = async (name, args) => {
    switch (name) {
      case 'observe': return player;
      case 'get_inventory': return { slots: [...inventory].map(id => ({ id, count: 1 })) };
      case 'get_blocks': return { cells: area };
      case 'look': assert.deepEqual(args.at, chest); return {};
      case 'interact_block': assert.deepEqual(args.pos, chest); return { screenOpened: 'ContainerScreen' };
      case 'get_container': return { slots: [...content].map(id => ({ id, section: 'container' })) };
      case 'transfer_items':
        assert.equal(args.to, 'player');
        assert.ok(content.delete(args.item));
        inventory.add(args.item);
        return { moved: 1 };
      case 'stop': actions.push(name); return {};
      default: assert.fail(name);
    }
  };
  const craft = async (item, amount) => {
    assert.equal(item, 'minecraft:flint_and_steel');
    assert.equal(amount, 1);
    assert.ok(inventory.delete('minecraft:flint') && inventory.delete('minecraft:iron_ingot'));
    inventory.add(item);
    actions.push(item);
  };
  const prepared = await prepareNetherPortal(action, craft);
  assert.equal(prepared.lighter, 'minecraft:flint_and_steel');
  assert.deepEqual(prepared.frame.missing, [[-1, 2, 0]]);
  assert.deepEqual([...content], ['minecraft:cobblestone']);
  assert.deepEqual(actions, ['stop', 'minecraft:flint_and_steel']);
});

test('a portal supplies chest is opened only when the player can actually see it', async () => {
  const { collectPortalLoot } = await import('./expedition-nether.mjs');
  const result = await collectPortalLoot(async name => {
    if (name === 'look') return {};
    if (name === 'observe') return { crosshair: { pos: [1, 0, 0], block: 'minecraft:stone' } };
    assert.fail(name);
  }, [2, 0, 0]);
  assert.equal(result, false);
});
