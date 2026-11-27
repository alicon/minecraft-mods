import { BlockVolume, LocationInUnloadedChunkError, LocationOutOfWorldBoundariesError } from "@minecraft/server";
import { BED, HOUSE } from "./yorkie.js";

const DOORS = {
  north: { x: 0, z: -1 },
  south: { x: 0, z: 1 },
  east: { x: 1, z: 0 },
  west: { x: -1, z: 0 },
};
const DANGEROUS_EXPEDITION_FLOOR = new Set([
  "minecraft:magma", "minecraft:magma_block", "minecraft:cactus",
  "minecraft:campfire", "minecraft:soul_campfire", "minecraft:powder_snow",
  "minecraft:lava", "minecraft:flowing_lava", "minecraft:fire", "minecraft:soul_fire",
  "minecraft:portal", "minecraft:nether_portal", "minecraft:end_portal",
  "minecraft:end_gateway", "minecraft:pointed_dripstone", "minecraft:sweet_berry_bush",
]);

export function blockAt(dimension, location) {
  try {
    return dimension.getBlock(location);
  } catch (error) {
    if (error instanceof LocationInUnloadedChunkError || error instanceof LocationOutOfWorldBoundariesError) {
      return undefined;
    }
    throw error;
  }
}

export function nearbyBlocks(dimension, location, radius, includeTypes) {
  const { min, max } = dimension.heightRange;
  const x = Math.floor(location.x);
  const y = Math.floor(location.y);
  const z = Math.floor(location.z);
  const minY = Math.max(min, y - 2);
  const maxY = Math.min(max - 1, y + 2);
  if (minY > maxY) {
    return [];
  }
  const volume = new BlockVolume(
    { x: x - radius, y: minY, z: z - radius },
    { x: x + radius, y: maxY, z: z + radius },
  );
  const found = dimension.getBlocks(volume, { includeTypes }, true);
  return Array.from(found.getBlockLocationIterator(), (position) => blockAt(dimension, position))
    .filter((block) => block && includeTypes.includes(block.typeId) && !block.isWaterlogged);
}

export function centerOf(block) {
  const { x, y, z } = block.location;
  return { x: x + 0.5, y, z: z + 0.5 };
}

export function distanceSquared(from, to) {
  return (from.x - to.x) ** 2 + (from.y - to.y) ** 2 + (from.z - to.z) ** 2;
}

export function hasDrySupport(dimension, location) {
  const support = blockAt(dimension, { ...location, y: Math.floor(location.y) - 1 });
  return Boolean(support && !support.isAir && !support.isLiquid && !support.isWaterlogged
    && dimension.getBlockBelow(support.location, { maxDistance: 1 })?.y === support.y);
}

export function hasSafeExpeditionSupport(dimension, location) {
  const support = blockAt(dimension, { ...location, y: Math.floor(location.y) - 1 });
  return Boolean(support && !isExpeditionHazard(support) && hasDrySupport(dimension, location));
}

export function isExpeditionHazard(block) {
  return Boolean(block && DANGEROUS_EXPEDITION_FLOOR.has(block.typeId));
}

export function restSpot(block) {
  if (!block || (block.typeId !== BED && block.typeId !== HOUSE) || block.isWaterlogged) {
    return undefined;
  }
  const { dimension } = block;
  const center = centerOf(block);
  const above = blockAt(dimension, { ...center, y: center.y + 1 });
  if (!hasDrySupport(dimension, center) || !above?.isAir) {
    return undefined;
  }
  const door = DOORS[block.permutation.getState("minecraft:cardinal_direction")] ?? DOORS.north;
  if (block.typeId === HOUSE) {
    const entrance = blockAt(dimension, { x: center.x + door.x, y: center.y, z: center.z + door.z });
    if (!entrance?.isAir) {
      return undefined;
    }
  }
  const location = { ...center, y: center.y + (block.typeId === HOUSE ? 2 : 3) / 16 };
  return {
    location,
    facingLocation: { x: center.x + door.x, y: location.y, z: center.z + door.z },
  };
}
