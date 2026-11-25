import { BlockVolume, GameMode, ItemStack, system, WeatherType, world } from "@minecraft/server";
import { spawnSimulatedPlayer } from "@minecraft/server-gametest";

const SIGNAL = "cops_robbers:signal_mode";
const CONTROLS = "cops_robbers:vehicle_controls";
const SAVED = "cops_smoke:vehicles";
const CRUISER = "cops_robbers:police_cruiser";
const TRUCK = "cops_robbers:fire_truck";
const FROM = { x: 0, y: 231, z: 0 };
const TO = { x: 47, y: 242, z: 39 };

async function waitFor(predicate, label, ticks = 65) {
  for (let elapsed = 0; elapsed < ticks; elapsed += 2) {
    if (predicate()) {
      return;
    }
    await system.waitTicks(2);
  }
  throw new Error(label);
}

function horizontalDistance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function rideable(vehicle) {
  return vehicle.getComponent("minecraft:rideable");
}

function riding(player, vehicle) {
  return rideable(vehicle).getRiders().some((rider) => rider.id === player.id);
}

async function board(player, vehicle) {
  player.stopInteracting();
  await system.waitTicks(5);
  const result = player.interactWithEntity(vehicle);
  await waitFor(() => riding(player, vehicle), "The player could not board using the native interaction: " + result);
}

async function useControls(player) {
  player.stopUsingItem();
  await system.waitTicks(10);
  player.setItem(new ItemStack(CONTROLS), 0, true);
  if (!player.useItemInSlot(0)) {
    throw new Error("The native vehicle control item was not used");
  }
  await system.waitTicks(4);
  if (player.getComponent("minecraft:inventory").container.getItem(0)?.typeId !== CONTROLS) {
    throw new Error("The signal control item was consumed");
  }
}

async function testCruiser(dimension, vehicle, driver, passenger) {
  await board(driver, vehicle);
  await board(passenger, vehicle);
  const start = vehicle.location;
  passenger.moveRelative(0, 1, 1);
  await system.waitTicks(14);
  passenger.stopMoving();
  if (horizontalDistance(start, vehicle.location) > 0.3) {
    throw new Error("The passenger moved the parked cruiser");
  }
  await useControls(passenger);
  if (vehicle.getProperty(SIGNAL) !== 0) {
    throw new Error("The passenger activated the cruiser signals");
  }

  await useControls(driver);
  if (vehicle.getProperty(SIGNAL) !== 1) {
    throw new Error("The driver did not activate the lights");
  }
  await useControls(driver);
  if (vehicle.getProperty(SIGNAL) !== 2) {
    throw new Error("The driver did not activate the siren");
  }
  console.warn("COPS_VEHICLE_DRIVER_ONLY");
  driver.setRotation({ x: 0, y: 0 });
  driver.moveRelative(0, 1, 1);
  await waitFor(() => vehicle.location.z > start.z + 4, "Native forward input did not drive the cruiser");
  driver.stopMoving();
  await system.waitTicks(16);
  const stopped = vehicle.location;
  await system.waitTicks(12);
  if (horizontalDistance(stopped, vehicle.location) > 0.25) {
    throw new Error("The cruiser kept moving after the driver released the input");
  }

  const wallX = 28;
  dimension.fillBlocks(new BlockVolume({ x: wallX, y: 235, z: 4 }, { x: wallX, y: 239, z: 29 }), "minecraft:stone");
  driver.setRotation({ x: 0, y: -90 });
  driver.moveRelative(0, 1, 1);
  await waitFor(() => vehicle.location.x > stopped.x + 4, "Turned native input did not steer the cruiser");
  await waitFor(() => vehicle.location.x > wallX - 3, "The cruiser never approached the wall", 70);
  await system.waitTicks(18);
  if (vehicle.location.x >= wallX || vehicle.location.y > 235.3) {
    throw new Error("The cruiser passed through or climbed over a solid wall");
  }
  driver.stopMoving();
  await useControls(passenger);
  if (vehicle.getProperty(SIGNAL) !== 2) {
    throw new Error("The passenger changed the signals after the cruiser turned");
  }
  await useControls(driver);
  if (vehicle.getProperty(SIGNAL) !== 0) {
    throw new Error("The driver could not switch off the signals after turning");
  }
  await useControls(driver);
  if (vehicle.getProperty(SIGNAL) !== 1) {
    throw new Error("The cruiser did not retain a signal setting to test across restart");
  }
  console.warn("COPS_VEHICLE_STEER_AND_STOP");

  driver.isSneaking = true;
  await system.waitTicks(12);
  const naturalDismount = !riding(driver, vehicle);
  if (!naturalDismount) {
    // SimulatedPlayer exposes no native mounted-dismount input.
    rideable(vehicle).ejectRider(driver);
  }
  driver.isSneaking = false;
  await waitFor(() => !riding(driver, vehicle), "The driver did not leave the vehicle");
  await waitFor(() => driver.isOnGround, "The driver did not land safely");
  if (driver.location.x >= wallX || !riding(passenger, vehicle)) {
    throw new Error("Dismount did not put the driver on safe ground or unexpectedly removed the other rider");
  }
  await useControls(driver);
  if (vehicle.getProperty(SIGNAL) !== 1) {
    throw new Error("The dismounted driver could still change vehicle signals");
  }
  console.warn("COPS_VEHICLE_DISMOUNT " + JSON.stringify({ nativeSneak: naturalDismount }));
  rideable(vehicle).ejectRider(passenger);
}

