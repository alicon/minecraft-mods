import { BlockVolume, GameMode, system, world } from "@minecraft/server";
import { spawnSimulatedPlayer } from "@minecraft/server-gametest";

const YORKIE = "mushroom_yorkie:mushroom_yorkie";
const HOME = "mushroom_yorkie:home_goal";
const trailAt = (x, z, y = 231) => ({ x: x + 240, y, z });
const START = trailAt(4.5, 8.5);
const OTHER_SIDE = trailAt(11.5, 8.5);
const WAITING_EDGE = trailAt(6, 8.5).x;

async function waitFor(condition, message, ticks = 120) {
  for (let i = 0; i < ticks; i += 2) {
    if (condition()) return;
    await system.waitTicks(2);
  }
  throw new Error(message());
}

function stone(dimension, x1, z1, x2, z2) {
  dimension.fillBlocks(new BlockVolume(trailAt(x1, z1, 230), trailAt(x2, z2, 230)), "minecraft:stone");
}

function describe(dog) {
  return JSON.stringify({
    position: dog.location, velocity: dog.getVelocity(), home: dog.getProperty(HOME),
    lead: dog.getComponent("minecraft:leashable")?.leashHolder?.id,
  });
}

async function verifyNarrowCrossing(dimension, dog, handler, leashed) {
  const narrow = new BlockVolume(trailAt(6, 7, 230), trailAt(9, 9, 230));
  dimension.fillBlocks(narrow, "minecraft:air");
  stone(dimension, 6, 8, 9, 8);
  dog.teleport(START);
  handler.teleport(trailAt(5.5, 8.5));
  await system.waitTicks(3);
  const lead = dog.getComponent("minecraft:leashable");
  if (leashed) lead.leashTo(handler);
  handler.teleport(OTHER_SIDE);
  await waitFor(() => dog.getProperty(HOME) === "trail",
    () => "Mushroom did not warn before the narrow crossing: " + describe(dog));
  for (let tick = 0; tick < 24; tick += 2) {
    if (dog.location.x >= WAITING_EDGE || dog.location.y < START.y
      || dog.getProperty(HOME) !== "trail"
      || (leashed && lead.leashHolder?.id !== handler.id)) {
      throw new Error("The narrow crossing pulled Mushroom from safe ground or released the guest lead: " + describe(dog));
    }
    await system.waitTicks(2);
  }
  dimension.fillBlocks(narrow, "minecraft:stone");
  await waitFor(() => dog.getProperty(HOME) === "idle" && dog.location.x >= trailAt(9.5, 8.5).x,
    () => "Mushroom did not resume across the widened bridge: " + describe(dog));
  if (leashed && lead.leashHolder?.id !== handler.id) throw new Error("Widening the bridge changed the lead holder");
}

world.afterEvents.worldLoad.subscribe(async () => {
  try {
    const dimension = world.getDimension("overworld");
    await world.tickingAreaManager.createTickingArea("expedition_trail_fixture", {
      dimension, from: trailAt(1, 1, 228), to: trailAt(15, 15, 237),
    });
    world.gameRules.doMobSpawning = false;
    world.setTimeOfDay(1000);
    stone(dimension, 1, 3, 5, 13);
    stone(dimension, 10, 3, 15, 13);
    const owner = spawnSimulatedPlayer({ dimension, ...START, z: 6.5 }, "TrailOwner", GameMode.Survival);
    const guest = spawnSimulatedPlayer({ dimension, ...OTHER_SIDE, z: 5.5 }, "TrailGuest", GameMode.Survival);
    const dog = dimension.spawnEntity(YORKIE, START);
    await system.waitTicks(4);
    if (!dog.getComponent("minecraft:tameable")?.tame(owner)) throw new Error("Fixture dog did not tame");
    const id = dog.id;
    await verifyNarrowCrossing(dimension, dog, owner, false);
    owner.teleport(trailAt(2.5, 5.5));
    dog.triggerEvent("mushroom_yorkie:equip_harness");
    await system.waitTicks(3);
    await verifyNarrowCrossing(dimension, dog, guest, true);
    if (dog.id !== id || dog.getComponent("minecraft:is_tamed")?.tamedToPlayerId !== owner.id
      || dog.getComponent("minecraft:health")?.currentValue <= 0) {
      throw new Error("The original living dog or owner record changed on the trail");
    }
    console.warn("MUSHROOM_EXPEDITION_TRAIL_PASS " + id);
  } catch (error) {
    console.warn("MUSHROOM_TEST_FAIL " + String(error) + "\n" + (error.stack ?? ""));
  }
});
