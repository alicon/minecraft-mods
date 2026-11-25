import { BlockVolume, GameMode, ItemStack, system, WeatherType, world } from "@minecraft/server";
import { spawnSimulatedPlayer } from "@minecraft/server-gametest";

const SAVE = "cops_smoke:jail";
const ROBBER = "cops_robbers:bank_robber";
const CONCEALED = "cops_robbers:concealed";
const JAILBREAKER = "cops_robbers:jailbreaker";
const STREET = 252;

function distance(first, second) {
  return Math.hypot(first.x - second.x, first.y - second.y, first.z - second.z);
}

async function waitFor(condition, failure, ticks = 100) {
  for (let elapsed = 0; elapsed < ticks; elapsed += 2) {
    if (condition()) {
      return;
    }
    await system.waitTicks(2);
  }
  throw new Error(failure());
}

function vaultGold(dimension, scene) {
  return dimension.getBlock(scene.vault).getComponent("minecraft:inventory").container.getItem(0);
}

function insideCell(robber, scene) {
  const { x, y, z } = robber.location;
  return Math.abs(y - scene.jail.y) < 0.6 && x >= scene.jail.x - 3 && x < scene.gate.x + 0.5
    && z >= scene.gate.z - 2.5 && z < scene.gate.z + 3.5;
}

async function talk(player) {
  player.setItem(new ItemStack("cops_robbers:vehicle_controls"), 0, true);
  await system.waitTicks(10);
  if (!player.useItemInSlot(0)) {
    throw new Error("The test player could not use Vehicle Controls at the bank");
  }
  await system.waitTicks(5);
}

async function sendToJail(dimension, bankX, name, escape) {
  const stationX = bankX + 16;
  world.structureManager.place(world.structureManager.get("cops_robbers:bank"), dimension, { x: bankX, y: STREET, z: 6 });
  world.structureManager.place(world.structureManager.get("cops_robbers:police_station"), dimension, { x: stationX, y: STREET, z: 6 });
  const teller = { x: bankX + 6.5, y: STREET + 1, z: 11.5 };
  dimension.spawnEntity("cops_robbers:teller", teller);
  dimension.spawnEntity("cops_robbers:cop", { x: stationX + 3.5, y: STREET + 1, z: 8.5 });
  const jail = { x: stationX + 3.5, y: STREET + 1, z: 14.5 };
  const gate = { x: stationX + 5, y: STREET + 1, z: 13 };
  const vault = { x: bankX + 9, y: STREET + 2, z: 16 };
  const chest = dimension.getBlock(vault).getComponent("minecraft:inventory").container;
  chest.setItem(0, new ItemStack("minecraft:gold_ingot", 8));
  const spectator = spawnSimulatedPlayer({ dimension, ...teller, x: teller.x - 1.5, z: teller.z + 1 }, name + "Teller", GameMode.Survival);
  await talk(spectator);
  const [robber] = dimension.getEntities({ type: ROBBER, location: teller, maxDistance: 18, closest: 1 });
  if (!robber || chest.getItem(0)) {
    throw new Error("No robbery began through normal play for " + name);
  }

  const start = { x: stationX + 9.5, y: STREET, z: 2.5 };
  const cruiser = dimension.spawnEntity("cops_robbers:police_cruiser", start);
  const direction = { x: 0, y: 0 };
  cruiser.setRotation(direction);
  const driver = spawnSimulatedPlayer({ dimension, ...start, x: start.x + 1.6 }, name + "Driver", GameMode.Survival);
  await system.waitTicks(8);
  driver.interactWithEntity(cruiser);
  await waitFor(() => cruiser.getComponent("minecraft:rideable").getRiders().some((rider) => rider.id === driver.id),
    () => "The test driver could not board the cruiser");
  // Put the chase in the road and approach the jail with native forward input.
  robber.teleport({ ...start, z: start.z + 2 });
  await waitFor(() => robber.getProperty(CONCEALED), () => "The driver did not capture the robber");
  cruiser.setRotation(direction);
  driver.setRotation(direction);
  driver.moveRelative(0, 1, 1);
  try {
    await waitFor(() => !robber.getProperty(CONCEALED) && distance(robber.location, jail) < 0.6,
      () => "The driver did not deliver the robber to jail: " + JSON.stringify({ car: cruiser.location, robber: robber.location }));
  } finally {
    driver.stopMoving();
  }

  // Choose the native sentence branch explicitly so the tests do not depend on the 10% roll.
  robber.triggerEvent(escape ? "cops_robbers:night_jailbreaker" : "cops_robbers:jailed");
  if (!escape) {
    spectator.stopUsingItem();
    await system.waitTicks(18);
    await talk(spectator);
    if (chest.getItem(0)?.amount !== 8) {
      throw new Error("The completed patrol did not return the gold");
    }
  }
  driver.disconnect();
  spectator.disconnect();
  return { id: robber.id, jail, gate, vault };
}

