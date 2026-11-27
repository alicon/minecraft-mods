import { GameMode, InvalidEntityError, system, world } from "@minecraft/server";
import { clearTraining, issueCue, listenForTrainingRewards, updateTraining } from "./woodland-training.js";
import { nudgeToward } from "./fetch-ground.js";
import { distanceSquared } from "./home-blocks.js";
import { FLIGHT_MODE, WALKING_AFTER_STAY, YORKIE, storage } from "./yorkie.js";

export const SQUIRREL = storage("squirrel");
const ACTIVE = storage("woodland_chase");
const START_RANGE = 8;
const OWNER_RANGE = 20;
const STEP_TICKS = 4;
const MAX_CHASE_TICKS = 200;
const STALL_TICKS = 32;
const SIGHT_LOSS_TICKS = 16;
const RETRY_TICKS = 120;
const pursuits = new Map();

function eligible(pup, owner) {
  return owner?.isValid && owner.dimension.id === pup.dimension.id
    && owner.getGameMode() !== GameMode.Creative && owner.getGameMode() !== GameMode.Spectator
    && pup.getProperty(FLIGHT_MODE) === "ground" && pup.getProperty(storage("home_goal")) === "idle"
    && !pup.getProperty(WALKING_AFTER_STAY) && !pup.getProperty(storage("fetch_busy"))
    && !pup.getProperty(storage("ordered_sit")) && !pup.getComponent("minecraft:leashable")?.isLeashed
    && !pup.isInWater && !pup.getComponent("minecraft:riding");
}

export function sees(observer, target) {
  const start = observer.getHeadLocation();
  const end = target.getHeadLocation();
  const delta = { x: end.x - start.x, y: end.y - start.y, z: end.z - start.z };
  const length = Math.hypot(delta.x, delta.y, delta.z);
  return length <= 0.1 || !observer.dimension.getBlockFromRay(start, {
    x: delta.x / length, y: delta.y / length, z: delta.z / length,
  }, {
    maxDistance: length - 0.05,
    includePassableBlocks: false,
    includeLiquidBlocks: false,
  });
}

function stateFor(pup) {
  let state = pursuits.get(pup.id);
  if (!state) {
    state = { pup, target: undefined, until: 0, triedAt: 0, position: pup.location, retryAt: 0, lastSeenAt: 0 };
    pursuits.set(pup.id, state);
    // Entity properties survive saves. A chase is transient and never resumes with an orphaned target.
    if (pup.getProperty(ACTIVE)) pup.triggerEvent(storage("woodland_chase_end"));
    clearTraining(state);
  }
  return state;
}

function stop(state, now) {
  const { pup } = state;
  if (state.target || pup.getProperty(ACTIVE)) pup.triggerEvent(storage("woodland_chase_end"));
  state.target = undefined;
  state.retryAt = now + RETRY_TICKS;
}

function begin(state, owner, now) {
  const { pup } = state;
  if (!pup.isOnGround || distanceSquared(pup.location, owner.location) > OWNER_RANGE ** 2) return;
  const squirrel = nearbySquirrels(pup).find((candidate) => sees(pup, candidate));
  if (!squirrel) return;
  state.target = squirrel;
  state.until = now + MAX_CHASE_TICKS;
  state.triedAt = now;
  state.lastSeenAt = now;
  state.position = pup.location;
  pup.triggerEvent(storage("woodland_chase_begin"));
  owner.playSound("mob.wolf.bark", { volume: 0.5, pitch: 1.35 });
}

function update(pup, now) {
  const state = stateFor(pup);
  const owner = pup.getComponent("minecraft:is_tamed")?.tamedToPlayer;
  if (!eligible(pup, owner)) {
    if (state.target) stop(state, now);
    if (state.training) clearTraining(state);
    return;
  }
  if (state.training) {
    updateTraining(state, owner, now, () => nearbySquirrels(pup), sees);
    return;
  }
  if (!state.target) {
    if (now >= state.retryAt) {
      state.retryAt = now + 16;
      begin(state, owner, now);
    }
    return;
  }
  const target = state.target;
  if (!target.isValid || target.dimension.id !== pup.dimension.id
      || now >= state.until || distanceSquared(pup.location, owner.location) > OWNER_RANGE ** 2
      || distanceSquared(target.location, owner.location) > OWNER_RANGE ** 2
      || distanceSquared(pup.location, target.location) > (START_RANGE + 4) ** 2) {
    stop(state, now);
    return;
  }
  if (!sees(pup, target)) {
    if (now - state.lastSeenAt >= SIGHT_LOSS_TICKS) stop(state, now);
    return;
  }
  state.lastSeenAt = now;
  if (distanceSquared(state.position, pup.location) >= 0.5 ** 2) {
    state.position = pup.location;
    state.triedAt = now;
  } else if (now - state.triedAt >= STALL_TICKS) {
    stop(state, now);
    return;
  }
  if (distanceSquared(pup.location, target.location) > 1.05 ** 2) nudgeToward(pup, target.location, false);
}

function nearbySquirrels(pup) {
  return pup.dimension.getEntities({ type: SQUIRREL, location: pup.location, maxDistance: START_RANGE, closest: 3 });
}

export function nearbyOwnedDog(owner) {
  return owner.dimension.getEntities({ type: YORKIE, location: owner.location, maxDistance: 16 })
    .filter((pup) => pup.getComponent("minecraft:is_tamed")?.tamedToPlayerId === owner.id)
    .sort((a, b) => distanceSquared(a.location, owner.location) - distanceSquared(b.location, owner.location))[0];
}

export function cueClosestDog(owner) {
  const pup = nearbyOwnedDog(owner);
  if (!pup || !eligible(pup, owner)) {
    owner.onScreenDisplay.setActionBar(pup ? "Try with Mushroom awake, standing and off the lead." : "Bring your Mushroom nearby.");
    return;
  }
  const state = stateFor(pup);
  issueCue(state, owner, state.target, sees, () => stop(state, system.currentTick));
}

listenForTrainingRewards(pursuits);

export function startWoodlandPlay() {
  system.runInterval(() => {
    const now = system.currentTick;
    const seen = new Set();
    for (const owner of world.getAllPlayers()) {
      const pups = owner.dimension.getEntities({ type: YORKIE, location: owner.location, maxDistance: OWNER_RANGE + 12 });
      for (const pup of pups) {
        if (seen.has(pup.id)) continue;
        seen.add(pup.id);
        try {
          update(pup, now);
        } catch (error) {
          if (!(error instanceof InvalidEntityError)) throw error;
        }
      }
    }
    for (const [id, state] of pursuits) {
      if (seen.has(id)) continue;
      try {
        if (state.pup.isValid) {
          if (state.target) stop(state, now);
          if (state.training) clearTraining(state);
        }
      } catch (error) {
        if (!(error instanceof InvalidEntityError)) throw error;
      }
      pursuits.delete(id);
    }
  }, STEP_TICKS);
}
