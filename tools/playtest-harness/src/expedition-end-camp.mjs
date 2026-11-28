import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';
import { markExpeditionCamp, useEmptyHandOnCompanion } from './expedition-gear.mjs';
import { hold } from './expedition-home.mjs';
import { hasDrySupport } from './expedition-navigation.mjs';
import { withCompanion } from './expedition-nether.mjs';

const END = 'minecraft:the_end';
const DOG = 'mushroom_yorkie:mushroom_yorkie';
const COBBLE = 'minecraft:cobblestone';
const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const tile = pos => pos.map(Math.floor);
const offset = ([x, y, z], dx, dy, dz) => [x + dx, y + dy, z + dz];
const close = (a, b) => Math.hypot(...a.map((n, i) => n - b[i]));

export function planEndCamp(cells, dogPosition, player) {
  const dog = tile(dogPosition);
  const blocks = new Map(cells.filter(({ b }) => !/^minecraft:(?:air|cave_air|void_air)$/.test(b))
    .map(({ x, y, z, b }) => [String([x, y, z]), b]));
  const at = pos => blocks.get(String(pos));
  const above = (pos, y) => offset(pos, 0, y, 0);
  const supported = pos => hasDrySupport(at(above(pos, -1)));
  const open = pos => !at(pos) && !at(above(pos, 1)) && supported(pos);
  const spaceFromDog = ([x, , z]) => Math.max(x - dogPosition[0], dogPosition[0] - x - 1,
    z - dogPosition[2], dogPosition[2] - z - 1) >= 0.38;
  const neighbors = pos => SIDES.map(([dx, dz]) => offset(pos, dx, 0, dz));
  const canSupportRoof = pos => supported(pos) && spaceFromDog(pos) && [0, 1, 2].every(y => {
    const block = at(above(pos, y));
    return !block || hasDrySupport(block);
  });
  if (!open(dog)) return null;

  const plans = [];
  for (const mat of neighbors(dog).filter(pos => open(pos) && spaceFromDog(pos))) {
    const roof = [above(dog, 2), above(mat, 2)];
    if (roof.some(pos => at(pos) && !hasDrySupport(at(pos)))) continue;
    const outside = [...neighbors(dog), ...neighbors(mat)].filter(pos => close(pos, dog) && close(pos, mat));
    for (const wall of neighbors(dog).filter(pos => close(pos, mat) && canSupportRoof(pos))) {
      for (const side of neighbors(mat).filter(canSupportRoof)) {
        const placements = [...[wall, side].flatMap(pos => [pos, above(pos, 1), above(pos, 2)]), ...roof]
          .filter(pos => !at(pos));
        for (const entrance of outside.filter(pos => open(pos) && close(pos, wall) && close(pos, side))) {
          if (placements.some(pos => close(pos, entrance) > 4.1)) continue;
          plans.push({ mat, entrance, placements });
        }
      }
    }
  }
  return plans.sort((a, b) => a.placements.length - b.placements.length
    || close(a.entrance, player) - close(b.entrance, player))[0] ?? null;
}

export async function shelterAtEndArrival(action, uuid, report) {
  await withCompanion(action, END, uuid);
  await action('set_reflexes', { autoDefend: false, waterLanding: true });
  const observeDog = async () => (await action('get_entities', { type: DOG, radius: 24 }))?.entities
    .find(entity => entity.uuid === uuid && entity.health > 0);
  for (let attempt = 0; attempt < 18; attempt++) {
    const player = await action('observe');
    assert.ok(player?.onGround && player.health >= 12, 'End camp construction needs safe footing');
    const owner = [player.position.x, player.position.y, player.position.z].map(Math.floor);
    const dog = await observeDog();
    const area = await action('get_blocks', { center: owner, size: [11, 9, 11], format: 'json' });
    const plan = dog && dog.distance < 4 && area && !area.stats?.unloadedChunks
      ? planEndCamp(area.cells, dog.pos, owner) : null;
    if (!plan) {
      await setTimeout(250);
      continue;
    }
    await useEmptyHandOnCompanion(action, uuid);
    const stopped = await observeDog();
    assert.deepEqual(stopped && tile(stopped.pos), tile(dog.pos), 'Mushroom moved from the camp footing');
    const reached = await action('go_to', { pos: plan.entrance, stopDistance: 0.3, maxTicks: 36 });
    assert.ok(reached?.arrived, 'Could not reach the supported End camp entrance');
    if (plan.placements.length) await hold(action, COBBLE);
    for (const pos of plan.placements) {
      let placed;
      for (let retry = 0; retry < 3 && placed !== COBBLE; retry++) {
        placed = (await action('place_block', { pos }))?.blockAtPos;
        if (placed !== COBBLE) await setTimeout(150);
      }
      assert.equal(placed, COBBLE, `Could not build End cover at ${pos}`);
    }
    const mat = await markExpeditionCamp(action, plan.mat);
    const parked = await observeDog();
    assert.deepEqual(parked && tile(parked.pos), tile(stopped.pos), 'Mushroom left the covered End camp');
    const camp = { mat, shelter: tile(parked.pos) };
    await report('sheltered', { ...camp, health: parked.health });
    return camp;
  }
  throw new Error('Could not find enough supported space around Mushroom to build an End camp');
}
