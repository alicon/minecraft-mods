import { GameMode, InvalidEntityError, system, world } from "@minecraft/server";
import { distanceSquared } from "./home-blocks.js";
import { FLIGHT_MODE, YORKIE, storage } from "./yorkie.js";

const FOLLOW_RANGE_SQUARED = 48 ** 2;
const TRAIL_DISTANCE = 1.4;
const TRAIL_HEIGHT = 0.65;
const HOVER_DISTANCE = 0.35;
const MAX_FLIGHT_SPEED = 0.62; // Blocks per tick.
const LANDING_SPEED = 0.20;

function canFollowByAir(pup, owner) {
  return owner?.isValid && owner.dimension.id === pup.dimension.id
    && owner.getGameMode() === GameMode.Creative && owner.isFlying
    && !pup.getProperty(storage("ordered_sit"))
    && pup.getProperty(storage("home_goal")) !== "sleep"
    && !pup.getComponent("minecraft:leashable")?.isLeashed
    && !pup.getComponent("minecraft:riding")
    && distanceSquared(pup.location, owner.location) <= FOLLOW_RANGE_SQUARED;
}

function followByAir(pup, owner) {
  const position = pup.location;
  const destination = owner.location;
  const yaw = owner.getRotation().y * Math.PI / 180;
  const dx = destination.x + Math.sin(yaw) * TRAIL_DISTANCE - position.x;
  const dy = destination.y - TRAIL_HEIGHT - position.y;
  const dz = destination.z - Math.cos(yaw) * TRAIL_DISTANCE - position.z;
  const distance = Math.hypot(dx, dy, dz);

  pup.clearVelocity();
  if (distance > HOVER_DISTANCE) {
    const step = Math.min(MAX_FLIGHT_SPEED, (distance - HOVER_DISTANCE) * 0.4) / distance;
    pup.applyImpulse({ x: dx * step, y: dy * step, z: dz * step });
  }
  if (Math.hypot(dx, dz) > HOVER_DISTANCE) {
    pup.setRotation({ x: 0, y: Math.atan2(-dx, dz) * 180 / Math.PI });
  }
}

function update(pup) {
  const mode = pup.getProperty(FLIGHT_MODE);
  const owner = pup.getComponent("minecraft:is_tamed")?.tamedToPlayer;
  if (canFollowByAir(pup, owner)) {
    if (mode !== "flying") {
      pup.triggerEvent(storage("flight_start"));
    }
    followByAir(pup, owner);
    return;
  }
  if (mode === "flying") {
    pup.clearVelocity();
    pup.triggerEvent(storage("flight_descend"));
  } else if (mode === "landing") {
    if (pup.isOnGround || pup.isInWater || pup.getComponent("minecraft:riding")) {
      pup.triggerEvent(storage("flight_end"));
    } else {
      pup.clearVelocity();
      pup.applyImpulse({ x: 0, y: -LANDING_SPEED, z: 0 });
    }
  }
}

export function startCreativeFlight() {
  system.runInterval(() => {
    for (const id of ["overworld", "nether", "the_end"]) {
      for (const pup of world.getDimension(id).getEntities({ type: YORKIE })) {
        try {
          update(pup);
        } catch (error) {
          if (!(error instanceof InvalidEntityError)) {
            throw error;
          }
        }
      }
    }
  });
}
