import { setTimeout } from 'node:timers/promises';
import { dryWaypoint } from './expedition-navigation.mjs';

const DOG = 'mushroom_yorkie:mushroom_yorkie';
const SWORDS = ['minecraft:iron_sword', 'minecraft:stone_sword', 'minecraft:wooden_sword'];
const distance = (from, to) => Math.hypot(...from.map((axis, index) => axis - to[index]));

export async function defendCompanion(action, player, dogUuid) {
  const snapshot = await action('get_entities', { radius: 24, max: 128 });
  const dog = snapshot?.entities.find(entity => entity.type === DOG && entity.uuid === dogUuid);
  if (!dog) return false;
  const injured = dog.recentlyHurt || dog.health <= 8;
  let threats = snapshot.entities.filter(entity => entity.hostile);
  const creeper = threats.filter(entity => entity.type === 'minecraft:creeper'
    && (distance(entity.pos, dog.pos) <= 5 || (injured || dog.distance <= 6) && entity.distance <= 7))
    .sort((a, b) => a.distance - b.distance)[0];
  if (creeper) {
    await action('stop', { closeScreen: Boolean(player.screen) });
    await retreat(action, player, creeper);
    return true;
  }
  if (!injured) return false;
  let attacker = threats.filter(entity => entity.type !== 'minecraft:creeper' && distance(entity.pos, dog.pos) <= 4.5)
    .sort((a, b) => distance(a.pos, dog.pos) - distance(b.pos, dog.pos))[0];
  if (!attacker) return false;

  await action('stop', { closeScreen: Boolean(player.screen) });
  if (player.health < 7) {
    if (dog.distance <= 4) await retreat(action, player, attacker);
    return true;
  }

  if (attacker.distance > 4.25) {
    await approach(action, attacker, dog.pos);
    // Finish the defense on this interrupt when the walk reaches melee range.
    // A new planning turn can lose the target when the mob moves around the dog.
    const view = await action('get_entities', { radius: 24, max: 128 });
    const nearbyDog = view?.entities.find(entity => entity.uuid === dogUuid && entity.health > 0);
    if (!nearbyDog) return true;
    threats = view.entities.filter(entity => entity.hostile);
    attacker = threats.find(entity => entity.id === attacker.id
      && entity.distance <= 4.25 && distance(entity.pos, nearbyDog.pos) <= 4.5);
    if (!attacker) return true;
  }
  const inventory = await action('get_inventory');
  const sword = SWORDS.map(id => inventory?.slots.find(stack => stack.id === id && stack.slot < 9)).find(Boolean);
  if (sword && sword.slot !== inventory.selectedSlot) await action('select_slot', { slot: sword.slot });
  let aimed = await aimAtAttacker(action, attacker.id);
  const obstruction = aimed?.crosshair;
  if (obstruction?.pos && /^minecraft:(?:short_grass|tall_grass|fern|large_fern)$/.test(obstruction.block ?? '')
      && (await action('break_block', { pos: obstruction.pos, maxTicks: 8 }))?.broken) {
    // The plant swing also spends the server-side sword cooldown.
    await setTimeout(650);
    aimed = await aimAtAttacker(action, attacker.id);
  }
  const target = aimed?.crosshair?.id;
  // In a narrow passage a second hostile can block the swing at the dog's attacker.
  const blocker = threats.find(entity => entity.id === target && entity.distance <= 3
    && entity.type !== 'minecraft:creeper');
  if ((target === attacker.id || blocker) && aimed.attackStrength >= 0.88) {
    await action('attack_entity', { entityId: target });
  }
  return true;
}

async function aimAtAttacker(action, entityId) {
  if (!await action('look', { entityId })) return null;
  await setTimeout(110);
  return action('observe');
}

async function approach(action, attacker, dogPosition) {
  const direct = await action('go_to', { entityId: attacker.id, stopDistance: 2.3, maxTicks: 24 });
  // Native walking can report horizontal arrival on a different floor.
  const wrongFloor = direct?.arrived && Math.abs(direct.position?.[1] - attacker.pos[1]) > 2;
  if (!wrongFloor && !direct?.reason?.startsWith('blocked by ')) return;
  const player = await action('observe');
  if (!player?.inWorld || !player.onGround || player.dead || player.inWater || player.health < 7) return;
  const { x, y, z } = player.position;
  const start = [x, y, z].map(Math.floor);
  const local = await action('get_blocks', { center: start, size: [23, 15, 23], format: 'json' });
  const waypoint = local && !local.stats?.unloadedChunks
    && dryWaypoint(local.cells, start, [start], dogPosition, 'elevation');
  if (waypoint) await action('go_to', { pos: waypoint, stopDistance: 0.3, maxTicks: 24 });
}

async function retreat(action, player, threat) {
  const { x, y, z } = player.position;
  const start = [x, y, z].map(Math.floor);
  const [dx, , dz] = [x, y, z].map((axis, index) => axis - threat.pos[index]);
  const goal = [start[0] + Math.sign(dx) * 6, start[1], start[2] + Math.sign(dz) * 6];
  const local = await action('get_blocks', { center: start, size: [15, 7, 15], format: 'json' });
  const waypoint = local && dryWaypoint(local.cells, start, [start], goal, undefined, new Set(), threat.pos);
  if (waypoint && distance(waypoint, threat.pos) > distance(start, threat.pos)) {
    await action('go_to', { pos: waypoint, stopDistance: 0.3, maxTicks: 24 });
  }
}
