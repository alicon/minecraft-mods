import { GameMode, InvalidEntityError, ItemStack, Player, system, world } from "@minecraft/server";
import { center, distanceSquared, findBank, nearbyStations, spawnPoint, validJail, vaultAt } from "./patrol-sites.js";
import { isDriver } from "./vehicles.js";

const CRUISER = "cops_robbers:police_cruiser";
const ROBBER = "cops_robbers:bank_robber";
const TELLER = "cops_robbers:teller";
const CONCEALED = "cops_robbers:concealed";
const ROUND_PREFIX = "cops_robbers:patrol_v1/";
const RETIRED_PREFIX = "cops_robbers:retired_robber/";
const CAPTURE_DISTANCE = 2.7;
const JAIL_DISTANCE = 3.2;
const rounds = new Map();

function save(round) {
  world.setDynamicProperty(ROUND_PREFIX + round.bank.id, JSON.stringify(round));
  rounds.set(round.bank.id, round);
}

function say(player, name) {
  player.onScreenDisplay.setActionBar({ translate: "cops_robbers.patrol." + name });
}

function hideInCruiser(robber, vehicle) {
  robber.tryTeleport({ ...vehicle.location, y: vehicle.location.y + 0.45 });
}

function retire(id) {
  const entity = world.getEntity(id);
  if (entity?.isValid) {
    entity.remove();
  } else {
    world.setDynamicProperty(RETIRED_PREFIX + id, true);
  }
}

function spawnRobber(dimension, bank) {
  const spot = spawnPoint(dimension, bank);
  return spot ? dimension.spawnEntity(ROBBER, spot, { spawnEvent: "minecraft:entity_spawned" }) : undefined;
}

function sameStation(a, b) {
  return distanceSquared(a.jail, b.jail) === 0;
}

function startRound(player, bank, previous) {
  const dimension = player.dimension;
  const station = nearbyStations(dimension, player.location).find((candidate) =>
    !Array.from(rounds.values()).some((round) => round.stage !== "complete" && round.bank.dimension === bank.dimension
      && sameStation(candidate, round.station)));
  if (!station) {
    say(player, "station");
    return;
  }
  const vault = vaultAt(dimension, bank.vault);
  const stack = vault?.getItem(0);
  if (!stack?.isStackableWith(new ItemStack("minecraft:gold_ingot"))) {
    say(player, "empty");
    return;
  }
  const robber = spawnRobber(dimension, bank);
  if (!robber) {
    say(player, "exit");
    return;
  }
  try {
    vault.setItem(0, undefined);
    save({ bank, station, robberId: robber.id, gold: stack.amount, stage: "chase" });
  } catch (error) {
    vault.setItem(0, stack);
    robber.remove();
    throw error;
  }
  if (previous && previous.robberId) {
    retire(previous.robberId);
  }
  say(player, "chase");
}

function returnGold(player, round) {
  const vault = vaultAt(player.dimension, round.bank.vault);
  if (!vault || vault.getItem(0)) {
    say(player, "vault");
    return;
  }
  vault.setItem(0, new ItemStack("minecraft:gold_ingot", round.gold));
  try {
    save({ ...round, stage: "complete", returnedAt: world.getAbsoluteTime() });
  } catch (error) {
    vault.setItem(0, undefined);
    throw error;
  }
  say(player, "complete");
}

function talk(player, teller) {
  if (!player.isValid || !teller.isValid || player.dimension.id !== teller.dimension.id
    || distanceSquared(player.location, teller.location) > 6 ** 2 || player.getGameMode() === GameMode.Spectator) {
    return;
  }
  const bank = findBank(teller);
  if (!bank) {
    say(player, "bank");
    return;
  }
  const round = rounds.get(bank.id);
  if (!round || (round.stage === "complete" && world.getAbsoluteTime() - round.returnedAt >= 40)) {
    startRound(player, bank, round);
  } else if (round.stage === "jailed") {
    returnGold(player, round);
  } else if (round.stage === "replace") {
    const robber = spawnRobber(player.dimension, bank);
    if (robber) {
      try {
        save({ ...round, robberId: robber.id, stage: "chase" });
      } catch (error) {
        robber.remove();
        throw error;
      }
      say(player, "chase");
    } else {
      say(player, "exit");
    }
  } else {
    say(player, round.stage);
  }
}

function driverOf(vehicle) {
  return vehicle?.getComponent("minecraft:rideable")?.getRiders().find((player) =>
    player instanceof Player && player.getGameMode() !== GameMode.Spectator && isDriver(player, vehicle));
}

function noticeRiders(vehicle, name) {
  for (const player of vehicle.getComponent("minecraft:rideable").getRiders()) {
    if (player instanceof Player) {
      say(player, name);
    }
  }
}

