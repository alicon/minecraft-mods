import { system, world } from "@minecraft/server";
import { blockAt, distanceSquared, hasDrySupport } from "./home-blocks.js";
import { recordedPetOf } from "./ownership.js";
import { YORKIE, storage } from "./yorkie.js";

// Capture only a dog that is nearby when the owner crosses.
const FOLLOW_DISTANCE = 32;
const LANDING_RADIUS = 4;
const LANDING_ATTEMPTS = 10;
const LANDING_RETRY_TICKS = 5;
const END_ARRIVAL = { x: 100, y: 50, z: 0 };
const SPAWN_LOAD_RADIUS = 12;
const RECENT_DEPARTURE_TICKS = 15;
const ORDERED_SIT = storage("ordered_sit");
const DANGEROUS_FLOOR = new Set([
  "minecraft:magma", "minecraft:magma_block", "minecraft:cactus",
  "minecraft:campfire", "minecraft:soul_campfire", "minecraft:powder_snow",
  "minecraft:portal", "minecraft:nether_portal", "minecraft:end_portal",
  "minecraft:end_gateway", "minecraft:pointed_dripstone", "minecraft:sweet_berry_bush",
]);
const latestCrossing = new Map();
const nearbyTravelers = new Map();
let nextSpawnArea = 0;

function mayTravel(dog, ownerId, followedAtCrossing) {
  return dog.isValid && dog.getComponent("minecraft:health")?.currentValue > 0
    && dog.getComponent("minecraft:is_tamed")?.tamedToPlayerId === ownerId
    && (followedAtCrossing || !dog.getProperty(ORDERED_SIT))
    && dog.getProperty(storage("home_goal")) === "idle"
    && !dog.getComponent("minecraft:leashable")?.isLeashed
    && !dog.getComponent("minecraft:riding");
}

function safeFooting(dimension, spot) {
  const support = blockAt(dimension, { ...spot, y: spot.y - 1 });
  return support && !DANGEROUS_FLOOR.has(support.typeId)
    && blockAt(dimension, spot)?.isAir && blockAt(dimension, { ...spot, y: spot.y + 1 })?.isAir
    && hasDrySupport(dimension, spot);
}

function remoteEnd(dimension, location) {
  return dimension.id === "minecraft:the_end" && distanceSquared(location, END_ARRIVAL) > 8 ** 2;
}

function landingSpots(dimension, location) {
  // Bedrock may finish entering the End on the vanilla platform even
  // when a cross-dimension API call provides a different destination.
  if (dimension.id === "minecraft:the_end" && (remoteEnd(dimension, location)
    || ![0, -1].some(dy => safeFooting(dimension, { ...END_ARRIVAL, y: END_ARRIVAL.y + dy })))) {
    return [];
  }
  const x = Math.floor(location.x) + 0.5;
  const y = Math.floor(location.y);
  const z = Math.floor(location.z) + 0.5;
  const spots = [];
  for (const dy of [0, 1, -1, -2]) {
    for (let dx = -LANDING_RADIUS; dx <= LANDING_RADIUS; dx++) {
      for (let dz = -LANDING_RADIUS; dz <= LANDING_RADIUS; dz++) {
        const horizontal = dx ** 2 + dz ** 2;
        if (horizontal < 1 || horizontal > LANDING_RADIUS ** 2) continue;
        spots.push({ location: { x: x + dx, y: y + dy, z: z + dz }, distance: horizontal + dy ** 2 });
      }
    }
  }
  return spots.sort((a, b) => a.distance - b.distance).map(spot => spot.location)
    .filter(spot => safeFooting(dimension, spot));
}

function keepDeparturePositions() {
  const tick = system.currentTick;
  for (const player of world.getAllPlayers()) {
    const dog = recordedPetOf(player);
    if (dog?.isValid && dog.dimension.id === player.dimension.id
      && distanceSquared(dog.location, player.location) <= FOLLOW_DISTANCE ** 2
      && mayTravel(dog, player.id)) {
      nearbyTravelers.set(player.id, { tick, id: dog.id, dimensionId: dog.dimension.id,
        playerLocation: player.location, dogLocation: dog.location });
    } else if (tick - (nearbyTravelers.get(player.id)?.tick ?? tick) > RECENT_DEPARTURE_TICKS) {
      nearbyTravelers.delete(player.id);
    }
  }
}

function returnNativeEndCompanion(event, dog, departure) {
  const { fromDimension, fromLocation, toDimension, player } = event;
  if (!dog?.isValid || dog.dimension.id !== toDimension.id || !remoteEnd(toDimension, player.location)
    || departure?.id !== dog.id || departure.dimensionId !== fromDimension.id
    || system.currentTick - departure.tick > RECENT_DEPARTURE_TICKS
    || distanceSquared(departure.playerLocation, fromLocation) > 5 ** 2
    || !mayTravel(dog, player.id, true)) return;
  // Some native dimension changes move a nearby tame dog before this event.
  // Recover that same dog to its verified departure area before follow AI
  // pulls it toward a remote landing that the add-on cannot vouch for.
  const previous = departure.dogLocation;
  const center = { x: Math.floor(previous.x) + 0.5, y: Math.floor(previous.y), z: Math.floor(previous.z) + 0.5 };
  const options = { dimension: fromDimension, checkForBlocks: true,
    forceProvidedPositionOnDimensionChange: true, keepVelocity: false };
  if (safeFooting(fromDimension, center) && dog.tryTeleport(center, options)) return true;
  for (const spot of landingSpots(fromDimension, previous)) {
    if (dog.tryTeleport(spot, options)) return true;
  }
  return false;
}

