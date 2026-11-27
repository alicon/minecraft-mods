import { GameMode, InvalidEntityError, system, world } from "@minecraft/server";
import { CAMP_MAT, canStepTo, dryCampFooting, findRetreat, outsideClouds } from "./expedition-footing.js";
import { nudgeToward } from "./fetch-ground.js";
import { blockAt, centerOf, distanceSquared } from "./home-blocks.js";
import { recordedPetOf } from "./ownership.js";
import { FLIGHT_MODE, WALKING_AFTER_STAY, YORKIE, storage } from "./yorkie.js";

const ASSIGNED_CAMP = storage("expedition_camp");
const HOME_GOAL = storage("home_goal");
const ASSIGN_RADIUS = 12;
const CAMP_RANGE = 24;
const RECALL_RANGE = 2;
const STEP_TICKS = 3;
const REPLAN_TICKS = 15;
const DAMAGE_COOLDOWN = 40;
const retreats = new Map();

function validMat(dimension, location) {
  return blockAt(dimension, location)?.typeId === CAMP_MAT && dryCampFooting(dimension, location);
}

function livingOwnerDog(dog, owner, center) {
  return dog?.isValid && dog.dimension.id === owner.dimension.id
    && dog.getComponent("minecraft:is_tamed")?.tamedToPlayerId === owner.id
    && dog.getComponent("minecraft:health")?.currentValue > 0
    && distanceSquared(dog.location, center) <= ASSIGN_RADIUS ** 2;
}

function markCamp(owner, mat) {
  const { dimension, location } = mat;
  const center = centerOf(mat);
  const recorded = recordedPetOf(owner);
  const dog = livingOwnerDog(recorded, owner, center) ? recorded
    : dimension.getEntities({ type: YORKIE, location: center, maxDistance: ASSIGN_RADIUS })
      .find(candidate => livingOwnerDog(candidate, owner, center));
  if (!dog) {
    owner.onScreenDisplay.setActionBar({ translate: "mushroom.camp.no_dog" });
  } else if (!validMat(dimension, location)) {
    owner.onScreenDisplay.setActionBar({ translate: "mushroom.camp.unsafe" });
  } else {
    const { x, y, z } = location;
    dog.setDynamicProperty(ASSIGNED_CAMP, JSON.stringify({ dimension: dimension.id, x, y, z }));
    owner.onScreenDisplay.setActionBar({ translate: "mushroom.camp.marked" });
  }
}

function savedCamp(dog) {
  const value = dog.getDynamicProperty(ASSIGNED_CAMP);
  if (typeof value !== "string") return undefined;
  let mark;
  try {
    mark = JSON.parse(value);
  } catch {
    return undefined;
  }
  if (mark?.dimension !== dog.dimension.id || ![mark.x, mark.y, mark.z].every(Number.isInteger)) return undefined;
  const center = { x: mark.x + 0.5, y: mark.y, z: mark.z + 0.5 };
  return distanceSquared(dog.location, center) <= CAMP_RANGE ** 2 ? center : undefined;
}

function dragonClouds(dog) {
  if (dog.dimension.id !== "minecraft:the_end") return [];
  // Stable Script API does not expose a cloud's radius or origin. In the End
  // keep clear of nearby lingering clouds, including ones thrown by a player.
  return dog.dimension.getEntities({
    type: "minecraft:area_effect_cloud", location: dog.location, maxDistance: CAMP_RANGE + 6,
  }).map(cloud => cloud.location);
}

function canRetreat(dog, owner) {
  const mode = owner?.getGameMode();
  return dog.getComponent("minecraft:is_tamed") && mode !== GameMode.Creative && mode !== GameMode.Spectator
    && dog.getProperty(FLIGHT_MODE) === "ground" && !dog.getProperty(WALKING_AFTER_STAY)
    && !dog.getProperty(storage("ordered_sit")) && !dog.getComponent("minecraft:leashable")?.isLeashed
    && !dog.getComponent("minecraft:riding") && !dog.isInWater;
}

