import { BlockVolume, ItemStack, system, world } from "@minecraft/server";
import { FLOOR, TREAT, bag, check, itemCount, ownerOf, pause, prop, startPair, until } from "./mushroom-bedrock-autoplay.js";

const BALL = "mushroom_yorkie:yorkie_ball";
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

async function walk(actor, spot) {
  actor.moveToLocation(spot);
  try {
    await until(() => distance(actor.location, spot) < 0.85, "input: player could not reach a daycare waypoint", 160);
  } finally {
    actor.stopMoving();
  }
}

async function playInDaylight(pair, day, visits) {
  const { actor, pet, origin, ballName } = pair;
  const z = origin.z + (visits % 2 === 0 ? 10 : 1);
  await walk(actor, { ...origin, z });
  await until(() => distance(actor.location, pet.location) < 4, "dog did not follow its walking owner", 160);
  if (day !== pair.fedDay) {
    const count = itemCount(actor, TREAT);
    if (count > 0) {
      actor.selectedSlotIndex = 1;
      actor.stopInteracting();
      check(actor.interactWithEntity(pet), "input: owner could not offer the daycare treat");
      await until(() => itemCount(actor, TREAT) === count - 1, "one daycare treat was not consumed");
      actor.stopInteracting();
      pair.fedDay = day;
    }
  }
  const inventory = bag(actor);
  let slot;
  for (let n = 0; n < inventory.size; n++) {
    if (inventory.getItem(n)?.nameTag === ballName) { slot = n; break; }
  }
  check(slot !== undefined, "owner lost the daycare ball between visits");
  actor.selectedSlotIndex = slot;
  actor.setRotation({ x: 14, y: -90 });
  check(actor.useItemInSlot(slot), "input: owner could not throw the daycare ball");
  await until(() => itemCount(actor, BALL, ballName) === 0, "daycare throw retained a copy in hand");
  await until(() => itemCount(actor, BALL, ballName) === 1, "daycare ball was not returned", 280);
}

async function stayOvernight(pair, day, time) {
  const { actor, pet, origin } = pair;
  if (pair.returnedDay !== day) {
    await walk(actor, origin);
    pair.returnedDay = day;
  }
  const sleeping = prop(pet, "home_goal") === "sleep";
  if (sleeping) {
    check(prop(pet, "flight_mode") === "ground", "a sleeping daycare dog took flight");
    if (pair.sleepLocation) {
      check(distance(pet.location, pair.sleepLocation) < 0.10, "a sleeping daycare dog drifted away from bed");
    }
    pair.sleepLocation = pet.location;
    pair.sleepDay = day;
  } else if (time >= 14000 && time < 22500) {
    check(false, "dog stayed awake in a quiet daycare after dark " + JSON.stringify({
      day, time, pet: pet.location, owner: actor.location, goal: prop(pet, "home_goal"),
    }));
  }
}

export function startDaycare(seconds, seed) {
  world.afterEvents.worldLoad.subscribe(async () => {
    let action = "setup";
    let round = 0;
    try {
      const dimension = world.getDimension("overworld");
      const from = { x: 0, y: FLOOR, z: 0 };
      const to = { x: 56, y: FLOOR + 12, z: 30 };
      await world.tickingAreaManager.createTickingArea("mushroom_daycare", { dimension, from, to });
      dimension.fillBlocks(new BlockVolume(from, { ...to, y: FLOOR }), "minecraft:grass_block");
      world.gameRules.doMobSpawning = false;
      world.gameRules.doDayLightCycle = true;
      world.setTimeOfDay(1000);
      const pairs = [];
      for (const [index, x] of [6.5, 32.5].entries()) {
        const pair = await startPair(dimension, x, "DaycareWalker" + index);
        const bed = { x: Math.floor(x) + 2, y: FLOOR + 1, z: 6 };
        dimension.setBlockType(bed, "mushroom_yorkie:dog_bed");
        pair.ballName = "Daycare ball " + index;
        const ball = new ItemStack(BALL);
        ball.nameTag = pair.ballName;
        pair.actor.setItem(ball, 0, true);
        pair.actor.setItem(new ItemStack(TREAT, 64), 1);
        pairs.push(pair);
      }
      // Start one minute before the dogs' bedtime, then let the world's own clock run.
      world.setTimeOfDay(11300);
      const startTick = system.currentTick;
      const startTime = Date.now();
      const startDay = world.getDay();
      const counts = { walksAndFetches: 0, nightChecks: 0, dawns: 0 };
      let wasNight = false;
      console.warn("MUSHROOM_PLAY_START " + JSON.stringify({ seed, seconds, tick: startTick, day: startDay }));
      do {
        const time = world.getTimeOfDay();
        const day = world.getDay();
        // Walk home at dusk so a new fetch does not overlap the dog's native bedtime.
        const night = time >= 12000 && time < 23000;
        action = night ? "night-care" : "day-walk-and-fetch";
        console.warn("MUSHROOM_PLAY_ACTION " + JSON.stringify({ case: action, round: ++round, day, time, tick: system.currentTick }));
        if (wasNight && !night) {
          check(pairs.every(pair => pair.sleepDay !== undefined), "a daycare dog missed the night's rest");
          counts.dawns++;
          for (const pair of pairs) {
            pair.sleepLocation = undefined;
            pair.sleepDay = undefined;
            await until(() => prop(pair.pet, "home_goal") !== "sleep", "a daycare dog failed to wake at dawn");
          }
        }
        wasNight = night;
        if (night) {
          for (const pair of pairs) await stayOvernight(pair, day, time);
          counts.nightChecks++;
        } else {
          const index = (counts.walksAndFetches + (seed >>> 0) % 2) % 2;
          await playInDaylight(pairs[index], day, Math.floor(counts.walksAndFetches / 2));
          counts.walksAndFetches++;
        }
        for (const { actor, pet } of pairs) {
          check(pet.isValid && ownerOf(pet) === actor.id, "daycare dog disappeared or changed owners");
        }
        await pause(80);
        console.warn("MUSHROOM_PLAY_RESULT " + JSON.stringify({ case: action, round, tick: system.currentTick, counts }));
      } while (Date.now() - startTime < seconds * 1000);
      console.warn("MUSHROOM_PLAY_PASS " + JSON.stringify({ seed, rounds: round, counts,
        elapsedSeconds: (Date.now() - startTime) / 1000, tick: system.currentTick,
        naturalDayLengths: (system.currentTick - startTick) / 24000 }));
    } catch (error) {
      console.error("MUSHROOM_TEST_FAIL " + JSON.stringify({ seed, case: action, round, tick: system.currentTick,
        error: error?.message ?? String(error) }));
    }
  });
}
