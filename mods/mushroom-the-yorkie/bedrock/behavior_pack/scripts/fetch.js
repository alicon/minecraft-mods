import { GameMode, InvalidEntityError, system, world } from "@minecraft/server";
import { availableToy, fetchStack, PRACTICE, THROWER, TOY_TAG } from "./fetch-items.js";
import { dryDropSpot, nudgeToward, reachableToy } from "./fetch-ground.js";
import { distanceSquared } from "./home-blocks.js";
import { YORKIE, storage } from "./yorkie.js";

const SEEKING = storage("fetch_seeking");
const BUSY = storage("fetch_busy");
const PRACTICE_CARRY = storage("fetch_practice_carry");
const FETCH_RANGE = 12;
const OWNER_RANGE_SQUARED = 24 ** 2;
const PICKUP_REACH_SQUARED = 0.95 ** 2;
const RETURN_REACH_SQUARED = 2.5 ** 2;
const STUCK_TICKS = 36;
const SEEK_LIMIT_TICKS = 140;
const TRY_AGAIN_TICKS = 60;
const CARRY_SLOT = 0;
const DIMENSIONS = ["overworld", "nether", "the_end"];
const pursuits = new Map();

function setBusy(pup, busy) {
  if (pup.getProperty(BUSY) !== busy) {
    pup.setProperty(BUSY, busy);
  }
}

function stopSeeking(pup) {
  if (pup.getProperty(SEEKING)) {
    pup.triggerEvent(storage("fetch_seek_off"));
  }
}

function dozing(pup) {
  const time = world.getTimeOfDay();
  return pup.getProperty(storage("home_goal")) === "sleep"
    || (pup.dimension.id === "minecraft:overworld" && time >= 12500 && time < 23000);
}

function canPlay(pup, owner) {
  return owner?.isValid && owner.dimension.id === pup.dimension.id
    && owner.getGameMode() !== GameMode.Spectator
    && distanceSquared(pup.location, owner.location) <= OWNER_RANGE_SQUARED
    && !pup.getProperty(storage("ordered_sit"))
    && !pup.getComponent("minecraft:leashable")?.isLeashed
    && !dozing(pup);
}

function holdToy(pup, item, cargo) {
  const stack = fetchStack(item);
  if (!stack) {
    return false;
  }
  if (stack.getDynamicProperty(PRACTICE) === true) {
    item.remove();
    pup.setDynamicProperty(PRACTICE_CARRY, true);
    return true;
  }
  if (!cargo || cargo.getItem(CARRY_SLOT)) {
    return false;
  }
  cargo.setItem(CARRY_SLOT, stack);
  try {
    item.remove();
  } catch (error) {
    cargo.setItem(CARRY_SLOT, undefined);
    throw error;
  }
  return true;
}

function releaseToy(pup, cargo, stack, spot) {
  if (!dryDropSpot(pup.dimension, spot)) {
    return false;
  }
  cargo.setItem(CARRY_SLOT, undefined);
  try {
    pup.dimension.spawnItem(stack, spot);
  } catch (error) {
    cargo.setItem(CARRY_SLOT, stack);
    throw error;
  }
  return true;
}

function returnToy(pup, owner, cargo, stack) {
  cargo.setItem(CARRY_SLOT, undefined);
  let leftover;
  try {
    leftover = owner.addItem(stack);
  } catch (error) {
    cargo.setItem(CARRY_SLOT, stack);
    throw error;
  }
  if (!leftover) {
    return true;
  }
  cargo.setItem(CARRY_SLOT, leftover);
  return owner.getGameMode() !== GameMode.Creative
    && (releaseToy(pup, cargo, leftover, owner.location) || releaseToy(pup, cargo, leftover, pup.location));
}

function matchingToy(pup, owner, now, ignoredItem) {
  const items = pup.dimension.getEntities({
    type: "minecraft:item",
    tags: [TOY_TAG],
    location: pup.location,
    maxDistance: FETCH_RANGE,
  });
  const candidates = items.filter((item) =>
    item.id !== ignoredItem && item.getDynamicProperty(THROWER) === owner.id && availableToy(item, now)
    && reachableToy(pup.dimension, item.location),
  );
  return candidates.sort((a, b) => distanceSquared(a.location, pup.location)
    - distanceSquared(b.location, pup.location))[0];
}

