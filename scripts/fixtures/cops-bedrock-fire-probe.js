import { BlockVolume, GameMode, ItemStack, system, world } from "@minecraft/server";
import { spawnSimulatedPlayer } from "@minecraft/server-gametest";

const FIRE = "minecraft:fire";
const CREW_FIRE = { x: 15, y: 235, z: 10 };
const FRONT_FIRE = { x: 40, y: 235, z: 13 };
const BLOCKED_FIRE = { x: 42, y: 235, z: 14 };
const REAR_FIRE = { x: 40, y: 235, z: 3 };

function light(dimension, location) {
  dimension.setBlockType({ ...location, y: location.y - 1 }, "minecraft:netherrack");
  dimension.setBlockType(location, FIRE);
}

async function waitFor(condition, failure, ticks = 120) {
  for (let elapsed = 0; elapsed < ticks; elapsed += 2) {
    if (condition()) {
      return;
    }
    await system.waitTicks(2);
  }
  throw new Error(failure());
}

async function verifyDispatch(dimension) {
  const bank = world.structureManager.get("cops_robbers:bank");
  const station = world.structureManager.get("cops_robbers:police_station");
  world.structureManager.place(bank, dimension, { x: 64, y: 235, z: 6 });
  world.structureManager.place(station, dimension, { x: 82, y: 235, z: 6 });
  dimension.spawnEntity("cops_robbers:teller", { x: 70.5, y: 236, z: 11.5 });
  dimension.spawnEntity("cops_robbers:cop", { x: 85.5, y: 236, z: 8.5 });
  const vault = dimension.getBlock({ x: 73, y: 237, z: 16 }).getComponent("minecraft:inventory").container;
  vault.setItem(0, new ItemStack("minecraft:gold_ingot", 8));
  const dispatch = { x: 70, y: 235, z: 2 };
  dimension.setBlockType({ ...dispatch, y: 234 }, "minecraft:netherrack");
  const player = spawnSimulatedPlayer({ dimension, x: 69.5, y: 236, z: 10.5 }, "CopsFireDispatcher", GameMode.Survival);
  await system.waitTicks(10);
  player.setItem(new ItemStack("cops_robbers:vehicle_controls"), 0, true);
  if (!player.useItemInSlot(0)) {
    throw new Error("The bank dispatch could not be started through native item use");
  }
  await waitFor(() => dimension.getBlock(dispatch)?.typeId === FIRE, () => "The bank call did not light the prepared pad");
  if (vault.getItem(0)) {
    throw new Error("The fire call did not accompany a real bank robbery");
  }
  player.disconnect();
  console.warn("COPS_FIRE_DISPATCHED");
}

world.afterEvents.worldLoad.subscribe(async () => {
  try {
    const dimension = world.getDimension("overworld");
    await world.tickingAreaManager.createTickingArea("cops_fire_tests", {
      dimension, from: { x: 0, y: 232, z: 0 }, to: { x: 95, y: 239, z: 19 },
    });
    world.gameRules.doFireTick = false;
    dimension.fillBlocks(new BlockVolume({ x: 0, y: 234, z: 0 }, { x: 95, y: 234, z: 19 }), "minecraft:stone");
    const isBurning = (location) => dimension.getBlock(location)?.typeId === FIRE;
    light(dimension, CREW_FIRE);
    const firefighter = dimension.spawnEntity("cops_robbers:fireman", { x: 6.5, y: 235, z: 10.5 });
    await waitFor(() => !isBurning(CREW_FIRE), () => "The firefighter did not approach and extinguish the fire: "
      + JSON.stringify(firefighter.location));
    if (firefighter.location.x <= 10.5) {
      throw new Error("The firefighter extinguished the fire without walking to it");
    }
    firefighter.remove();
    console.warn("COPS_FIRE_CREW_RESPONDED");

    for (const fire of [FRONT_FIRE, BLOCKED_FIRE, REAR_FIRE]) {
      light(dimension, fire);
    }
    dimension.fillBlocks(new BlockVolume({ x: 41, y: 235, z: 11 }, { x: 44, y: 237, z: 11 }), "minecraft:stone");
    const truck = dimension.spawnEntity("cops_robbers:fire_truck", { x: 40.5, y: 235, z: 8.5 });
    truck.setRotation({ x: 0, y: 0 });
    const driver = spawnSimulatedPlayer({ dimension, x: 38.5, y: 235, z: 8.5 }, "CopsFireDriver", GameMode.Survival);
    await system.waitTicks(24);
    if (!isBurning(FRONT_FIRE)) {
      throw new Error("An empty fire truck extinguished the fire");
    }
    driver.interactWithEntity(truck);
    await waitFor(() => !isBurning(FRONT_FIRE), () => "The occupied fire truck did not extinguish the fire ahead");
    if (!isBurning(BLOCKED_FIRE) || !isBurning(REAR_FIRE)) {
      throw new Error("The fire truck extinguished a fire behind a wall or behind the truck");
    }
    const turning = { x: 0, y: 180 };
    truck.setRotation(turning);
    driver.setRotation(turning);
    driver.moveRelative(0, 1, 1);
    try {
      await waitFor(() => !isBurning(REAR_FIRE), () => "The driven truck did not respond after turning around: "
        + JSON.stringify({ truck: truck.location, rotation: truck.getRotation(), driver: driver.location }), 35);
    } finally {
      driver.stopMoving();
    }
    driver.disconnect();
    await verifyDispatch(dimension);
    console.warn("COPS_FIRE_RESPONSE_PLAYABLE");
  } catch (error) {
    console.warn("COPS_TEST_FAIL " + String(error) + "\n" + (error.stack ?? ""));
  }
});
