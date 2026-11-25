import { BlockVolume, GameMode, Player, system, world } from "@minecraft/server";
import { blockAt, center, distanceSquared, translated } from "./patrol-sites.js";
import { isDriver } from "./vehicles.js";

const FIRE = "minecraft:fire";
const SOUL_FIRE = "minecraft:soul_fire";
const DIMENSIONS = ["overworld", "nether", "the_end"];
const CREW_REACH = 3.5;
const TRUCK_REACH = 10;

function nearbyFires(dimension, location, radius, below, above) {
  const { x, y, z } = location;
  const { min, max } = dimension.heightRange;
  const volume = new BlockVolume(
    { x: Math.floor(x - radius), y: Math.max(min, Math.floor(y) - below), z: Math.floor(z - radius) },
    { x: Math.floor(x + radius), y: Math.min(max - 1, Math.floor(y) + above), z: Math.floor(z + radius) },
  );
  return dimension.getBlocks(volume, { includeTypes: [FIRE, SOUL_FIRE] }, true).getBlockLocationIterator();
}

function waterReaches(dimension, origin, target) {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const dz = target.z - origin.z;
  const distance = Math.hypot(dx, dy, dz);
  return distance < 0.1 || !dimension.getBlockFromRay(origin, {
    x: dx / distance, y: dy / distance, z: dz / distance,
  }, { maxDistance: distance, includePassableBlocks: false, includeLiquidBlocks: false });
}

function extinguish(dimension, location) {
  const block = blockAt(dimension, location);
  if (block?.typeId === FIRE || block?.typeId === SOUL_FIRE) {
    block.setType("minecraft:air");
    dimension.playSound("random.fizz", center(location), { volume: 0.6, pitch: 1.1 });
  }
}

function crewResponse(member) {
  const { dimension, location } = member;
  const origin = { ...location, y: location.y + 1.35 };
  for (const fire of nearbyFires(dimension, location, CREW_REACH, 1, 2)) {
    const target = { ...center(fire), y: fire.y + 0.5 };
    if (distanceSquared(origin, target) <= CREW_REACH ** 2 && waterReaches(dimension, origin, target)) {
      extinguish(dimension, fire);
    }
  }
}

function truckResponse(truck) {
  const riders = truck.getComponent("minecraft:rideable")?.getRiders();
  if (!riders?.some((rider) => rider instanceof Player && rider.getGameMode() !== GameMode.Spectator && isDriver(rider, truck))) {
    return;
  }
  const { dimension, location } = truck;
  const direction = truck.getRotation().y * Math.PI / 180;
  const forwardX = -Math.sin(direction);
  const forwardZ = Math.cos(direction);
  const origin = { ...location, y: location.y + 1.6 };
  for (const fire of nearbyFires(dimension, location, TRUCK_REACH, 1, 3)) {
    const target = { ...center(fire), y: fire.y + 0.5 };
    const dx = target.x - location.x;
    const dz = target.z - location.z;
    const ahead = dx * forwardX + dz * forwardZ;
    const side = dx * forwardZ - dz * forwardX;
    if (ahead >= 2 && ahead <= TRUCK_REACH && Math.abs(side) <= 2 && waterReaches(dimension, origin, target)) {
      extinguish(dimension, fire);
    }
  }
}

/** A bank can use a player-built netherrack pad four blocks outside its entrance. */
export function dispatchBankFire(dimension, bank) {
  const pad = translated(bank.origin, bank.turn, 6, -1, -4);
  const fire = { ...pad, y: pad.y + 1 };
  if (blockAt(dimension, pad)?.typeId !== "minecraft:netherrack" || !blockAt(dimension, fire)?.isAir) {
    return;
  }
  dimension.setBlockType(fire, FIRE);
  dimension.playSound("fire.ignite", center(fire), { volume: 0.6 });
  for (const player of dimension.getPlayers({ location: center(fire), maxDistance: 64 })) {
    player.sendMessage({ translate: "cops_robbers.fire.dispatch" });
  }
}

system.runInterval(() => {
  for (const id of DIMENSIONS) {
    const dimension = world.getDimension(id);
    for (const member of dimension.getEntities({ type: "cops_robbers:fireman" })) {
      crewResponse(member);
    }
    for (const truck of dimension.getEntities({ type: "cops_robbers:fire_truck" })) {
      truckResponse(truck);
    }
  }
}, 10);