world.afterEvents.worldLoad.subscribe(async () => {
  try {
    const dimension = world.getDimension("overworld");
    await world.tickingAreaManager.createTickingArea("cops_jail_tests", {
      dimension, from: { x: 0, y: STREET - 1, z: 0 }, to: { x: 87, y: STREET + 7, z: 22 },
    });
    const data = world.getDynamicProperty(SAVE);
    if (typeof data !== "string") {
      world.gameRules.doMobSpawning = false;
      world.gameRules.doWeatherCycle = false;
      world.gameRules.doDayLightCycle = false;
      dimension.setWeather(WeatherType.Clear);
      world.setTimeOfDay(1000);
      dimension.fillBlocks(new BlockVolume({ x: 0, y: STREET - 1, z: 0 }, { x: 87, y: STREET - 1, z: 22 }), "minecraft:stone");
      const served = await sendToJail(dimension, 4, "CopsOrdinary", false);
      const escape = await sendToJail(dimension, 48, "CopsEscape", true);
      world.setDynamicProperty(SAVE, JSON.stringify({ served, escape }));
      console.warn("COPS_JAIL_SENTENCES_SAVED");
      return;
    }
    const { served, escape } = JSON.parse(data);
    await system.waitTicks(12);
    const robber = world.getEntity(served.id);
    const jailbreaker = world.getEntity(escape.id);
    if (!robber?.isValid || !jailbreaker?.isValid || !insideCell(robber, served)
      || !insideCell(jailbreaker, escape) || robber.getProperty(JAILBREAKER)
      || !jailbreaker.getProperty(JAILBREAKER)) {
      throw new Error("The two actual jailed robbers and their sentence choices did not survive restart: " + JSON.stringify({
        ordinary: { position: robber?.location, jail: served.jail, special: robber?.getProperty(JAILBREAKER) },
        escape: { position: jailbreaker?.location, jail: escape.jail, special: jailbreaker?.getProperty(JAILBREAKER) },
      }));
    }
    world.setAbsoluteTime(world.getAbsoluteTime() + 25000);
    world.setTimeOfDay(1000);
    await waitFor(() => robber.location.z < 6, () => "The officer did not release the served prisoner");
    if (vaultGold(dimension, served)?.amount !== 8 || !insideCell(jailbreaker, escape)
      || vaultGold(dimension, escape)) {
      throw new Error("Normal release changed the gold or the jailbreaker escaped in daylight");
    }
    console.warn("COPS_JAIL_SERVED_RELEASE");
    world.setTimeOfDay(14000);
    await waitFor(() => jailbreaker.location.z < 6, () => "The selected robber did not escape at night");
    if (vaultGold(dimension, escape) || dimension.getBlock(escape.gate)?.typeId !== "minecraft:iron_door"
      || dimension.getBlock({ ...escape.gate, z: escape.gate.z + 1 })?.typeId !== "minecraft:iron_bars") {
      throw new Error("The escape changed the escrow or the station");
    }
    console.warn("COPS_JAIL_RELEASE_AND_ESCAPE");
  } catch (error) {
    console.warn("COPS_TEST_FAIL " + String(error) + "\n" + (error.stack ?? ""));
  }
});
