import { BlockVolume, GameMode, ItemStack, system, WeatherType, world } from "@minecraft/server";
import { spawnSimulatedPlayer } from "@minecraft/server-gametest";
import cycle from "./regroup-cycle.js";

const CHARM = "narwhal_together:regroup_charm";

function distance(first, second) {
  return Math.hypot(first.x - second.x, first.y - second.y, first.z - second.z);
}

function playerAt(dimension, x, y, z, name, gameMode = GameMode.Survival) {
  return spawnSimulatedPlayer({ dimension, x, y, z }, name, gameMode);
}

async function use(player) {
  player.stopUsingItem();
  await system.waitTicks(18);
  if (!player.useItemInSlot(0)) {
    throw new Error(player.name + " could not use the charm with the normal item action");
  }
  await system.waitTicks(5);
  if (player.getComponent("minecraft:inventory").container.getItem(0)?.typeId !== CHARM) {
    throw new Error("Using the charm consumed it");
  }
}

function assertRegrouped(player, target) {
  const separation = distance(player.location, target.location);
  if (player.dimension.id !== target.dimension.id || separation < 0.85 || separation > 5) {
    const { x, y, z } = target.location;
    const support = target.dimension.getBlockFromRay({ x: Math.floor(x) - 0.5, y: Math.floor(y) + 0.5, z: Math.floor(z) + 0.5 },
      { x: 0, y: -1, z: 0 }, { maxDistance: 1.5, includePassableBlocks: false, includeLiquidBlocks: false });
    throw new Error(player.name + " did not land beside " + target.name + ": " + JSON.stringify({
      player: player.location, target: target.location, playerDimension: player.dimension.id,
      targetDimension: target.dimension.id, online: world.getAllPlayers().map((member) => member.name),
      support: support?.block.typeId, hit: support?.faceLocation,
    }));
  }
}

async function buildPlatform(dimension, name, from, to) {
  await world.tickingAreaManager.createTickingArea(name, { dimension, from, to });
  dimension.fillBlocks(new BlockVolume({ ...from, y: from.y + 1 }, { ...to, y: from.y + 4 }), "minecraft:air");
  dimension.fillBlocks(new BlockVolume(from, { ...to, y: from.y }), "minecraft:stone");
}

async function verifyMountedAndFalling(indigo, birch, casey) {
  await system.waitTicks(25);
  const dimension = indigo.dimension;
  const boat = dimension.spawnEntity("minecraft:boat", { x: 4.5, y: 235, z: 20.5 });
  indigo.teleport({ x: 6.5, y: 235, z: 20.5 });
  indigo.stopInteracting();
  await system.waitTicks(5);
  indigo.interactWithEntity(boat);
  await system.waitTicks(8);
  const rideable = boat.getComponent("minecraft:rideable");
  if (!rideable.getRiders().some((rider) => rider.id === indigo.id)) {
    throw new Error("Indigo could not board the boat using native interaction");
  }
  await use(indigo);
  assertRegrouped(indigo, birch);
  if (indigo.getComponent("minecraft:riding") || rideable.getRiders().length) {
    throw new Error("Regroup did not leave the boat behind");
  }
  console.warn("NARWHAL_DISMOUNTED");

  await system.waitTicks(27);
  const health = indigo.getComponent("minecraft:health");
  const before = health.currentValue;
  indigo.teleport({ x: 18.5, y: 275, z: 18.5 });
  await use(indigo);
  assertRegrouped(indigo, casey);
  await system.waitTicks(10);
  if (health.currentValue !== before) {
    throw new Error("Fall velocity or damage carried through the regroup");
  }
  console.warn("NARWHAL_CLEARED_FALL");
}

world.afterEvents.worldLoad.subscribe(async () => {
  try {
    const overworld = world.getDimension("overworld");
    const nether = world.getDimension("nether");
    await buildPlatform(overworld, "narwhal_regroup_overworld", { x: 0, y: 234, z: 0 }, { x: 55, y: 245, z: 38 });
    await buildPlatform(nether, "narwhal_regroup_nether", { x: 0, y: 100, z: 0 }, { x: 22, y: 106, z: 22 });
    world.gameRules.doMobSpawning = false;
    world.gameRules.doWeatherCycle = false;
    overworld.setWeather(WeatherType.Clear);
    const indigo = playerAt(overworld, 7.5, 235, 15.5, "Indigo");
    indigo.setItem(new ItemStack(CHARM), 0, true);
    await system.waitTicks(12);
    const initial = indigo.location;
    await use(indigo);
    if (distance(indigo.location, initial) > 0.5) {
      throw new Error("A solo player moved after using the charm: " + JSON.stringify({ initial, now: indigo.location }));
    }
    const casey = playerAt(nether, 13.5, 101, 12.5, cycle.joinOrder[0]);
    const birch = playerAt(overworld, 46.5, 235, 12.5, cycle.joinOrder[1]);
    const ash = playerAt(overworld, 23.5, 235, 17.5, cycle.joinOrder[2]);
    const joined = new Map([casey, birch, ash].map((player) => [player.name, player]));
    const [first, second, third, wrapped] = cycle.expectedCycle.map((name) => joined.get(name));
    const spectator = playerAt(overworld, 9.5, 235, 27.5, "Aardvark", GameMode.Spectator);
    await use(indigo);
    assertRegrouped(indigo, first);
    await use(indigo);
    assertRegrouped(indigo, first);
    console.warn("NARWHAL_ORDER_SPECTATOR_COOLDOWN");
    await system.waitTicks(27);
    await use(indigo);
    assertRegrouped(indigo, second);

    const yara = playerAt(overworld, 6.5, 235, 5.5, "Yara");
    yara.setItem(new ItemStack(CHARM), 0, true);
    const unsafe = { x: 16, y: 242, z: 32 };
    overworld.setBlockType(unsafe, "minecraft:stone");
    casey.teleport({ x: 16.5, y: 243, z: 32.5 }, { dimension: overworld, forceProvidedPositionOnDimensionChange: true });
    await system.waitTicks(27);
    await use(indigo);
    assertRegrouped(indigo, second);
    casey.teleport({ x: 13.5, y: 101, z: 12.5 }, { dimension: nether, forceProvidedPositionOnDimensionChange: true });
    await Promise.all([use(indigo), use(yara)]);
    assertRegrouped(indigo, third);
    assertRegrouped(yara, first);
    console.warn("NARWHAL_SAFE_CROSS_DIMENSION_CONCURRENT");

    await system.waitTicks(26);
    // Yara comes after the other eligible names. Removing that target tests the ordinary wrap to Ash.
    yara.disconnect();
    await use(indigo);
    assertRegrouped(indigo, wrapped);
    await verifyMountedAndFalling(indigo, birch, casey);

    const end = world.getDimension("the_end");
    await buildPlatform(end, "narwhal_regroup_end", { x: 194, y: 88, z: 194 }, { x: 220, y: 94, z: 220 });
    const drew = playerAt(end, 206.5, 89, 206.5, "Drew");
    await system.waitTicks(26);
    await use(indigo);
    assertRegrouped(indigo, drew);
    console.warn("NARWHAL_REGROUP_END");
    for (const member of [indigo, casey, birch, ash, spectator, drew]) {
      member.disconnect();
    }
    console.warn("NARWHAL_REGROUP_PLAYABLE");
  } catch (error) {
    console.warn("NARWHAL_TEST_FAIL " + String(error) + "\n" + (error.stack ?? ""));
  }
});
