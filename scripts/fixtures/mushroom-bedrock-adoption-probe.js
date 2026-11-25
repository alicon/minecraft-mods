import { BlockVolume, Direction, GameMode, ItemStack, system, world } from "@minecraft/server";
import { spawnSimulatedPlayer } from "@minecraft/server-gametest";

const YORKIE = "mushroom_yorkie:mushroom_yorkie";
const ORDERED_SIT = "mushroom_yorkie:ordered_sit";

async function waitFor(predicate, message, ticks = 180) {
  for (let tick = 0; tick < ticks; tick += 2) {
    if (predicate()) {
      return;
    }
    await system.waitTicks(2);
  }
  throw new Error(message);
}

function placeBed(owner, dimension, z) {
  const floor = { x: 6, y: 230, z };
  const bed = { ...floor, y: 231 };
  owner.setItem(new ItemStack("minecraft:bed"), 0, true);
  owner.setRotation({ x: 40, y: -90 });
  owner.useItemInSlotOnBlock(0, floor, Direction.Up);
  if (dimension.getBlock(bed)?.typeId !== "minecraft:bed") {
    throw new Error("The simulated Survival player could not place a bed");
  }
  return bed;
}

function petsOf(dimension, player) {
  return dimension.getEntities({ type: YORKIE }).filter((pet) =>
    pet.getComponent("minecraft:is_tamed")?.tamedToPlayerId === player.id);
}

async function sleepNight(first, firstBed, second, secondBed, stillLost = () => true) {
  const rotation = { x: 40, y: -90 };
  first.stopInteracting();
  second.stopInteracting();
  first.setRotation(rotation);
  second.setRotation(rotation);
  await system.waitTicks(3);
  const night = world.getAbsoluteTime();
  first.interactWithBlock(firstBed, Direction.Up);
  second.interactWithBlock(secondBed, Direction.Up);
  await waitFor(() => first.isSleeping && second.isSleeping, "Both Survival players should be asleep", 50);
  await waitFor(() => {
    if (first.isSleeping && !stillLost()) {
      throw new Error("Native following returned the lost pet before its owner woke");
    }
    return !first.isSleeping && !second.isSleeping && world.getAbsoluteTime() - night > 200;
  }, "Both players should wake after a successful night");
}

async function orderSit(owner, pet, sit) {
  if (pet.getProperty(ORDERED_SIT) === sit) {
    return;
  }
  owner.teleport({ ...pet.location, x: pet.location.x - 1.5 });
  owner.getComponent("minecraft:inventory").container.setItem(owner.selectedSlotIndex, undefined);
  owner.interactWithEntity(pet);
  await waitFor(() => pet.getProperty(ORDERED_SIT) === sit, "The Yorkie should respond to his owner's sit or follow order", 40);
}

async function separatePets(dimension, lost, ordered, first, second) {
  const from = { x: 91, y: 230, z: 1 };
  const to = { x: 104, y: 235, z: 15 };
  await world.tickingAreaManager.createTickingArea("mushroom_lost", { dimension, from, to });
  dimension.fillBlocks(new BlockVolume(from, { ...to, y: from.y }), "minecraft:stone");
  // The bed platforms keep one-block landing space for wake-up recovery and
  // remove the wider floor used by the normal follow-owner teleport.
  for (const [x1, z1, x2, z2] of [[1, 1, 5, 15], [9, 1, 15, 15], [6, 1, 8, 2], [6, 5, 8, 8], [6, 11, 8, 15]]) {
    dimension.fillBlocks(new BlockVolume({ x: x1, y: 230, z: z1 }, { x: x2, y: 230, z: z2 }), "minecraft:air");
  }
  first.teleport({ x: 7.5, y: 231.65, z: 4.5 });
  second.teleport({ x: 7.5, y: 231.65, z: 10.5 });
  lost.teleport({ x: 96.5, y: 231, z: 6.5 });
  ordered.teleport({ x: 100.5, y: 231, z: 10.5 });
  await system.waitTicks(10);
  if (lost.location.x < 91 || ordered.location.x < 91 || lost.getProperty(ORDERED_SIT) !== false
    || ordered.getProperty(ORDERED_SIT) !== true) {
    throw new Error("The pets did not stay at the distant platform with their original orders");
  }
}

world.afterEvents.worldLoad.subscribe(async () => {
  try {
    const dimension = world.getDimension("overworld");
    const from = { x: 1, y: 230, z: 1 };
    const to = { x: 15, y: 234, z: 15 };
    await world.tickingAreaManager.createTickingArea("mushroom_sleep", { dimension, from, to });
    dimension.fillBlocks(new BlockVolume(from, { ...to, y: 230 }), "minecraft:stone");
    world.gameRules.playersSleepingPercentage = 100;
    world.setTimeOfDay(13500);
    const first = spawnSimulatedPlayer({ dimension, x: 4.5, y: 231, z: 4.5 }, "MushroomSleeperOne", GameMode.Survival);
    const second = spawnSimulatedPlayer({ dimension, x: 4.5, y: 231, z: 10.5 }, "MushroomSleeperTwo", GameMode.Survival);
    await system.waitTicks(5);
    const firstBed = placeBed(first, dimension, 4);
    const secondBed = placeBed(second, dimension, 10);
    await sleepNight(first, firstBed, second, secondBed);
    await waitFor(() => petsOf(dimension, first).length === 1 && petsOf(dimension, second).length === 1,
      "One independently owned Yorkie should appear for each sleeper", 100);
    console.warn("MUSHROOM_ADOPTION_TWO_OWNERS");
    const [lost] = petsOf(dimension, first);
    const [ordered] = petsOf(dimension, second);
    await system.waitTicks(6);
    await orderSit(first, lost, false);
    await orderSit(second, ordered, true);
    await separatePets(dimension, lost, ordered, first, second);
    world.setAbsoluteTime((world.getDay() + 1) * 24000 + 13500);
    await sleepNight(first, firstBed, second, secondBed, () => lost.location.x >= 91);
    await waitFor(() => lost.location.x < 12 && petsOf(dimension, first)[0]?.id === lost.id,
      "The same following Yorkie should return after a night away", 100);
    if (ordered.location.x < 91 || petsOf(dimension, first).length !== 1 || petsOf(dimension, second).length !== 1) {
      throw new Error("A sitting Yorkie moved or an owner received a duplicate");
    }
    console.warn("MUSHROOM_ADOPTION_RECOVERY");
    first.disconnect();
    second.disconnect();
  } catch (error) {
    console.warn("MUSHROOM_TEST_FAIL " + String(error) + "\n" + (error.stack ?? ""));
  }
});