function pathToRobber(vehicle, robber) {
  const from = { ...vehicle.location, y: vehicle.location.y + 0.7 };
  const to = { ...robber.location, y: robber.location.y + 0.7 };
  const distance = Math.sqrt(distanceSquared(from, to));
  if (distance < 0.01) {
    return true;
  }
  return !vehicle.dimension.getBlockFromRay(from, {
    x: (to.x - from.x) / distance, y: (to.y - from.y) / distance, z: (to.z - from.z) / distance,
  }, { maxDistance: distance, includePassableBlocks: false, includeLiquidBlocks: false });
}

function capture(round, robber, occupiedCruisers) {
  if (robber.getProperty(CONCEALED)) {
    robber.triggerEvent("cops_robbers:on_foot");
  }
  const nearby = robber.dimension.getEntities({
    type: CRUISER, location: robber.location, maxDistance: CAPTURE_DISTANCE,
  });
  const vehicle = nearby.filter((candidate) => !occupiedCruisers.has(candidate.id)
    && driverOf(candidate) && pathToRobber(candidate, robber))
    .sort((first, second) => distanceSquared(first.location, robber.location) - distanceSquared(second.location, robber.location)
      || first.id.localeCompare(second.id))[0];
  if (vehicle) {
    robber.triggerEvent("cops_robbers:in_custody");
    hideInCruiser(robber, vehicle);
    save({ ...round, cruiserId: vehicle.id, stage: "caught" });
    occupiedCruisers.add(vehicle.id);
    noticeRiders(vehicle, "caught");
  }
}

function reachJail(round, robber) {
  const vehicle = world.getEntity(round.cruiserId);
  if (!vehicle?.isValid || vehicle.dimension.id !== round.bank.dimension) {
    return;
  }
  if (!robber.getProperty(CONCEALED)) {
    robber.triggerEvent("cops_robbers:in_custody");
  }
  hideInCruiser(robber, vehicle);
  if (!driverOf(vehicle) || distanceSquared(vehicle.location, round.station.garage) > JAIL_DISTANCE ** 2) {
    return;
  }
  const dimension = vehicle.dimension;
  if (validJail(dimension, round.station)
    && robber.tryTeleport(center(round.station.jail), { checkForBlocks: true })) {
    robber.triggerEvent("cops_robbers:jailed");
    save({ ...round, cruiserId: undefined, stage: "jailed" });
    noticeRiders(vehicle, "jailed");
  }
}

world.afterEvents.worldLoad.subscribe(() => {
  for (const key of world.getDynamicPropertyIds()) {
    if (key.startsWith(ROUND_PREFIX)) {
      const stored = world.getDynamicProperty(key);
      if (typeof stored === "string") {
        const round = JSON.parse(stored);
        rounds.set(round.bank.id, round);
      }
    }
  }
});

export function tryBankPatrol(player) {
  const teller = player.dimension.getEntities({
    type: TELLER, location: player.location, maxDistance: 4.5, closest: 1,
  })[0];
  if (!teller) {
    return false;
  }
  talk(player, teller);
  return true;
}

world.afterEvents.entityDie.subscribe(({ deadEntity }) => {
  for (const round of rounds.values()) {
    if (round.robberId === deadEntity.id && (round.stage === "chase" || round.stage === "caught")) {
      save({ ...round, cruiserId: undefined, robberId: undefined, stage: "replace" });
    } else if (round.cruiserId === deadEntity.id && round.stage === "caught") {
      const robber = world.getEntity(round.robberId);
      robber?.triggerEvent("cops_robbers:on_foot");
      save({ ...round, cruiserId: undefined, stage: "chase" });
    }
  }
}, { entityTypes: [CRUISER, ROBBER] });

world.afterEvents.entityLoad.subscribe(({ entity }) => {
  if (entity.typeId === ROBBER) {
    const key = RETIRED_PREFIX + entity.id;
    if (world.getDynamicProperty(key) === true) {
      entity.remove();
      world.setDynamicProperty(key, undefined);
    }
  }
});

system.runInterval(() => {
  const occupiedCruisers = new Set();
  for (const round of rounds.values()) {
    if (round.stage === "caught") {
      occupiedCruisers.add(round.cruiserId);
    }
  }
  for (const round of rounds.values()) {
    if (round.stage !== "chase" && round.stage !== "caught") {
      continue;
    }
    try {
      const robber = world.getEntity(round.robberId);
      if (!robber?.isValid) {
        continue;
      }
      if (round.stage === "caught") {
        reachJail(round, robber);
      } else {
        capture(round, robber, occupiedCruisers);
      }
    } catch (error) {
      if (!(error instanceof InvalidEntityError)) {
        throw error;
      }
    }
  }
}, 5);
