import { blockAt, distanceSquared, hasDrySupport } from "./home-blocks.js";

const LOOK_AHEAD = 0.65;
const STEP_SPEED = 0.20;
const CANDIDATE_ANGLES = [0, 35, -35, 65, -65].map((degrees) => degrees * Math.PI / 180);

// These plants have no collision. Keep the list explicit so fences, slabs,
// closed doors and berry bushes cannot become clear just because they are not full blocks.
const WALK_THROUGH_PLANTS = new Set([
  "minecraft:short_grass", "minecraft:tall_grass", "minecraft:short_dry_grass",
  "minecraft:tall_dry_grass", "minecraft:fern", "minecraft:large_fern",
]);

function hasClearance(block) {
  return block && (block.isAir || (WALK_THROUGH_PLANTS.has(block.typeId) && !block.isWaterlogged));
}

function safeFeet(dimension, feet, wetAllowed) {
  const at = blockAt(dimension, feet);
  const above = blockAt(dimension, { ...feet, y: Math.floor(feet.y) + 1 });
  if (!at || !hasClearance(above) || !hasDrySupport(dimension, feet)) {
    return false;
  }
  if (hasClearance(at)) {
    return true;
  }
  return wetAllowed && (at.typeId === "minecraft:water" || at.typeId === "minecraft:flowing_water");
}

export function reachableToy(dimension, position) {
  return safeFeet(dimension, position, true) || safeFeet(dimension, { ...position, y: position.y - 1 }, true);
}

export function dryDropSpot(dimension, location) {
  return safeFeet(dimension, location, false);
}

export function nudgeToward(pup, destination) {
  const { location, dimension } = pup;
  if (Math.abs(location.y - destination.y) > 1.25 || (!pup.isOnGround && !pup.isInWater)) {
    return false;
  }
  const bearing = Math.atan2(destination.z - location.z, destination.x - location.x);
  const distance = distanceSquared(location, destination);
  const step = Math.min(LOOK_AHEAD, Math.hypot(destination.x - location.x, destination.z - location.z));
  for (const offset of CANDIDATE_ANGLES) {
    const x = Math.cos(bearing + offset);
    const z = Math.sin(bearing + offset);
    const next = { x: location.x + x * step, y: location.y, z: location.z + z * step };
    if (distanceSquared(next, destination) >= distance || !safeFeet(dimension, next, true)) {
      continue;
    }
    const blocked = dimension.getBlockFromRay(
      { ...location, y: location.y + 0.25 }, { x, y: 0, z },
      { maxDistance: step, includeLiquidBlocks: false, includePassableBlocks: false },
    );
    if (blocked) {
      continue;
    }
    const velocity = pup.getVelocity();
    pup.setRotation({ x: 0, y: Math.atan2(-x, z) * 180 / Math.PI });
    pup.applyImpulse({
      x: x * STEP_SPEED - velocity.x,
      y: pup.isInWater ? 0.04 : 0,
      z: z * STEP_SPEED - velocity.z,
    });
    return true;
  }
  return false;
}
