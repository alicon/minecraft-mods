import { BlockVolume, GameMode, system, world } from "@minecraft/server";
import { spawnSimulatedPlayer } from "@minecraft/server-gametest";

const YORKIE = "mushroom_yorkie:mushroom_yorkie";
const FLIGHT = "mushroom_yorkie:flight_mode";
const SIT = "mushroom_yorkie:ordered_sit";
const HOME_GOAL = "mushroom_yorkie:home_goal";
const FLOOR = 230;

async function waitFor(predicate, message, ticks = 120) {
  for (let tick = 0; tick < ticks; tick += 2) {
    if (predicate()) {
      return;
    }
    await system.waitTicks(2);
  }
  throw new Error(message);
}

world.afterEvents.worldLoad.subscribe(async () => {
  try {
    const dimension = world.getDimension("overworld");
    const from = { x: 1, y: FLOOR, z: 1 };
    const to = { x: 15, y: FLOOR + 20, z: 15 };
    await world.tickingAreaManager.createTickingArea("mushroom_flight", { dimension, from, to });
    dimension.fillBlocks(new BlockVolume(from, { ...to, y: FLOOR }), "minecraft:stone");
    world.setTimeOfDay(1000);

    const ground = { x: 6.5, y: FLOOR + 1, z: 6.5 };
    const air = { ...ground, y: FLOOR + 12 };
    const owner = spawnSimulatedPlayer({ dimension, ...ground }, "MushroomFlyer", GameMode.Creative);
    const pet = dimension.spawnEntity(YORKIE, { ...ground, x: ground.x + 1.5 }, {
      spawnEvent: "minecraft:entity_spawned",
    });
    await system.waitTicks(4);
    if (!pet.getComponent("minecraft:tameable")?.tame(owner)) {
      throw new Error("Could not tame the flight fixture pet");
    }
    await waitFor(() => pet.getComponent("minecraft:is_tamed")?.tamedToPlayerId === owner.id,
      "Pet did not acquire its Creative owner");
    owner.interactWithEntity(pet);
    await waitFor(() => pet.getProperty(SIT) === true, "Pet did not sit before takeoff");
    owner.fly();
    owner.teleport(air);
    await waitFor(() => owner.isFlying, "The Creative player could not enter flight");
    await system.waitTicks(18);
    if (pet.getProperty(FLIGHT) !== "ground" || pet.location.y > FLOOR + 1.5) {
      throw new Error("A sitting pet followed its Creative owner into the air");
    }

    owner.stopFlying();
    owner.teleport(ground);
    owner.stopInteracting();
    await system.waitTicks(5);
    owner.interactWithEntity(pet);
    await waitFor(() => pet.getProperty(SIT) === false, "Pet did not stand for takeoff");
    owner.fly();
    owner.teleport(air);
    await waitFor(() => pet.getProperty(FLIGHT) === "flying" && pet.location.y > air.y - 2,
      "The following pet did not rise to its flying owner");
    await system.waitTicks(16);
    if (Math.abs(pet.location.y - air.y) > 2) {
      throw new Error("The pet did not hold altitude near its hovering owner");
    }
    owner.teleport({ ...air, x: air.x + 5 });
    await waitFor(() => pet.location.x > air.x + 3, "The flying pet did not follow horizontally");
    console.warn("MUSHROOM_FLIGHT_FOLLOWED");

    owner.setGameMode(GameMode.Survival);
    owner.teleport(ground);
    await waitFor(() => pet.getProperty(FLIGHT) === "ground" && pet.isOnGround
      && Math.abs(pet.location.y - ground.y) < 0.5, "The pet did not land after the owner left Creative mode");
    if (pet.getComponent("minecraft:health")?.currentValue !== 20) {
      throw new Error("The pet took damage while landing");
    }

    const bed = { ...ground, x: 8.5 };
    dimension.setBlockType({ x: 8, y: FLOOR + 1, z: 6 }, "mushroom_yorkie:dog_bed");
    owner.setGameMode(GameMode.Creative);
    pet.teleport({ ...bed, y: bed.y + 3 / 16 });
    world.setTimeOfDay(14500);
    await waitFor(() => pet.getProperty(HOME_GOAL) === "sleep", "Mushroom did not settle on the dog bed");
    const settled = pet.location;
    const facing = pet.getRotation().y;
    owner.fly();
    for (const destination of [air, { ...air, x: 11.5, y: FLOOR + 34 }]) {
      owner.teleport(destination);
      await waitFor(() => owner.isFlying, "The Creative player could not take off near the bed");
      for (let tick = 0; tick < 24; tick += 2) {
        if (pet.getProperty(HOME_GOAL) !== "sleep" || pet.getProperty(FLIGHT) !== "ground"
          || Math.hypot(pet.location.x - settled.x, pet.location.y - settled.y, pet.location.z - settled.z) > 0.05
          || Math.abs(pet.getRotation().y - facing) > 0.1) {
          throw new Error("Sleeping Mushroom moved or turned toward his Creative owner");
        }
        await system.waitTicks(2);
      }
    }
    console.warn("MUSHROOM_FLIGHT_SLEEP");

    world.setTimeOfDay(1000);
    owner.teleport(air);
    await waitFor(() => pet.getProperty(HOME_GOAL) !== "sleep" && pet.getProperty(FLIGHT) === "flying",
      "Mushroom did not resume flight follow after waking at dawn");
    console.warn("MUSHROOM_FLIGHT_PASS");
  } catch (error) {
    console.error(`MUSHROOM_TEST_FAIL ${error?.message ?? error}\n${error?.stack ?? ""}`);
  }
});