function holdPosition(dog) {
  if (!dog.isOnGround) return;
  const { x, z } = dog.getVelocity();
  if (x || z) dog.applyImpulse({ x: -x, y: 0, z: -z });
}

function updateRetreat(dog, tick) {
  const owner = dog.getComponent("minecraft:is_tamed")?.tamedToPlayer;
  const holding = dog.getProperty(HOME_GOAL) === "camp";
  const state = retreats.get(dog.id);
  if (!canRetreat(dog, owner)) {
    if (holding) dog.triggerEvent(storage("home_idle"));
    retreats.delete(dog.id);
    return;
  }
  const clouds = dragonClouds(dog);
  const threatened = !outsideClouds(clouds, dog.location) || tick < (state?.hurtUntil ?? 0);
  if (!holding && !threatened) return;
  const retreat = state ?? { nextPlan: 0, route: [] };
  retreats.set(dog.id, retreat);
  if (!holding) {
    dog.triggerEvent(storage("home_camp"));
    dog.dimension.playSound("mob.wolf.bark", dog.location, { volume: 0.75, pitch: 1.35 });
    if (owner?.dimension.id === dog.dimension.id) {
      owner.onScreenDisplay.setActionBar({ translate: "mushroom.camp.retreat" });
    }
    return;
  }
  const marked = savedCamp(dog);
  const camp = marked && validMat(dog.dimension, marked) && outsideClouds(clouds, marked) ? marked : undefined;
  const arrived = camp && distanceSquared(dog.location, camp) < 0.6 ** 2;
  if (!threatened && (!camp || arrived || !retreat.route.length) && owner?.dimension.id === dog.dimension.id
      && owner.getComponent("minecraft:health")?.currentValue > 0
      && outsideClouds(clouds, owner.location)
      && distanceSquared(owner.location, dog.location) <= RECALL_RANGE ** 2) {
    dog.triggerEvent(storage("home_idle"));
    retreats.delete(dog.id);
    return;
  }
  if (!dog.isOnGround) return;
  if (arrived) {
    holdPosition(dog);
    return;
  }
  if (tick >= retreat.nextPlan) {
    retreat.route = findRetreat(dog.dimension, dog.location, camp, clouds);
    retreat.nextPlan = tick + REPLAN_TICKS;
  }
  const step = retreat.route[0];
  if (step && distanceSquared(dog.location, step) < 0.28 ** 2) retreat.route.shift();
  const next = retreat.route[0];
  const canStep = (from, to) => canStepTo(dog.dimension, clouds, from, to);
  if (!next || !canStep(dog.location, next) || !nudgeToward(dog, next, false, canStep)) {
    holdPosition(dog);
  }
}

export function installExpeditionCamp() {
  world.afterEvents.playerPlaceBlock.subscribe(({ player, block }) => {
    if (block.typeId !== CAMP_MAT) return;
    const { dimension, location } = block;
    // Native placement may report the new block before the world queries used
    // to validate its footing see the completed placement.
    system.run(() => {
      if (!player.isValid || player.dimension.id !== dimension.id) return;
      const placed = blockAt(dimension, location);
      if (placed?.typeId === CAMP_MAT) markCamp(player, placed);
    });
  });
  world.afterEvents.entityHurt.subscribe(({ hurtEntity: dog, damage }) => {
    if (damage <= 0 || !savedCamp(dog)) return;
    const state = retreats.get(dog.id) ?? { nextPlan: 0, route: [] };
    state.hurtUntil = system.currentTick + DAMAGE_COOLDOWN;
    retreats.set(dog.id, state);
  }, { entityTypes: [YORKIE] });
  system.runInterval(() => {
    const loaded = new Set();
    for (const id of ["overworld", "nether", "the_end"]) {
      for (const dog of world.getDimension(id).getEntities({ type: YORKIE })) {
        loaded.add(dog.id);
        try {
          updateRetreat(dog, system.currentTick);
        } catch (error) {
          if (!(error instanceof InvalidEntityError)) throw error;
        }
      }
    }
    for (const id of retreats.keys()) {
      if (!loaded.has(id)) retreats.delete(id);
    }
  }, STEP_TICKS);
}
