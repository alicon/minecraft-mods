import { BlockVolume, Direction, GameMode, ItemStack, system, WeatherType, world } from "@minecraft/server";
import { spawnSimulatedPlayer } from "@minecraft/server-gametest";

const PLACED = "cops_smoke:kits_placed";
const BANK = { x: 8, y: 210, z: 6 };
const POLICE = { x: 36, y: 210, z: 10 };
const FIRE = { x: 52, y: 210, z: 22 };
const BANK_PLAYER = { x: 8.5, y: 211, z: 4.5 };

async function itemOnGround(player, position) {
  player.stopInteracting();
  // Give the native use action time to release before the next press.
  await system.waitTicks(18);
  if (!player.useItemInSlotOnBlock(0, position, Direction.Up)) {
    throw new Error("Native input did not reach the kit target " + JSON.stringify(position));
  }
}

function getItemId(player) {
  return player.getComponent("minecraft:inventory").container.getItem(0)?.typeId;
}

function assertBlock(dimension, position, id) {
  const block = dimension.getBlock(position);
  if (block?.typeId !== id) {
    throw new Error("Expected " + id + " at " + JSON.stringify(position) + ", got " + block?.typeId);
  }
  return block;
}

function assertPlaced(dimension) {
  assertBlock(dimension, { ...BANK, y: 211 }, "minecraft:oak_planks");
  assertBlock(dimension, { x: 11, y: 212, z: 16 }, "minecraft:gold_block");
  const chest = assertBlock(dimension, { x: 11, y: 213, z: 16 }, "minecraft:chest");
  const gold = chest.getComponent("minecraft:inventory").container.getItem(0);
  if (gold?.typeId !== "minecraft:gold_ingot" || gold.amount !== 8) {
    throw new Error("The bank vault gold was missing or duplicated");
  }
  const jailDoor = assertBlock(dimension, { x: 29, y: 212, z: 9 }, "minecraft:iron_door");
  const upper = assertBlock(dimension, { x: 29, y: 213, z: 9 }, "minecraft:iron_door");
  if (jailDoor.permutation.getState("minecraft:cardinal_direction") !== "south"
    || upper.permutation.getState("upper_block_bit") !== true) {
    throw new Error("The rotated jail door did not keep its orientation or upper half");
  }
  assertBlock(dimension, { x: 28, y: 212, z: 9 }, "minecraft:iron_bars");
  assertBlock(dimension, { x: 36, y: 211, z: 13 }, "minecraft:yellow_concrete");
  assertBlock(dimension, { x: 36, y: 212, z: 13 }, "minecraft:air");
  assertBlock(dimension, { ...FIRE, y: 211 }, "minecraft:yellow_concrete");
  assertBlock(dimension, { ...FIRE, y: 212 }, "minecraft:air");
  assertBlock(dimension, { x: 48, y: 212, z: 22 }, "minecraft:wooden_door");
  for (const [crew, count] of [["cop", 1], ["teller", 3], ["fireman", 3]]) {
    if (dimension.getEntities({ type: "cops_robbers:" + crew }).length !== count) {
      throw new Error("Wrong crew count for " + crew);
    }
  }
}

async function aim(player, position, yaw, kit) {
  player.teleport(position);
  player.setRotation({ x: 40, y: yaw });
  player.setItem(new ItemStack("cops_robbers:" + kit + "_kit"), 0, true);
  await system.waitTicks(3);
}

async function verifyPreviewAndPlace(dimension, player, at) {
  await itemOnGround(player, at);
  await system.waitTicks(5);
  assertBlock(dimension, { ...at, y: at.y + 1 }, "minecraft:air");
  if (!getItemId(player)) {
    throw new Error("The preview used up the kit");
  }
  await itemOnGround(player, at);
  await system.waitTicks(6);
  if (getItemId(player)) {
    throw new Error("The completed Survival kit did not consume its item");
  }
}

world.afterEvents.worldLoad.subscribe(async () => {
  try {
    const dimension = world.getDimension("overworld");
    const from = { x: 0, y: 208, z: 0 };
    const to = { x: 62, y: 219, z: 27 };
    await world.tickingAreaManager.createTickingArea("cops_kit_tests", { dimension, from, to });
    if (world.getDynamicProperty(PLACED) === true) {
      assertPlaced(dimension);
      console.warn("COPS_KITS_PERSISTED");
      return;
    }
    world.gameRules.doWeatherCycle = false;
    world.gameRules.doMobSpawning = false;
    dimension.setWeather(WeatherType.Clear);
    dimension.fillBlocks(new BlockVolume({ ...from, y: 211 }, { ...to, y: 216 }), "minecraft:air");
    dimension.fillBlocks(new BlockVolume({ ...from, y: 210 }, { ...to, y: 210 }), "minecraft:stone");
    world.setTimeOfDay(1000);
    const builder = spawnSimulatedPlayer({ dimension, ...BANK_PLAYER }, "CopsKitBuilder", GameMode.Survival);
    const visitor = spawnSimulatedPlayer({ dimension, x: 18.5, y: 211, z: 3.5 }, "CopsKitVisitor", GameMode.Survival);
    await aim(builder, BANK_PLAYER, 0, "bank");
    const obstruction = { x: 6, y: 211, z: 10 };
    dimension.setBlockType(obstruction, "minecraft:oak_planks");
    await itemOnGround(builder, BANK);
    await system.waitTicks(4);
    await itemOnGround(builder, BANK);
    await system.waitTicks(5);
    assertBlock(dimension, obstruction, "minecraft:oak_planks");
    assertBlock(dimension, { ...BANK, y: 211 }, "minecraft:air");
    if (getItemId(builder) !== "cops_robbers:bank_kit") {
      throw new Error("The obstructed site consumed the kit");
    }
    dimension.setBlockType(obstruction, "minecraft:air");

    visitor.teleport({ x: 8.5, y: 211, z: 9.5 });
    await itemOnGround(builder, BANK);
    await system.waitTicks(5);
    await itemOnGround(builder, BANK);
    await system.waitTicks(5);
    assertBlock(dimension, { ...BANK, y: 211 }, "minecraft:air");
    visitor.teleport({ x: 18.5, y: 211, z: 3.5 });
    await itemOnGround(builder, BANK);
    await system.waitTicks(6);
    if (getItemId(builder)) {
      throw new Error("The bank kit did not place after the visitor moved");
    }

    await aim(builder, { x: 38.5, y: 211, z: 10.5 }, 90, "police_station");
    const gap = { x: 26, y: 210, z: 8 };
    dimension.setBlockType(gap, "minecraft:air");
    await itemOnGround(builder, POLICE);
    await system.waitTicks(4);
    await itemOnGround(builder, POLICE);
    await system.waitTicks(4);
    assertBlock(dimension, { ...POLICE, y: 211 }, "minecraft:air");
    if (getItemId(builder) !== "cops_robbers:police_station_kit") {
      throw new Error("The uneven site consumed the kit");
    }
    dimension.setBlockType(gap, "minecraft:stone");
    await verifyPreviewAndPlace(dimension, builder, POLICE);

    await aim(builder, { x: 52.5, y: 211, z: 24.5 }, 180, "fire_station");
    await verifyPreviewAndPlace(dimension, builder, FIRE);
    assertPlaced(dimension);
    world.setDynamicProperty(PLACED, true);
    console.warn("COPS_KITS_PLACED");
    builder.disconnect();
    visitor.disconnect();
  } catch (error) {
    console.warn("COPS_TEST_FAIL " + String(error) + "\n" + (error.stack ?? ""));
  }
});
