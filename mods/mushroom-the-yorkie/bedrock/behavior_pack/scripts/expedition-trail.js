import { GameMode, InvalidEntityError, Player, system, world } from "@minecraft/server";
import { unsafeTrailStep } from "./expedition-footing.js";
import { distanceSquared } from "./home-blocks.js";
import { FLIGHT_MODE, WALKING_AFTER_STAY, YORKIE, storage } from "./yorkie.js";

const HOME = storage("home_goal");
const ORDERED_SIT = storage("ordered_sit");
const TICKS_PER_CHECK = 2;
const warnings = new Map();

function walkingToward(dog, handler, holding) {
  if (!(handler instanceof Player) || !handler.isValid || handler.dimension.id !== dog.dimension.id
    || !dog.isOnGround || dog.isInWater || dog.getProperty(ORDERED_SIT) || dog.getProperty(WALKING_AFTER_STAY)
    || dog.getProperty(FLIGHT_MODE) !== "ground" || dog.getProperty(storage("fetch_busy"))
    || dog.getProperty(storage("woodland_chase")) || dog.getComponent("minecraft:riding")) return undefined;
  const mode = handler.getGameMode();
  if (mode === GameMode.Creative || mode === GameMode.Spectator
    || distanceSquared(dog.location, handler.location) < 2 ** 2) return undefined;
  const { x, z } = holding
    ? { x: handler.location.x - dog.location.x, z: handler.location.z - dog.location.z }
    : dog.getVelocity();
  if (Math.hypot(x, z) < 0.06) return undefined;
  return Math.abs(x) >= Math.abs(z) ? { dx: Math.sign(x), dz: 0 } : { dx: 0, dz: Math.sign(z) };
}

function updateTrail(dog) {
  const home = dog.getProperty(HOME);
  const holding = home === "trail";
  if (home !== "idle" && !holding) {
    warnings.delete(dog.id);
    return;
  }
  const lead = dog.getComponent("minecraft:leashable");
  const handler = lead?.isLeashed ? lead.leashHolder : dog.getComponent("minecraft:is_tamed")?.tamedToPlayer;
  const direction = walkingToward(dog, handler, holding);
  const former = warnings.get(dog.id);
  const { x, y, z } = dog.location;
  const checking = former && handler?.id === former.handler && distanceSquared(handler.location, former.at) <= 4
    ? former : direction && {
      ...direction,
      step: { x: Math.floor(x) + direction.dx, y: Math.floor(y), z: Math.floor(z) + direction.dz },
      handler: handler.id,
      at: handler.location,
    };
  if (!direction || !checking || !unsafeTrailStep(dog.dimension, checking.step, checking.dx, checking.dz)) {
    if (holding) dog.triggerEvent(storage("home_idle"));
    warnings.delete(dog.id);
    return;
  }
  const velocity = dog.getVelocity();
  dog.applyImpulse({ x: -velocity.x, y: 0, z: -velocity.z });
  warnings.set(dog.id, checking);
  if (!holding) {
    dog.triggerEvent(storage("home_trail"));
    dog.dimension.playSound("mob.wolf.bark", dog.location, { volume: 0.75, pitch: 1.35 });
    handler.onScreenDisplay.setActionBar({ translate: "mushroom.camp.trail_unsafe" });
  }
}

export function startExpeditionTrail() {
  system.runInterval(() => {
    const loaded = new Set();
    for (const id of ["overworld", "nether", "the_end"]) {
      for (const dog of world.getDimension(id).getEntities({ type: YORKIE })) {
        loaded.add(dog.id);
        try {
          updateTrail(dog);
        } catch (error) {
          if (!(error instanceof InvalidEntityError)) throw error;
        }
      }
    }
    for (const id of warnings.keys()) {
      if (!loaded.has(id)) warnings.delete(id);
    }
  }, TICKS_PER_CHECK);
}
