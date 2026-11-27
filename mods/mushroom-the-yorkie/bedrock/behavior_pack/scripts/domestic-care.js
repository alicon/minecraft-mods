import { InvalidEntityError, system, world } from "@minecraft/server";
import { blockAt, centerOf, distanceSquared, nearbyBlocks, restSpot } from "./home-blocks.js";
import { BED, EMPTY_BOWL, FLIGHT_MODE, FOOD_BOWL, HOUSE, NAMESPACE, WALKING_AFTER_STAY, WATER_BOWL, YORKIE, storage } from "./yorkie.js";

const LOOK_RADIUS = 8;
const CARE_INTERVAL = 10;
const APPROACH_TIMEOUT = 160;
const RETRY_DELAY = 100;
const OWNER_RADIUS_SQUARED = 24 ** 2;
const NIGHT_START = 12500;
const NIGHT_END = 23000;
const ALERT_RADIUS = 8;
const ALERT_COOLDOWN = 140;
const BOWL_REACH_SQUARED = 1.25 ** 2;
const MATTRESS_REACH_SQUARED = 0.85 ** 2;
const TASKS = {
  food: { block: FOOD_BOWL, used: storage("last_meal_day"), sound: "random.eat", message: "mushroom.care.ate" },
  water: { block: WATER_BOWL, used: storage("last_drink_day"), sound: "random.drink", message: "mushroom.care.drank" },
  house: { block: HOUSE },
  bed: { block: BED },
};
const attempts = new Map();

function nightFor(pup, time) {
  return pup.dimension.id === "minecraft:overworld" && time >= NIGHT_START && time < NIGHT_END;
}

function useBowl(pup, bowl, task, day, owner) {
  bowl.setType(EMPTY_BOWL);
  pup.setDynamicProperty(task.used, day);
  pup.dimension.playSound(task.sound, pup.location, { volume: 0.4 });
  owner?.onScreenDisplay.setActionBar({ translate: task.message });
}

function requestGoal(pup, goal) {
  if (pup.getProperty(storage("home_goal")) !== goal) {
    pup.triggerEvent(NAMESPACE + "home_" + goal);
  }
}

function canRest(pup, spot) {
  return pup.isOnGround && distanceSquared(pup.location, spot.location) <= MATTRESS_REACH_SQUARED;
}

function alertAtNight(pup, owner, state, now) {
  if (!pup.dimension.getEntities({ families: ["monster"], location: pup.location, maxDistance: ALERT_RADIUS, closest: 1 }).length) {
    return false;
  }
  if (now >= state.nextAlert) {
    state.nextAlert = now + ALERT_COOLDOWN;
    pup.dimension.playSound("mob.wolf.bark", pup.location, { volume: 0.75, pitch: 1.4 });
    owner?.onScreenDisplay.setActionBar({ translate: "mushroom.care.alert" });
  }
  return true;
}

function eligibleTasks(pup, day, night) {
  const tasks = [];
  if (!night) {
    for (const name of ["food", "water"]) {
      const lastUsed = pup.getDynamicProperty(TASKS[name].used);
      if (typeof lastUsed !== "number" || day > lastUsed) {
        tasks.push(name);
      }
    }
  } else {
    tasks.push("house", "bed");
  }
  return tasks;
}

function chooseTarget(pup, tasks, state, now) {
  const blockTypes = tasks.map((name) => TASKS[name].block);
  if (!blockTypes.length) {
    return undefined;
  }
  const blocks = nearbyBlocks(pup.dimension, pup.location, LOOK_RADIUS, blockTypes);
  const byDistance = (first, second) => distanceSquared(pup.location, centerOf(first))
    - distanceSquared(pup.location, centerOf(second));
  for (const name of tasks) {
    if (now < (state.retryAt[name] ?? 0)) {
      continue;
    }
    const candidates = blocks.filter((block) => block.typeId === TASKS[name].block).sort(byDistance);
    for (const block of candidates) {
      const spot = TASKS[name].used ? undefined : restSpot(block);
      if (TASKS[name].used || spot) {
        return { name, block, spot };
      }
    }
  }
  return undefined;
}

function safeSleep(pup, spot) {
  return canRest(pup, spot) && pup.tryTeleport(spot.location, {
    checkForBlocks: true,
    facingLocation: spot.facingLocation,
  });
}

function update(pup, state, day, time, now) {
  if (pup.getProperty(FLIGHT_MODE) !== "ground" || pup.getProperty(WALKING_AFTER_STAY)
    || pup.getProperty(storage("home_goal")) === "camp") {
    state.name = undefined;
    return;
  }
  const tamed = pup.getComponent("minecraft:is_tamed");
  const owner = tamed?.tamedToPlayer;
  const leashable = pup.getComponent("minecraft:leashable");
  const sleeping = pup.getProperty(storage("home_goal")) === "sleep";
  if (!tamed || pup.getProperty(storage("ordered_sit")) || pup.isInWater || leashable?.isLeashed
    || (!sleeping && owner && (owner.dimension.id !== pup.dimension.id
      || distanceSquared(pup.location, owner.location) > OWNER_RADIUS_SQUARED))) {
    requestGoal(pup, "idle");
    state.name = undefined;
    return;
  }

  const night = nightFor(pup, time);
  if (!night && pup.getProperty(storage("fetch_busy"))) {
    state.name = undefined;
    return;
  }
  if (night && alertAtNight(pup, owner, state, now)) {
    requestGoal(pup, "idle");
    state.name = undefined;
    return;
  }

  if (sleeping) {
    const spot = restSpot(blockAt(pup.dimension, pup.location));
    if (night && spot && distanceSquared(pup.location, spot.location) < MATTRESS_REACH_SQUARED) {
      return;
    }
    requestGoal(pup, "idle");
    state.name = undefined;
    return;
  }

  const target = chooseTarget(pup, eligibleTasks(pup, day, night), state, now);
  if (!target) {
    requestGoal(pup, "idle");
    state.name = undefined;
    return;
  }

  const { name, block, spot } = target;
  if (state.name !== name) {
    state.name = name;
    state.startedAt = now;
  }

  if (!spot && distanceSquared(pup.location, centerOf(block)) <= BOWL_REACH_SQUARED) {
    useBowl(pup, block, TASKS[name], day, owner);
    requestGoal(pup, "idle");
    state.name = undefined;
  } else if (spot && safeSleep(pup, spot)) {
    requestGoal(pup, "sleep");
    state.name = undefined;
  } else if (now - state.startedAt >= APPROACH_TIMEOUT) {
    state.retryAt[name] = now + RETRY_DELAY;
    state.name = undefined;
    requestGoal(pup, "idle");
  } else {
    requestGoal(pup, name);
  }
}

export function startDomesticCare() {
  system.runInterval(() => {
    const loaded = new Set();
    const day = world.getDay();
    const time = world.getTimeOfDay();
    const now = system.currentTick;
    for (const key of ["overworld", "nether", "the_end"]) {
      for (const pup of world.getDimension(key).getEntities({ type: YORKIE })) {
        loaded.add(pup.id);
        if (!attempts.has(pup.id)) {
          attempts.set(pup.id, { retryAt: {}, nextAlert: 0 });
        }
        try {
          update(pup, attempts.get(pup.id), day, time, now);
        } catch (error) {
          if (!(error instanceof InvalidEntityError)) {
            throw error;
          }
        }
      }
    }
    for (const id of attempts.keys()) {
      if (!loaded.has(id)) {
        attempts.delete(id);
      }
    }
  }, CARE_INTERVAL);
}
