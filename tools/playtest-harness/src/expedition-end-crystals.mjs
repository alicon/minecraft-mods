import { setTimeout } from 'node:timers/promises';
import { hold } from './expedition-home.mjs';
import { bowAim } from './expedition-ballistics.mjs';

const CRYSTAL = 'minecraft:end_crystal';
const DOG = 'mushroom_yorkie:mushroom_yorkie';
const BOW = 'minecraft:bow';

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
    .map(crystal => ({ crystal, aim: bowAim(player, [crystal.pos[0], crystal.pos[1] + 1, crystal.pos[2]]) }))
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
