import { GameMode, system, world } from "@minecraft/server";
import { safeLanding } from "./landing.js";

const CHARM = "narwhal_together:regroup_charm";
const COOLDOWN_TICKS = 40;
const recent = new Map();

function message(player, key, name) {
  player.onScreenDisplay.setActionBar({
    translate: "message.narwhal_together." + key,
    ...(name === undefined ? {} : { with: [name] }),
  });
}

function alphabetical(first, second) {
  const a = first.name.toLowerCase();
  const b = second.name.toLowerCase();
  return a < b ? -1 : a > b ? 1 : 0;
}

function regroup(player) {
  if (!player.isValid || player.getGameMode() === GameMode.Spectator) {
    return;
  }
  const previous = recent.get(player.id);
  const now = system.currentTick;
  if (previous && now - previous.tick < COOLDOWN_TICKS) {
    message(player, "teleport_cooldown");
    return;
  }
  const targets = world.getAllPlayers().filter((other) => other.id !== player.id && other.getGameMode() !== GameMode.Spectator);
  if (!targets.length) {
    message(player, "no_players");
    return;
  }
  targets.sort(alphabetical);
  const index = targets.findIndex((other) => other.id === previous?.targetId);
  const target = targets[(index + 1) % targets.length];
  const location = safeLanding(target, player.id);
  if (!location) {
    message(player, "unsafe", target.name);
    return;
  }

  player.getComponent("minecraft:riding")?.entityRidingOn.getComponent("minecraft:rideable")?.ejectRider(player);
  const success = player.tryTeleport(location, {
    dimension: target.dimension, rotation: target.getRotation(), checkForBlocks: true,
    forceProvidedPositionOnDimensionChange: true, keepVelocity: false,
  });
  if (!success) {
    message(player, "unsafe", target.name);
    return;
  }
  recent.set(player.id, { targetId: target.id, tick: now });
  message(player, "teleported", target.name);
  message(target, "arrived", player.name);
}

world.beforeEvents.itemUse.subscribe((event) => {
  if (!event.cancel && event.itemStack.typeId === CHARM) {
    const player = event.source;
    event.cancel = true;
    system.run(() => regroup(player));
  }
});
