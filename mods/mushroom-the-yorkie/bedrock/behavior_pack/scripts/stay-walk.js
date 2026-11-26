import { world } from "@minecraft/server";
import { blockAt, distanceSquared, hasDrySupport } from "./home-blocks.js";
import { FLIGHT_MODE, WALKING_AFTER_STAY, storage } from "./yorkie.js";

const STAY_RADIUS_SQUARED = 32 ** 2;
const WALK_RADIUS_SQUARED = 60 ** 2;
const MAX_VISITS = 256;
const NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BARRIER = /(?:_?door|_?trapdoor|_?fence(?:_gate)?|_wall)$/;
const OPEN_BARRIER = /(?:_?door|_?fence_gate)$/;
const routes = new Map();
world.afterEvents.entityRemove.subscribe(({ removedEntityId }) => routes.delete(removedEntityId));

function openSpace(dimension, location) {
  const block = blockAt(dimension, location);
  if (!block || block.isWaterlogged) {
    return false;
  }
  if (block.isAir) {
    return true;
  }
  if (!OPEN_BARRIER.test(block.typeId) || block.typeId.endsWith("trapdoor")) {
    return false;
  }
  const lower = block.permutation.getState("upper_block_bit")
    ? blockAt(dimension, { ...location, y: location.y - 1 }) : block;
  return lower?.typeId === block.typeId && lower.permutation.getState("open_bit") === true;
}

function groundCell(dimension, location) {
  const support = blockAt(dimension, { ...location, y: location.y - 1 });
  return support && !BARRIER.test(support.typeId) && hasDrySupport(dimension, location)
    && openSpace(dimension, location) && openSpace(dimension, { ...location, y: location.y + 1 });
}

function blockPosition({ x, y, z }) {
  return { x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) };
}

function walkingRoute(dimension, from, to) {
  const start = blockPosition(from);
  const target = blockPosition(to);
  const queue = [{ cell: start, previous: undefined }];
  const visited = new Set([`${start.x},${start.y},${start.z}`]);
  // Prefer blocks near the owner but allow turns around walls. Unloaded
  // chunks and searches beyond this visit budget preserve the sit order.
  for (let visits = 0; queue.length && visits < MAX_VISITS; visits++) {
    queue.sort((a, b) => distanceSquared(b.cell, target) - distanceSquared(a.cell, target));
    const node = queue.pop();
    const current = node.cell;
    if (distanceSquared(current, target) === 0) {
      const path = [];
      for (let step = node; step.previous; step = step.previous) {
        path.push(step.cell);
      }
      return { path: path.reverse(), target };
    }
    for (const [dx, dz] of NEIGHBORS) {
      for (const dy of [0, 1, -1]) {
        const next = { x: current.x + dx, y: current.y + dy, z: current.z + dz };
        const key = `${next.x},${next.y},${next.z}`;
        if (visited.has(key) || distanceSquared(start, next) > WALK_RADIUS_SQUARED) {
          continue;
        }
        if (dy === 1 && !openSpace(dimension, { ...current, y: current.y + 1 })) {
          continue;
        }
        visited.add(key);
        if (groundCell(dimension, next)) {
          queue.push({ cell: next, previous: node });
          break;
        }
      }
    }
  }
  return undefined;
}

function steer(pet, route) {
  const { x, y, z } = pet.location;
  const next = route.path[0];
  const dx = next.x + 0.5 - x;
  const dz = next.z + 0.5 - z;
  const horizontal = Math.hypot(dx, dz);
  if (horizontal < 0.25 && Math.abs(next.y - y) < 0.25) {
    route.path.shift();
    return;
  }
  // The impulse carries over several ticks. Taper it near the center so
  // the dog can settle on a waypoint before turning to the next block.
  const step = Math.min(0.28, horizontal * 0.30) / Math.max(horizontal, 0.01);
  const velocity = pet.getVelocity();
  pet.applyImpulse({
    x: dx * step - velocity.x,
    y: next.y > y + 0.5 ? 0.42 : 0,
    z: dz * step - velocity.z,
  });
  pet.setRotation({ x: 0, y: Math.atan2(-dx, dz) * 180 / Math.PI });
}

export function updateStayWalk(pet, owner, distance, checkRoute) {
  const walking = pet.getProperty(WALKING_AFTER_STAY);
  if (!walking && (!checkRoute || distance <= STAY_RADIUS_SQUARED)) {
    return;
  }
  if (pet.getProperty(FLIGHT_MODE) !== "ground") {
    return;
  }
  const sitting = pet.getProperty(storage("ordered_sit"));
  const eligible = distance <= WALK_RADIUS_SQUARED && owner.isOnGround && !owner.isFlying && !owner.isSleeping
    && pet.getProperty(storage("home_goal")) === "idle" && !pet.getComponent("minecraft:leashable")?.isLeashed;
  if (walking) {
    if (sitting || distance <= 4 ** 2) {
      routes.delete(pet.id);
      pet.triggerEvent(storage("finish_stay_walk"));
      return;
    }
    if (!eligible || !pet.isOnGround || !pet.getComponent("minecraft:is_tamed")) {
      return;
    }
    const route = routes.get(pet.id);
    if (route?.path.length && groundCell(pet.dimension, route.path[0])) {
      if (checkRoute && distanceSquared(route.target, blockPosition(owner.location)) > 2) {
        routes.delete(pet.id);
      } else {
        steer(pet, route);
      }
    } else if (checkRoute) {
      const replacement = walkingRoute(pet.dimension, pet.location, owner.location);
      if (replacement?.path.length) {
        routes.set(pet.id, replacement);
      }
    }
    return;
  }
  if (!sitting || !eligible || !pet.isOnGround) {
    return;
  }
  const route = walkingRoute(pet.dimension, pet.location, owner.location);
  if (!route?.path.length) {
    return;
  }
  routes.set(pet.id, route);
  // Reinstall the tamed group to clear the engine's sit flag. The engine
  // retains the original tame owner and continues using native interactions.
  pet.triggerEvent(storage("leave_stay"));
}
