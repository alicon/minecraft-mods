import { GameMode, Player, system, world } from "@minecraft/server";
import { blockAt } from "./home-blocks.js";
import { NAMESPACE, storage } from "./yorkie.js";

export const TOY_TAG = "mushroom_fetch_toy";
export const THROWER = storage("fetch_thrower");
export const PRACTICE = storage("fetch_practice");
const LAUNCHED = storage("fetch_launched");
const ORIGINAL_AMOUNT = storage("fetch_drop_amount");
const TOYS = [NAMESPACE + "yorkie_ball", NAMESPACE + "yorkie_chew_toy"];
const LAUNCH_GRACE_TICKS = 12;
const PRACTICE_LIFETIME_TICKS = 400;

export function fetchStack(item) {
  const stack = item.getComponent("minecraft:item")?.itemStack;
  return stack && (TOYS.includes(stack.typeId) || stack.typeId === "minecraft:bone") ? stack : undefined;
}

export function practiceExpired(item, stack, now) {
  const launched = item.getDynamicProperty(LAUNCHED);
  return stack.getDynamicProperty(PRACTICE) === true && typeof launched === "number"
    && now - launched > PRACTICE_LIFETIME_TICKS;
}

export function availableToy(item, now) {
  const stack = fetchStack(item);
  if (!stack) {
    return false;
  }
  if (practiceExpired(item, stack, now)) {
    item.remove();
    return false;
  }
  const launched = item.getDynamicProperty(LAUNCHED);
  return item.getDynamicProperty(ORIGINAL_AMOUNT) === stack.amount
    && (typeof launched !== "number" || now - launched >= LAUNCH_GRACE_TICKS);
}

function markToy(item, thrower, amount) {
  item.setDynamicProperty(THROWER, thrower);
  item.setDynamicProperty(LAUNCHED, world.getAbsoluteTime());
  item.setDynamicProperty(ORIGINAL_AMOUNT, amount);
  item.addTag(TOY_TAG);
}

function throwToy(player, slot, type, originalMode) {
  if (!player.isValid || player.selectedSlotIndex !== slot || player.getGameMode() !== originalMode) {
    return;
  }
  const inventory = player.getComponent("minecraft:inventory")?.container;
  const held = inventory?.getItem(slot);
  if (!held || held.typeId !== type || !inventory) {
    return;
  }
  const stack = held.clone();
  stack.amount = 1;
  const practice = originalMode === GameMode.Creative;
  if (practice) {
    stack.setDynamicProperty(PRACTICE, true);
  }

  const origin = player.getHeadLocation();
  const direction = player.getViewDirection();
  const ahead = { x: origin.x + 0.55 * direction.x, y: origin.y, z: origin.z + 0.55 * direction.z };
  const start = blockAt(player.dimension, ahead)?.isAir ? ahead : origin;
  const launched = player.dimension.spawnItem(stack, start);
  try {
    markToy(launched, player.id, stack.amount);
    launched.applyImpulse({
      x: direction.x * 0.5,
      y: Math.max(0.06, Math.min(0.35, direction.y * 0.36 + 0.12)),
      z: direction.z * 0.5,
    });
    if (!practice) {
      const remaining = held.amount > 1 ? held.clone() : undefined;
      if (remaining) {
        remaining.amount -= 1;
      }
      inventory.setItem(slot, remaining);
    }
  } catch (error) {
    launched.remove();
    throw error;
  }
}

export function installToyEvents() {
  world.beforeEvents.itemUse.subscribe((event) => {
    const { source: player, itemStack } = event;
    if (!TOYS.includes(itemStack.typeId) || event.cancel) {
      return;
    }
    event.cancel = true;
    const slot = player.selectedSlotIndex;
    const mode = player.getGameMode();
    system.run(() => throwToy(player, slot, itemStack.typeId, mode));
  });

  world.afterEvents.entityItemDrop.subscribe(({ entity, items }) => {
    if (entity instanceof Player) {
      // Bedrock 26.66 exposes indexed drops here without an iterator.
      for (let index = 0; index < items.length; ++index) {
        const item = items[index];
        const stack = item?.isValid ? fetchStack(item) : undefined;
        if (stack) {
          markToy(item, entity.id, stack.amount);
        }
      }
    }
  });

  world.beforeEvents.entityItemPickup.subscribe((event) => {
    const { item } = event;
    const launchTick = item.hasTag(TOY_TAG) ? item.getDynamicProperty(LAUNCHED) : undefined;
    if (item.getComponent("minecraft:item")?.itemStack.getDynamicProperty(PRACTICE) === true
      || (typeof launchTick === "number" && world.getAbsoluteTime() - launchTick < LAUNCH_GRACE_TICKS)) {
      event.cancel = true;
    }
  });

  world.afterEvents.entityLoad.subscribe(({ entity: item }) => {
    if (item.typeId !== "minecraft:item") {
      return;
    }
    const stack = item.getComponent("minecraft:item")?.itemStack;
    if (stack?.getDynamicProperty(PRACTICE) === true && practiceExpired(item, stack, world.getAbsoluteTime())) {
      item.remove();
    }
  });
}
