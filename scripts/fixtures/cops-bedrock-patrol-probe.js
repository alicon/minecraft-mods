import { BlockVolume, GameMode, ItemStack, system, world } from "@minecraft/server";
import { spawnSimulatedPlayer } from "@minecraft/server-gametest";

const SAVE = "cops_smoke:patrol";
const ROBBER = "cops_robbers:bank_robber";
const CRUISER = "cops_robbers:police_cruiser";
const HIDDEN = "cops_robbers:concealed";
const BANK = { x: 11, y: 213, z: 16 };
const GARAGE = { x: 32.5, y: 212, z: 13.5 };
const JAIL = { x: 28.5, y: 212, z: 7.5 };
const SECOND_BANK = { x: 72, y: 213, z: 16 };

async function waitFor(condition, label, ticks = 90) {
  for (let elapsed = 0; elapsed < ticks; elapsed += 2) {
    if (condition()) {
      return;
    }
    await system.waitTicks(2);
  }
  throw new Error(label);
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function chest(dimension, location = BANK) {
  return dimension.getBlock(location)?.getComponent("minecraft:inventory")?.container;
}

function expectGold(container, count) {
  if (!container) {
    throw new Error("The bank vault chest is unavailable");
  }
  const gold = container.getItem(0);
  if (count === 0 ? gold !== undefined : gold?.typeId !== "minecraft:gold_ingot" || gold.amount !== count) {
    throw new Error("Incorrect vault contents for expected gold " + count + ": " + gold?.typeId + "/" + gold?.amount);
  }
}

function riders(vehicle) {
  return vehicle.getComponent("minecraft:rideable").getRiders();
}

async function board(player, vehicle) {
  player.stopInteracting();
  await system.waitTicks(10);
  player.interactWithEntity(vehicle);
  await waitFor(() => riders(vehicle).some((rider) => rider.id === player.id), "Could not board the cruiser", 45);
}

async function talk(player, teller) {
  if (distance(player.location, teller.location) > 4.5) {
    throw new Error("The simulated player could not reach the teller");
  }
  player.stopUsingItem();
  await system.waitTicks(18);
  player.setItem(new ItemStack("cops_robbers:vehicle_controls"), 0, true);
  if (!player.useItemInSlot(0)) {
    throw new Error("The native patrol control was not used");
  }
  await system.waitTicks(4);
}

async function driveAlong(vehicle, player, axis, target) {
  const delta = target - vehicle.location[axis];
  if (Math.abs(delta) < 0.5) {
    return;
  }
  const sign = Math.sign(delta);
  const yaw = axis === "x" ? sign * -90 : sign > 0 ? 0 : 180;
  const heading = { x: 0, y: yaw };
  vehicle.setRotation(heading);
  player.setRotation(heading);
  player.moveRelative(0, 1, 1);
  try {
    await waitFor(() => sign * (vehicle.location[axis] - target) >= 0, "The cruiser did not finish a straight route segment", 180);
  } catch (error) {
    throw new Error(String(error) + " " + JSON.stringify({ axis, target, position: vehicle.location }));
  } finally {
    player.stopMoving();
  }
  await system.waitTicks(12);
}

async function startChase(dimension, driver, other, teller) {
  const vault = chest(dimension);
  expectGold(vault, 8);
  await talk(driver, teller);
  await talk(other, teller);
  expectGold(vault, 0);
  const robbers = dimension.getEntities({ type: ROBBER });
  if (robbers.length !== 1) {
    throw new Error("Concurrent teller requests did not share one robbery");
  }
  const [robber] = robbers;
  const locations = [{ x: 4.5, y: 211, z: 1.5 }, { x: 9.4, y: 211, z: 1.5 }];
  const cars = locations.map((location) => dimension.spawnEntity(CRUISER, location));
  driver.teleport({ ...locations[0], x: locations[0].x + 2 });
  other.teleport({ ...locations[1], x: locations[1].x + 2 });
  await board(driver, cars[0]);
  await board(other, cars[1]);
  // Begin with both drivers in range on the open road, independent of where the chase AI wandered.
  robber.teleport({ x: 6.85, y: 211, z: 1.5 });
  await waitFor(() => robber.getProperty(HIDDEN), "Neither driver captured the robber on the open road", 30);
  if (dimension.getEntities({ type: ROBBER }).length !== 1) {
    throw new Error("The drivers did not capture exactly one robber");
  }
  // The captured robber is pinned to the winning car, including after neutral braking.
  await system.waitTicks(8);
  const winner = cars.find((car) => distance(car.location, robber.location) < 0.5);
  if (!winner || cars.filter((car) => distance(car.location, robber.location) < 0.5).length !== 1) {
    throw new Error("The capture was not tied to one cruiser");
  }
  console.warn("COPS_PATROL_CONTESTED_CAPTURE");
  world.setDynamicProperty(SAVE, JSON.stringify({ phase: "caught", robber: robber.id, car: winner.id }));
}

async function resumePatrol(dimension, driver, other, teller, saved) {
  const robber = world.getEntity(saved.robber);
  const car = world.getEntity(saved.car);
  if (!robber?.getProperty(HIDDEN) || !car?.isValid) {
    throw new Error("The exact caught robber and cruiser did not survive restart");
  }
  expectGold(chest(dimension), 0);
  driver.teleport({ ...car.location, x: car.location.x + 2 });
  await board(driver, car);
  await driveAlong(car, driver, "z", 1.5);
  await driveAlong(car, driver, "x", 41.5);
  await driveAlong(car, driver, "z", GARAGE.z);
  await driveAlong(car, driver, "x", GARAGE.x + 2.1);
  await waitFor(() => !robber.getProperty(HIDDEN) && distance(robber.location, JAIL) < 0.6,
    "Garage drop-off did not move the captured robber to the jail cell");
  console.warn("COPS_PATROL_JAIL");

  world.gameRules.doDayLightCycle = false;
  const vault = chest(dimension);
  vault.setItem(0, new ItemStack("minecraft:paper", 1));
  await talk(other, teller);
  if (vault.getItem(0)?.typeId !== "minecraft:paper") {
    throw new Error("The payout overwrote an occupied vault slot");
  }
  vault.setItem(0, undefined);
  await talk(other, teller);
  expectGold(vault, 8);
  other.useItemInSlot(0);
  await system.waitTicks(4);
  expectGold(vault, 8);
  console.warn("COPS_PATROL_RETURN_ONCE");

  await system.waitTicks(43);
  await talk(other, teller);
  expectGold(vault, 0);
  const current = dimension.getEntities({ type: ROBBER });
  if (current.length !== 1 || current[0].id === saved.robber || current[0].getProperty(HIDDEN)) {
    throw new Error("Replay did not replace the previous jailed robber with a single new chase");
  }
  const defeated = current[0];
  defeated.kill();
  await waitFor(() => !defeated.isValid, "The defeated robber did not leave the scene", 60);
  await talk(other, teller);
  expectGold(vault, 0);
  const [replacement] = dimension.getEntities({ type: ROBBER });
  if (!replacement || replacement.id === defeated.id || dimension.getEntities({ type: ROBBER }).length !== 1) {
    throw new Error("Restarting a chase after the robber was defeated did not preserve one active robber and one escrow");
  }
  console.warn("COPS_PATROL_CHASE_REPLACED");
  const second = await testIndependentPatrol(dimension, other, replacement);
  world.setDynamicProperty(SAVE, JSON.stringify({ phase: "replay", robber: replacement.id, second: second.id }));
  console.warn("COPS_PATROL_REPLAYED");
}

async function testIndependentPatrol(dimension, player, firstRobber) {
  const bank = world.structureManager.get("cops_robbers:bank");
  const station = world.structureManager.get("cops_robbers:police_station");
  dimension.fillBlocks(new BlockVolume({ x: 61, y: 210, z: 2 }, { x: 78, y: 210, z: 46 }), "minecraft:stone");
  world.structureManager.place(bank, dimension, { x: 63, y: 211, z: 6 }, { includeEntities: false });
  const teller = dimension.spawnEntity("cops_robbers:teller", { x: 69.5, y: 212, z: 11.5 });
  const vault = chest(dimension, SECOND_BANK);
  vault.setItem(0, new ItemStack("minecraft:gold_ingot", 8));
  player.teleport({ x: 67.5, y: 212, z: 12.5 });
  await talk(player, teller);
  expectGold(vault, 8);
  if (dimension.getEntities({ type: ROBBER }).length !== 1) {
    throw new Error("A second bank reused an occupied jail");
  }
  world.structureManager.place(station, dimension, { x: 63, y: 211, z: 32 }, { includeEntities: false });
  dimension.spawnEntity("cops_robbers:cop", { x: 66.5, y: 212, z: 34.5 });
  await talk(player, teller);
  expectGold(vault, 0);
  expectGold(chest(dimension), 0);
  const current = dimension.getEntities({ type: ROBBER });
  const independent = current.find((robber) => robber.id !== firstRobber.id);
  if (current.length !== 2 || !firstRobber.isValid || !independent?.isValid) {
    throw new Error("Two banks and two jails did not start independent patrols");
  }
  console.warn("COPS_PATROL_INDEPENDENT");
  return independent;
}

world.afterEvents.worldLoad.subscribe(async () => {
  try {
    const dimension = world.getDimension("overworld");
    await world.tickingAreaManager.createTickingArea("cops_patrol_tests", {
      dimension, from: { x: 0, y: 207, z: -3 }, to: { x: 81, y: 221, z: 49 },
    });
    const data = world.getDynamicProperty(SAVE);
    const saved = typeof data === "string" ? JSON.parse(data) : undefined;
    if (saved?.phase === "replay") {
      expectGold(chest(dimension), 0);
      expectGold(chest(dimension, SECOND_BANK), 0);
      const robber = world.getEntity(saved.robber);
      const second = world.getEntity(saved.second);
      if (!robber?.isValid || robber.getProperty(HIDDEN) || !second?.isValid || second.getProperty(HIDDEN)
        || dimension.getEntities({ type: ROBBER }).length !== 2) {
        throw new Error("The two independent chases did not survive restart");
      }
      console.warn("COPS_PATROL_REPLAY_PERSISTED");
      return;
    }
    const teller = dimension.getEntities({ type: "cops_robbers:teller" }).find((member) => Math.abs(member.location.x - 8.5) < 0.6);
    if (!teller) {
      throw new Error("The previous-version bank kit did not load its teller");
    }
    const driver = spawnSimulatedPlayer({ dimension, x: 7.5, y: 212, z: 12.5 }, "CopsPatrolDriver", GameMode.Survival);
    const other = spawnSimulatedPlayer({ dimension, x: 9.5, y: 212, z: 12.5 }, "CopsPatrolPartner", GameMode.Survival);
    await system.waitTicks(5);
    if (saved) {
      await resumePatrol(dimension, driver, other, teller, saved);
    } else {
      dimension.fillBlocks(new BlockVolume({ x: 0, y: 210, z: -3 }, { x: 63, y: 210, z: -1 }), "minecraft:stone");
      await startChase(dimension, driver, other, teller);
    }
    driver.disconnect();
    other.disconnect();
  } catch (error) {
    console.warn("COPS_TEST_FAIL " + String(error) + "\n" + (error.stack ?? ""));
  }
});
