import { LocationInUnloadedChunkError, LocationOutOfWorldBoundariesError } from "@minecraft/server";

const HAZARDS = new Set([
  "minecraft:cactus", "minecraft:campfire", "minecraft:end_gateway", "minecraft:end_portal", "minecraft:fire",
  "minecraft:lava", "minecraft:magma", "minecraft:portal", "minecraft:powder_snow", "minecraft:soul_campfire",
  "minecraft:soul_fire", "minecraft:sweet_berry_bush", "minecraft:wither_rose", "minecraft:flowing_lava",
]);

function dryAir(dimension, position) {
  const block = dimension.getBlock(position);
  return block?.isAir && !block.isWaterlogged;
}

function safeTile(dimension, x, y, z) {
  try {
    if (!dryAir(dimension, { x, y, z }) || !dryAir(dimension, { x, y: y + 1, z })) {
      return false;
    }
    const floor = dimension.getBlock({ x, y: y - 1, z });
    if (!floor || floor.isAir || floor.isLiquid || floor.isWaterlogged || HAZARDS.has(floor.typeId)) {
      return false;
    }
    const support = dimension.getBlockFromRay({ x: x + 0.5, y: y + 0.5, z: z + 0.5 }, { x: 0, y: -1, z: 0 }, {
      maxDistance: 1.5, includePassableBlocks: false, includeLiquidBlocks: false,
    });
    if (support?.block.y !== y - 1) {
      return false;
    }
    for (const [dx, dz] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
      const side = dimension.getBlock({ x: x + dx, y, z: z + dz });
      if (!side || HAZARDS.has(side.typeId)) {
        return false;
      }
    }
    return true;
  } catch (error) {
    if (error instanceof LocationInUnloadedChunkError || error instanceof LocationOutOfWorldBoundariesError) {
      return false;
    }
    throw error;
  }
}

/** Find a supported two-block-high space beside the target, prioritizing the same floor. */
export function safeLanding(target, travelerId) {
  const { dimension, location } = target;
  const x = Math.floor(location.x);
  const y = Math.floor(location.y);
  const z = Math.floor(location.z);
  const players = dimension.getPlayers({ location, maxDistance: 6 })
    .filter((member) => member.id !== travelerId).map((member) => member.location);
  for (const rise of [0, 1, -1, 2, -2]) {
    for (let radius = 1; radius <= 3; ++radius) {
      for (let dx = -radius; dx <= radius; ++dx) {
        for (let dz = -radius; dz <= radius; ++dz) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) {
            continue;
          }
          const candidate = { x: x + dx + 0.5, y: y + rise, z: z + dz + 0.5 };
          const occupied = players.some((position) => Math.abs(position.y - candidate.y) < 1.8
            && Math.hypot(position.x - candidate.x, position.z - candidate.z) < 0.9);
          if (!occupied && safeTile(dimension, x + dx, y + rise, z + dz)) {
            return candidate;
          }
        }
      }
    }
  }
  return undefined;
}
