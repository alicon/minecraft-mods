import { setTimeout } from 'node:timers/promises';
import { hold } from './expedition-home.mjs';

const CRYSTAL = 'minecraft:end_crystal';
const DOG = 'mushroom_yorkie:mushroom_yorkie';
const BOW = 'minecraft:bow';
const FULL_DRAW_SPEED = 3;
const AIR_DRAG = 0.99;
const ARROW_GRAVITY = 0.05;

function bowAim(player, target) {
  const dx = target[0] - player.position.x;
  const dy = target[1] + 1 - (player.position.y + 1.52);
  const dz = target[2] - player.position.z;
  const range = Math.hypot(dx, dz);

  for (let ticks = 1; ticks <= 45; ticks++) {
    // Arrow velocity decays each tick. Solve for the launch speed at which
    // the arrow reaches the crystal's hitbox, using the first (lower) arc.
    const travel = (1 - AIR_DRAG ** ticks) / (1 - AIR_DRAG);
    const horizontal = range / travel;
    const vertical = (dy + ARROW_GRAVITY * (ticks - travel) / (1 - AIR_DRAG)) / travel;
    if (Math.hypot(horizontal, vertical) <= FULL_DRAW_SPEED) {
      return { yaw: Math.atan2(-dx, dz) * 180 / Math.PI,
        pitch: -Math.atan2(vertical, horizontal) * 180 / Math.PI };
    }
  }
  return null;
}

export async function shootEndCrystal(action, uuid) {
  const player = await action('observe');
  if (player?.dimension !== 'minecraft:the_end' || !player.onGround || player.health < 12) return null;
  const dogs = await action('get_entities', { type: DOG, radius: 48 });
  const dog = dogs?.entities.find(entity => entity.uuid === uuid && entity.health > 0);
  if (!dog) return null;
  const crystals = await action('get_entities', { type: CRYSTAL, radius: 80 });
  const shot = crystals?.entities
    // The caller shelters Mushroom before the fight. Leave a margin beyond
    // the crystal's blast reach for the player and the original dog.
    .filter(crystal => crystal.distance >= 14 && Math.hypot(...crystal.pos.map((n, axis) => n - dog.pos[axis])) >= 14)
    .map(crystal => ({ crystal, aim: bowAim(player, crystal.pos) }))
    .find(candidate => candidate.aim);
  if (!shot) return null;

  await hold(action, BOW);
  if (!await action('look', shot.aim)) return null;
  if (!(await action('use_item', { ticks: 24 }))?.completed) return null;
  for (let check = 0; check < 16; check++) {
    const view = await action('get_entities', { type: CRYSTAL, radius: 80 });
    if (view && !view.entities.some(entity => entity.uuid === shot.crystal.uuid)) return shot.crystal.uuid;
    await setTimeout(150);
  }
  return null;
}