async function loadEndExitSpawn(dimension) {
  const { x, z } = world.getDefaultSpawnLocation();
  const { min, max } = dimension.heightRange;
  const y = Math.min(max - 1, Math.max(min, 64));
  const from = { x: x - SPAWN_LOAD_RADIUS, y, z: z - SPAWN_LOAD_RADIUS };
  const to = { x: x + SPAWN_LOAD_RADIUS, y, z: z + SPAWN_LOAD_RADIUS };
  if ([from, to, { ...from, z: to.z }, { ...to, z: from.z }].every(point => blockAt(dimension, point))) {
    return undefined;
  }
  // The engine resolves the Overworld spawn during an End exit, including
  // transfers with explicit coordinates. Keep that area active until the
  // original entity has arrived at the verified destination.
  const options = { dimension, from, to };
  if (!world.tickingAreaManager.hasCapacity(options)) {
    throw new Error("Cannot load the Overworld spawn for Mushroom's End exit");
  }
  const name = "mushroom_end_exit_" + nextSpawnArea++;
  await world.tickingAreaManager.createTickingArea(name, options);
  return name;
}

async function followAcross(event, crossing, departure) {
  const { fromDimension, fromLocation, toDimension, player } = event;
  let spawnArea;
  try {
    const recorded = recordedPetOf(player);
    if (returnNativeEndCompanion(event, recorded, departure)) return;
    let dog;
    let followedAtCrossing = false;
    if (fromDimension.id === "minecraft:the_end" && toDimension.id === "minecraft:overworld"
      && recorded?.isValid && recorded.dimension.id === fromDimension.id
      && distanceSquared(recorded.location, fromLocation) <= FOLLOW_DISTANCE ** 2
      && mayTravel(recorded, player.id)) {
      followedAtCrossing = true;
      spawnArea = await loadEndExitSpawn(toDimension);
    }
    // Destination chunks may still be arriving. Keep the original entity at
    // the origin if none of the landing spots can be verified.
    for (let attempt = 0; attempt < LANDING_ATTEMPTS; attempt++) {
      if (latestCrossing.get(player.id) !== crossing || !player.isValid
        || player.dimension.id !== toDimension.id) return;
      // Resolve by saved identity first. A freshly moved entity may still
      // be updating the origin's entity query.
      dog ??= recorded ?? fromDimension.getEntities({ type: YORKIE }).find(candidate =>
        candidate.getComponent("minecraft:is_tamed")?.tamedToPlayerId === player.id);
      if (dog) {
        if (!mayTravel(dog, player.id, followedAtCrossing) || dog.dimension.id !== fromDimension.id
          || distanceSquared(dog.location, fromLocation) > FOLLOW_DISTANCE ** 2) return;
        // The engine can sit the dog after losing sight of its owner while
        // the target chunks are loading. Only the initial order is binding.
        followedAtCrossing = true;
        for (const spot of landingSpots(toDimension, player.location)) {
          if (!dog.tryTeleport(spot, { dimension: toDimension, checkForBlocks: true,
            forceProvidedPositionOnDimensionChange: true, keepVelocity: false })) continue;
          // Bedrock can set a following tame pet to sit as part of the
          // dimension transfer. Clear that sit using the normal stay release.
          await system.waitTicks(2);
          const arrived = world.getEntity(dog.id);
          if (latestCrossing.get(player.id) === crossing && arrived?.isValid
            && arrived.dimension.id === toDimension.id && arrived.getProperty(ORDERED_SIT)) {
            arrived.triggerEvent(storage("leave_stay"));
          }
          return;
        }
      }
      await system.waitTicks(LANDING_RETRY_TICKS);
    }
  } finally {
    if (latestCrossing.get(player.id) === crossing) latestCrossing.delete(player.id);
    if (spawnArea) world.tickingAreaManager.removeTickingArea(spawnArea);
  }
}

export function installExpeditionTravel() {
  world.afterEvents.playerDimensionChange.subscribe(event => {
    const departure = nearbyTravelers.get(event.player.id);
    nearbyTravelers.delete(event.player.id);
    const crossing = Symbol();
    latestCrossing.set(event.player.id, crossing);
    followAcross(event, crossing, departure).catch(error => console.warn("Mushroom dimension travel: " + String(error)));
  });
  world.afterEvents.worldLoad.subscribe(() => system.runInterval(keepDeparturePositions, 2));
  world.afterEvents.playerLeave.subscribe(({ playerId }) => nearbyTravelers.delete(playerId));
}