function walkToToy(pup, owner, cargo, state, tick, now) {
  if (tick < state.retryAt) {
    return;
  }
  if (!state.item?.isValid) {
    state.item = matchingToy(pup, owner, now, state.ignoredItem);
    if (!state.item) {
      state.retryAt = tick + 8;
      setBusy(pup, false);
      stopSeeking(pup);
      return;
    }
    state.startedAt = tick;
    state.lastProgress = tick;
    state.best = Infinity;
    pup.triggerEvent(storage("home_idle"));
    pup.triggerEvent(storage("fetch_seek_on"));
    setBusy(pup, true);
  }
  const item = state.item;
  const destination = item.location;
  const distance = distanceSquared(pup.location, destination);
  if (!reachableToy(pup.dimension, destination) || tick - state.startedAt >= SEEK_LIMIT_TICKS
    || tick - state.lastProgress >= STUCK_TICKS) {
    state.retryAt = tick + TRY_AGAIN_TICKS;
    state.ignoredItem = item.id;
    state.item = undefined;
    stopSeeking(pup);
    setBusy(pup, false);
    owner.onScreenDisplay.setActionBar({ translate: "mushroom.fetch.unreachable" });
  } else if (distance <= PICKUP_REACH_SQUARED && holdToy(pup, item, cargo)) {
    stopSeeking(pup);
    state.item = undefined;
    owner.onScreenDisplay.setActionBar({ translate: "mushroom.fetch.found" });
  } else {
    if (distance + 0.025 < state.best) {
      state.best = distance;
      state.lastProgress = tick;
    }
    nudgeToward(pup, destination);
  }
}

function updateFetch(pup, state, tick, now) {
  const owner = pup.getComponent("minecraft:is_tamed")?.tamedToPlayer;
  const cargo = pup.getComponent("minecraft:inventory")?.container;
  const carried = cargo?.getItem(CARRY_SLOT);
  const practice = pup.getDynamicProperty(PRACTICE_CARRY) === true;
  if (!canPlay(pup, owner)) {
    stopSeeking(pup);
    setBusy(pup, false);
    state.item = undefined;
    if (practice) {
      pup.setDynamicProperty(PRACTICE_CARRY, undefined);
    }
    if (carried && cargo && owner?.isValid && owner.dimension.id === pup.dimension.id
      && (pup.getProperty(storage("ordered_sit")) || dozing(pup) || pup.getComponent("minecraft:leashable")?.isLeashed)) {
      releaseToy(pup, cargo, carried, pup.location);
    }
    return;
  }
  if (practice || carried) {
    stopSeeking(pup);
    setBusy(pup, true);
    const ownerDistance = distanceSquared(pup.location, owner.location);
    if (ownerDistance <= RETURN_REACH_SQUARED) {
      const finished = practice || (cargo && carried && returnToy(pup, owner, cargo, carried));
      if (finished) {
        pup.setDynamicProperty(PRACTICE_CARRY, undefined);
        setBusy(pup, false);
        owner.onScreenDisplay.setActionBar({ translate: "mushroom.fetch.returned" });
      } else if (tick >= (state.nextInventoryHint ?? 0)) {
        state.nextInventoryHint = tick + 100;
        owner.onScreenDisplay.setActionBar({ translate: "mushroom.fetch.inventory_full" });
      }
    } else if (pup.isInWater || ownerDistance < 5 ** 2) {
      nudgeToward(pup, owner.location);
    }
    return;
  }
  walkToToy(pup, owner, cargo, state, tick, now);
}

export function startFetch() {
  let nextItemCleanup = 0;
  system.runInterval(() => {
    const tick = system.currentTick;
    const now = world.getAbsoluteTime();
    const loaded = new Set();
    for (const key of DIMENSIONS) {
      const dimension = world.getDimension(key);
      for (const pup of dimension.getEntities({ type: YORKIE })) {
        loaded.add(pup.id);
        if (!pursuits.has(pup.id)) {
          pursuits.set(pup.id, { retryAt: 0 });
        }
        try {
          updateFetch(pup, pursuits.get(pup.id), tick, now);
        } catch (error) {
          if (!(error instanceof InvalidEntityError)) {
            throw error;
          }
        }
      }
      if (tick >= nextItemCleanup) {
        for (const item of dimension.getEntities({ type: "minecraft:item", tags: [TOY_TAG] })) {
          availableToy(item, now);
        }
      }
    }
    if (tick >= nextItemCleanup) {
      nextItemCleanup = tick + 20;
    }
    for (const id of pursuits.keys()) {
      if (!loaded.has(id)) {
        pursuits.delete(id);
      }
    }
  }, 2);
}
