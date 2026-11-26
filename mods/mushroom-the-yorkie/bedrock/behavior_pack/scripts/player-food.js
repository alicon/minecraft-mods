import { GameMode, system, world } from "@minecraft/server";
import { YORKIE } from "./yorkie.js";

// Native vanilla stacks do not all expose minecraft:food in stable Script API.
const VANILLA_NUTRITION = new Map([
  ["apple", 4], ["baked_potato", 5], ["beef", 3], ["beetroot", 1], ["beetroot_soup", 6],
  ["bread", 5], ["carrot", 3], ["chicken", 2], ["chorus_fruit", 4], ["cod", 2],
  ["cooked_beef", 8], ["cooked_chicken", 6], ["cooked_cod", 5], ["cooked_mutton", 6],
  ["cooked_porkchop", 8], ["cooked_rabbit", 5], ["cooked_salmon", 6], ["cookie", 2],
  ["dried_kelp", 1], ["enchanted_golden_apple", 4], ["glow_berries", 2], ["golden_apple", 4],
  ["golden_carrot", 6], ["honey_bottle", 6], ["melon_slice", 2], ["mushroom_stew", 6],
  ["mutton", 2], ["poisonous_potato", 2], ["porkchop", 3], ["potato", 1], ["pufferfish", 1],
  ["pumpkin_pie", 8], ["rabbit", 3], ["rabbit_stew", 10], ["rotten_flesh", 4], ["salmon", 2],
  ["spider_eye", 2], ["suspicious_stew", 6], ["sweet_berries", 2], ["tropical_fish", 1],
]);

function foodNutrition(item) {
  if (item.typeId.startsWith("minecraft:")) {
    return VANILLA_NUTRITION.get(item.typeId.slice("minecraft:".length));
  }
  return item.getComponent("minecraft:food")?.nutrition;
}

function ownedBy(dog, player) {
  return dog.getComponent("minecraft:is_tamed")?.tamedToPlayerId === player.id;
}

function feed(dog, player, slot, type, mode, nutrition) {
  if (!player.isValid || !dog.isValid || dog.dimension.id !== player.dimension.id
    || player.selectedSlotIndex !== slot || player.getGameMode() !== mode || !ownedBy(dog, player)) {
    return;
  }
  const health = dog.getComponent("minecraft:health");
  const inventory = player.getComponent("minecraft:inventory")?.container;
  const held = inventory?.getItem(slot);
  if (!health || health.currentValue <= 0 || held?.typeId !== type) {
    return;
  }
  if (mode !== GameMode.Creative) {
    const remaining = held.amount > 1 ? held.clone() : undefined;
    if (remaining) {
      remaining.amount--;
    }
    inventory.setItem(slot, remaining);
  }
  const healing = Math.max(1, Math.min(4, nutrition / 2));
  health.setCurrentValue(Math.min(health.effectiveMax, health.currentValue + healing));
  dog.dimension.playSound("random.eat", dog.location, { volume: 0.4 });
}

export function installFeedingEvents() {
  world.beforeEvents.playerInteractWithEntity.subscribe((event) => {
    const { player, target: dog, itemStack } = event;
    if (event.cancel || dog.typeId !== YORKIE || !itemStack) {
      return;
    }
    const nutrition = foodNutrition(itemStack);
    if (nutrition === undefined) {
      return;
    }
    // Suppress the vanilla sit or unleash interaction while offering food.
    event.cancel = true;
    const mode = player.getGameMode();
    if (mode !== GameMode.Spectator && ownedBy(dog, player)) {
      const slot = player.selectedSlotIndex;
      system.run(() => feed(dog, player, slot, itemStack.typeId, mode, nutrition));
    }
  });
}
