import { LocationInUnloadedChunkError, LocationOutOfWorldBoundariesError } from "@minecraft/server";
import { FOOTPRINT, SITES } from "./sites.js";

const BANK = SITES["cops_robbers:bank_kit"];
const STATION = SITES["cops_robbers:police_station_kit"];

export function rotate(x, z, turn) {
  const end = FOOTPRINT - 1;
  return [[x, z], [end - z, x], [end - x, end - z], [z, end - x]][turn];
}

export function translated(origin, turn, x, y, z) {
  const [dx, dz] = rotate(x, z, turn);
  return { x: origin.x + dx, y: origin.y + y, z: origin.z + dz };
}

export function center(location) {
  return { ...location, x: location.x + 0.5, z: location.z + 0.5 };
}

export function distanceSquared(a, b) {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;
}

export function blockAt(dimension, location) {
  try {
    return dimension.getBlock(location);
  } catch (error) {
    if (error instanceof LocationInUnloadedChunkError || error instanceof LocationOutOfWorldBoundariesError) {
      return undefined;
    }
    throw error;
  }
}

export function vaultAt(dimension, location) {
  const block = blockAt(dimension, location);
  return block?.typeId === "minecraft:chest" ? block.getComponent("minecraft:inventory")?.container : undefined;
}

function matchingOrigin(member, site, match) {
  const tile = member.location;
  for (const crew of site.crew) {
    for (let turn = 0; turn < 4; ++turn) {
      const [x, z] = rotate(crew.x, crew.z, turn);
      const origin = { x: Math.floor(tile.x) - x, y: Math.floor(tile.y) - 1, z: Math.floor(tile.z) - z };
      const result = match(member.dimension, origin, turn);
      if (result) {
        return result;
      }
    }
  }
  return undefined;
}

export function findBank(teller) {
  return matchingOrigin(teller, BANK, (dimension, origin, turn) => {
    const [x, y, z] = BANK.vault;
    const vault = translated(origin, turn, x, y, z);
    const counter = translated(origin, turn, 6, 1, 4);
    const plinth = { ...vault, y: vault.y - 1 };
    if (vaultAt(dimension, vault) && blockAt(dimension, counter)?.typeId === "minecraft:oak_planks"
      && blockAt(dimension, plinth)?.typeId === "minecraft:gold_block") {
      const id = [dimension.id, vault.x, vault.y, vault.z].join("/");
      return { id, vault, dimension: dimension.id, origin, turn };
    }
    return undefined;
  });
}

export function spawnPoint(dimension, bank) {
  for (const [x, z] of [[6, -2], [4, -2], [8, -2], [6, -1], [5, 2]]) {
    const spot = translated(bank.origin, bank.turn, x, z < 0 ? 0 : 1, z);
    const support = blockAt(dimension, { ...spot, y: spot.y - 1 });
    if (blockAt(dimension, spot)?.isAir && blockAt(dimension, { ...spot, y: spot.y + 1 })?.isAir
      && support && !support.isAir && !support.isLiquid && !support.isWaterlogged) {
      return center(spot);
    }
  }
  return undefined;
}

export function nearbyStations(dimension, location) {
  return dimension.getEntities({ type: "cops_robbers:cop", location, maxDistance: 64 }).flatMap((cop) => {
    const station = matchingOrigin(cop, STATION, (place, origin, turn) => {
      const garage = translated(origin, turn, STATION.garage[0], 1, STATION.garage[1]);
      const jail = translated(origin, turn, STATION.jail[0], 1, STATION.jail[1]);
      const gate = translated(origin, turn, 5, 1, 7);
      const bars = translated(origin, turn, 5, 1, 8);
      const stop = { jail, gate, bars, garage: center(garage) };
      return validJail(place, stop) ? stop : undefined;
    });
    return station ? [station] : [];
  }).sort((first, second) => distanceSquared(first.garage, location) - distanceSquared(second.garage, location));
}

export function validJail(dimension, { jail, gate, bars }) {
  return blockAt(dimension, gate)?.typeId === "minecraft:iron_door"
    && blockAt(dimension, bars)?.typeId === "minecraft:iron_bars"
    && blockAt(dimension, jail)?.isAir
    && blockAt(dimension, { ...jail, y: jail.y + 1 })?.isAir
    && blockAt(dimension, { ...jail, y: jail.y - 1 })?.typeId === "minecraft:smooth_stone";
}
