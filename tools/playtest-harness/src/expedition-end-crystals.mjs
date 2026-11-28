import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';
import { hold, stepOut } from './expedition-home.mjs';
import { bowAim } from './expedition-ballistics.mjs';
import { openCrystalCage } from './expedition-end-cage.mjs';

const CRYSTAL = 'minecraft:end_crystal';
const DOG = 'mushroom_yorkie:mushroom_yorkie';
const BOW = 'minecraft:bow';
const END = 'minecraft:the_end';
const SPIKE_COUNT = 10;
const feet = ({ position: { x, y, z } }) => [x, y, z].map(Math.floor);
const distance = (first, second) => Math.hypot(...first.map((coordinate, axis) => coordinate - second[axis]));

async function dragonBreathThreat(action) {
  const clouds = await action('get_entities', { type: 'minecraft:area_effect_cloud', radius: 14, max: 8 });
  const cloud = clouds?.entities.find(entity => entity.distance < 8);
  if (cloud) return cloud;
  const shots = await action('get_entities', { type: 'minecraft:dragon_fireball', radius: 30, max: 8 });
  return shots?.entities.find(entity => entity.distance < 28);
}

async function fireAtCrystal(action, shot, radius, startingHealth) {
  await hold(action, BOW);
  if (!await action('look', shot.aim)) return null;
  const fired = await action('use_item', { ticks: 24 });
  if (!fired?.completed) return null;
  const interrupted = Number.isFinite(startingHealth) && fired.health <= startingHealth - 3;
  for (let check = 0; check < 16; check++) {
    const view = await action('get_entities', { type: CRYSTAL, radius });
    if (view && !view.entities.some(entity => entity.uuid === shot.crystal.uuid)) return shot.crystal.uuid;
    if (interrupted) return null;
    if (Number.isFinite(startingHealth) && check % 2 === 0 && await dragonBreathThreat(action)) return null;
    await setTimeout(150);
  }
  return null;
}

export async function shootEndCrystal(action, uuid) {
  const player = await action('observe');
  if (player?.dimension !== END || !player.onGround || player.health < 12) return null;
  const dogs = await action('get_entities', { type: DOG, radius: 48 });
  const dog = dogs?.entities.find(entity => entity.uuid === uuid && entity.health > 0);
  if (!dog) return null;
  const crystals = await action('get_entities', { type: CRYSTAL, radius: 80 });
  const shot = crystals?.entities
    // The caller shelters Mushroom before the fight. Leave a margin beyond
    // the crystal's blast reach for the player and the original dog.
    .filter(crystal => crystal.distance >= 14 && distance(crystal.pos, dog.pos) >= 14)
    .map(crystal => ({ crystal, aim: bowAim(player, [crystal.pos[0], crystal.pos[1] + 1, crystal.pos[2]]) }))
    .find(candidate => candidate.aim);
  return shot ? fireAtCrystal(action, shot, 80) : null;
}

