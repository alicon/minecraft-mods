import { world } from "@minecraft/server";
import { YORKIE, storage } from "./yorkie.js";

const PREFIX = storage("feed_");
const HEAL_AMOUNTS = ["1", "1_5", "2", "2_5", "3", "4"];

export function installFoodHealing() {
  world.afterEvents.dataDrivenEntityTrigger.subscribe(({ entity, eventId }) => {
    const health = entity.getComponent("minecraft:health");
    if (!health || health.currentValue <= 0) {
      return;
    }
    const amount = Number(eventId.slice(PREFIX.length).replace("_", "."));
    health.setCurrentValue(Math.min(health.effectiveMax, health.currentValue + amount));
    entity.dimension.playSound("random.eat", entity.location, { volume: 0.4 });
  }, { entityTypes: [YORKIE], eventTypes: HEAL_AMOUNTS.map((amount) => PREFIX + amount) });
}
