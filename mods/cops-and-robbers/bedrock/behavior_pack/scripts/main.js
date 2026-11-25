import {
  Direction, GameMode, ItemStack, LocationInUnloadedChunkError, LocationOutOfWorldBoundariesError,
  StructureRotation, system, world,
} from "@minecraft/server";
import { FOOTPRINT, HEIGHT, SITES } from "./sites.js";

const ROTATIONS = [StructureRotation.None, StructureRotation.Rotate90, StructureRotation.Rotate180, StructureRotation.Rotate270];
const PREVIEW_TICKS = 240;
const HALF = (FOOTPRINT - 1) / 2;
const previews = new Map();

function facing(view) {
  if (Math.abs(view.x) > Math.abs(view.z)) {
    return view.x < 0 ? 1 : 3;
  }
  return view.z < 0 ? 2 : 0;
}

function rotate(x, z, turn) {
  const end = FOOTPRINT - 1;
  return [[x, z], [end - z, x], [end - x, end - z], [z, end - x]][turn];
}

function translated(origin, turn, x, y, z) {
  const [dx, dz] = rotate(x, z, turn);
  return { x: origin.x + dx, y: origin.y + y, z: origin.z + dz };
}

function message(player, key) {
  player.onScreenDisplay.setActionBar({ translate: "cops_robbers.kit." + key });
}

function siteIsClear(dimension, origin) {
  for (let x = origin.x; x < origin.x + FOOTPRINT; ++x) {
    for (let z = origin.z; z < origin.z + FOOTPRINT; ++z) {
      const ground = { x, y: origin.y - 1, z };
      const support = dimension.getBlock(ground);
      if (!support || support.isAir || support.isLiquid || support.isWaterlogged
        || dimension.getBlockBelow(ground, { maxDistance: 1 })?.y !== ground.y) {
        return false;
      }
      for (let y = origin.y; y < origin.y + HEIGHT; ++y) {
        if (!dimension.getBlock({ x, y, z })?.isAir) {
          return false;
        }
      }
    }
  }
  return true;
}

function hasPlayer(dimension, origin) {
  return dimension.getPlayers().some(({ location }) =>
    location.x >= origin.x - 0.3 && location.x < origin.x + FOOTPRINT + 0.3
    && location.z >= origin.z - 0.3 && location.z < origin.z + FOOTPRINT + 0.3
    && location.y + 1.8 > origin.y && location.y < origin.y + HEIGHT);
}

function showCorners(dimension, origin) {
  const far = FOOTPRINT - 0.5;
  for (const [x, z] of [[0.5, 0.5], [far, 0.5], [0.5, far], [far, far]]) {
    dimension.spawnParticle("minecraft:basic_flame_particle", { x: origin.x + x, y: origin.y + 0.25, z: origin.z + z });
  }
}

function furnishSite(dimension, origin, turn, site) {
  for (const { type, x, z } of site.crew) {
    const position = translated(origin, turn, x, 1, z);
    const member = dimension.spawnEntity("cops_robbers:" + type, { ...position, x: position.x + 0.5, z: position.z + 0.5 });
    member.setRotation({ x: 0, y: [180, -90, 0, 90][turn] });
  }
  if ("vault" in site) {
    const [x, y, z] = site.vault;
    const location = translated(origin, turn, x, y, z);
    const vault = dimension.getBlock(location)?.getComponent("minecraft:inventory")?.container;
    if (!vault) {
      throw new Error("The bank template did not place its vault chest");
    }
    vault.setItem(0, new ItemStack("minecraft:gold_ingot", 8));
  }
}

function useKit(player, target, side, itemType, slot, turn) {
  if (!player.isValid || player.dimension.id !== target.dimension.id || slot !== player.selectedSlotIndex) {
    return;
  }
  const inventory = player.getComponent("minecraft:inventory")?.container;
  if (!inventory || inventory.getItem(slot)?.typeId !== itemType) {
    return;
  }
  if (side !== Direction.Up) {
    message(player, "top");
    return;
  }

  const dimension = player.dimension;
  const [offsetX, offsetZ] = rotate(HALF, 0, turn);
  const origin = { x: target.location.x - offsetX, y: target.location.y + 1, z: target.location.z - offsetZ };
  try {
    if (!siteIsClear(dimension, origin)) {
      message(player, "empty");
      return;
    }
  } catch (error) {
    if (!(error instanceof LocationInUnloadedChunkError || error instanceof LocationOutOfWorldBoundariesError)) {
      throw error;
    }
    message(player, "empty");
    return;
  }

  const fingerprint = [dimension.id, itemType, origin.x, origin.y, origin.z, turn].join("/");
  const preview = previews.get(player.id);
  const now = system.currentTick;
  if (preview?.fingerprint !== fingerprint || now >= preview.expires) {
    previews.set(player.id, { fingerprint, expires: now + PREVIEW_TICKS });
    showCorners(dimension, origin);
    message(player, "preview");
    return;
  }
  if (hasPlayer(dimension, origin)) {
    message(player, "players");
    return;
  }

  const site = SITES[itemType];
  const structure = world.structureManager.get(site.structure);
  if (!structure) {
    throw new Error("Missing kit template " + site.structure);
  }
  world.structureManager.place(structure, dimension, origin, { rotation: ROTATIONS[turn], includeEntities: false });
  if (player.getGameMode() !== GameMode.Creative) {
    inventory.setItem(slot, undefined);
  }
  previews.delete(player.id);
  furnishSite(dimension, origin, turn, site);
  message(player, "built");
}

world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
  const { block, blockFace, itemStack, player } = event;
  if (event.cancel || !itemStack || !Object.hasOwn(SITES, itemStack.typeId)) {
    return;
  }
  event.cancel = true;
  if (!event.isFirstEvent) {
    return;
  }
  const target = { dimension: block.dimension, location: block.location };
  const slot = player.selectedSlotIndex;
  const turn = facing(player.getViewDirection());
  system.run(() => useKit(player, target, blockFace, itemStack.typeId, slot, turn));
});
world.afterEvents.playerLeave.subscribe(({ playerId }) => previews.delete(playerId));