export async function clearGeneratedCrystals(action, uuid, report) {
  const dogs = await action('get_entities', { type: DOG, radius: 32 });
  const dog = dogs?.entities.find(entity => entity.uuid === uuid && entity.health > 0);
  assert.ok(dog, 'The original companion must be at the marked camp before attacking the crystals');
  const { entities } = await action('get_entities', { type: CRYSTAL, radius: 128 });
  assert.ok(entities.length > 0, 'No generated crystals are visible from the End camp');
  const seen = new Map(entities.map(crystal => [crystal.uuid, crystal]));
  const broken = new Set();
  const positionsTried = new Set();
  const misses = new Map();
  const cageStatus = new Map();
  const openedCages = new Map();
  const visited = [];
  const rejected = new Set();
  let destination;
  let detourSteps = 0;
  let nextRecovery = 0;
  let nextCageAttempt = 0;

  for (let attempt = 0; attempt < 160 && broken.size < SPIKE_COUNT; attempt++) {
    const player = await action('observe');
    assert.ok(player?.inWorld && !player.dead && player.dimension === END && player.health >= 4,
      'The player became unsafe while clearing the End crystals');
    if (!player.onGround) {
      await setTimeout(200);
      continue;
    }
    const here = feet(player);
    let danger = await dragonBreathThreat(action);
    if (!danger && player.health < 16) {
      const dragons = await action('get_entities', { type: 'minecraft:ender_dragon', radius: 24, max: 4 });
      danger = dragons?.entities.find(dragon => dragon.distance < 15);
    }
    if (danger) {
      const retreat = [here[0] + 8 * Math.sign(player.position.x - danger.pos[0]), here[1],
        here[2] + 8 * Math.sign(player.position.z - danger.pos[2])];
      // The last dry route is useful cover when a fireball is inbound.
      // Ignore ordinary scouting repeat penalties while leaving its path.
      const restoreInterrupt = (await action('set_reflexes'))?.interruptOnDamage;
      if (restoreInterrupt) await action('set_reflexes', { interruptOnDamage: false });
      try {
        await stepOut(action, player, [], retreat, 'surface', new Set(), undefined, danger.pos);
      } finally {
        if (restoreInterrupt) await action('set_reflexes', { interruptOnDamage: true });
      }
      continue;
    }
    if (player.health < 16 && player.gameTime >= nextRecovery) {
      const inventory = await action('get_inventory');
      if (inventory.slots.some(stack => stack.id === 'minecraft:golden_apple')) {
        await action('look', { pitch: 50 });
        await hold(action, 'minecraft:golden_apple');
        await action('use_item', { ticks: 36 });
        nextRecovery = player.gameTime + 160;
        continue;
      }
    }

    const group = [Math.floor(here[0] / 6), Math.floor(here[2] / 6)].join(',');
    const view = await action('get_entities', { type: CRYSTAL, radius: 128 });
    for (const crystal of view?.entities ?? []) {
      seen.set(crystal.uuid, crystal);
      if (cageStatus.has(crystal.uuid)) continue;
      const terrain = await action('get_blocks', { center: crystal.pos.map(Math.floor), size: [5, 5, 5], format: 'json' });
      if (terrain && !terrain.stats?.unloadedChunks) {
        cageStatus.set(crystal.uuid, terrain.cells.some(cell => cell.b === 'minecraft:iron_bars'));
      }
    }
    const candidates = (view?.entities ?? []).filter(crystal => !broken.has(crystal.uuid))
      .map(crystal => ({ crystal, range: distance(crystal.pos, here),
      key: `${crystal.uuid}:${group}`, aim: bowAim(player, [crystal.pos[0], crystal.pos[1] + 1, crystal.pos[2]]) }))
      .filter(shot => distance(shot.crystal.pos, dog.pos) >= 14)
      .sort((a, b) => (misses.get(a.crystal.uuid) ?? 0) - (misses.get(b.crystal.uuid) ?? 0) || a.range - b.range);
    const guarded = candidates.filter(({ crystal }) => cageStatus.get(crystal.uuid) && !openedCages.has(crystal.uuid));
    const activeWindow = candidates.find(({ crystal }) => openedCages.has(crystal.uuid));
    const vantage = activeWindow && openedCages.get(activeWindow.crystal.uuid);
    const shot = candidates.find(candidate => {
      const id = candidate.crystal.uuid;
      if (!candidate.aim || candidate.range < 14 || positionsTried.has(candidate.key)) return false;
      if (!cageStatus.get(id)) return !activeWindow;
      return id === activeWindow?.crystal.uuid && Math.hypot(here[0] - vantage[0], here[2] - vantage[2]) <= 3;
    });
    if (shot && detourSteps === 0) {
      positionsTried.add(shot.key);
      const destroyed = await fireAtCrystal(action, shot, 128, player.health);
      await report({ crystal: shot.crystal, position: here, destroyed: Boolean(destroyed) });
      if (destroyed) broken.add(destroyed);
      else misses.set(shot.crystal.uuid, (misses.get(shot.crystal.uuid) ?? 0) + 1);
      continue;
    }

    if (!vantage && guarded.length && broken.size >= 5 && player.health >= 16 && player.gameTime >= nextCageAttempt) {
      const { crystal } = guarded.sort((a, b) => a.range - b.range)[0];
      nextCageAttempt = player.gameTime + 400;
      const line = await openCrystalCage(action, player, crystal, () => dragonBreathThreat(action));
      if (line) {
        openedCages.set(crystal.uuid, line);
        await report({ crystal, position: line, openedCage: true });
        detourSteps = 0;
        continue;
      }
      continue;
    }

    const next = candidates[0]?.crystal;
    if (detourSteps === 0 || !destination) {
      if (vantage) {
        destination = [vantage[0], here[1], vantage[2]];
      } else if (next) {
        // Move around the spike to get a different sightline, then measure again.
        const angle = Math.atan2(here[2] - next.pos[2], here[0] - next.pos[0]) + Math.PI / 3;
        destination = [Math.floor(next.pos[0] + 24 * Math.cos(angle)), here[1],
          Math.floor(next.pos[2] + 24 * Math.sin(angle))];
      } else {
        // Client tracking can hide the opposite side of the island from camp.
        const surveyed = [...seen.values()];
        destination = [Math.floor(surveyed.reduce((sum, crystal) => sum + crystal.pos[0], 0) / surveyed.length),
          here[1], Math.floor(surveyed.reduce((sum, crystal) => sum + crystal.pos[2], 0) / surveyed.length)];
      }
      detourSteps = 5;
    }
    visited.push(here);
    await stepOut(action, player, visited, destination, 'surface', rejected);
    detourSteps--;
  }
  assert.equal(broken.size, SPIKE_COUNT, 'Some generated End crystals are still intact');
}