async function testTruck(vehicle, driver) {
  const start = vehicle.location;
  driver.teleport({ x: start.x - 2.5, y: start.y, z: start.z });
  await board(driver, vehicle);
  driver.setRotation({ x: 0, y: 0 });
  driver.moveRelative(0, 1, 1);
  await waitFor(() => vehicle.location.z > start.z + 4, "Native forward input did not drive the fire truck");
  driver.stopMoving();
  await system.waitTicks(15);
  rideable(vehicle).ejectRider(driver);
  await waitFor(() => !riding(driver, vehicle), "The driver could not leave the truck");
  console.warn("COPS_VEHICLE_TRUCK");
}

world.afterEvents.worldLoad.subscribe(async () => {
  try {
    const dimension = world.getDimension("overworld");
    await world.tickingAreaManager.createTickingArea("cops_vehicle_tests", { dimension, from: FROM, to: TO });
    const saved = world.getDynamicProperty(SAVED);
    if (typeof saved === "string") {
      const [cruiserId, truckId] = JSON.parse(saved);
      const cruiser = world.getEntity(cruiserId);
      const truck = world.getEntity(truckId);
      if (cruiser?.typeId !== CRUISER || truck?.typeId !== TRUCK || cruiser.getProperty(SIGNAL) !== 1
        || rideable(cruiser).getRiders().length || rideable(truck).getRiders().length) {
        throw new Error("Vehicle identity, signal state, or empty seats did not survive restart");
      }
      console.warn("COPS_VEHICLES_PERSISTED");
      return;
    }
    world.gameRules.doWeatherCycle = false;
    world.gameRules.doMobSpawning = false;
    dimension.setWeather(WeatherType.Clear);
    dimension.fillBlocks(new BlockVolume({ ...FROM, y: 235 }, { ...TO, y: 240 }), "minecraft:air");
    dimension.fillBlocks(new BlockVolume({ ...FROM, y: 234 }, { ...TO, y: 234 }), "minecraft:stone");
    const cruiser = dimension.spawnEntity(CRUISER, { x: 15.5, y: 235, z: 7.5 });
    cruiser.setRotation({ x: 0, y: 0 });
    const truck = dimension.spawnEntity(TRUCK, { x: 38.5, y: 235, z: 8.5 });
    truck.setRotation({ x: 0, y: 0 });
    const driver = spawnSimulatedPlayer({ dimension, x: 13.5, y: 235, z: 7.5 }, "CopsVehicleDriver", GameMode.Survival);
    const passenger = spawnSimulatedPlayer({ dimension, x: 17.5, y: 235, z: 7.5 }, "CopsVehicleRider", GameMode.Survival);
    await system.waitTicks(8);
    await testCruiser(dimension, cruiser, driver, passenger);
    await testTruck(truck, driver);
    world.setDynamicProperty(SAVED, JSON.stringify([cruiser.id, truck.id]));
    driver.disconnect();
    passenger.disconnect();
    console.warn("COPS_VEHICLES_PLAYABLE");
  } catch (error) {
    console.warn("COPS_TEST_FAIL " + String(error) + "\n" + (error.stack ?? ""));
  }
});
