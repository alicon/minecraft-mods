import { ItemStack, world } from "@minecraft/server";

const SAVED = "narwhal_smoke:charm_saved";

world.afterEvents.worldLoad.subscribe(async () => {
  try {
    const charm = new ItemStack("narwhal_together:regroup_charm");
    if (charm.maxAmount !== 1) {
      throw new Error("The Regroup Charm was not registered as a single-slot item");
    }
    const dimension = world.getDimension("overworld");
    const chest = { x: 63, y: 230, z: 63 };
    await world.tickingAreaManager.createTickingArea("narwhal_charm_persistence", { dimension, from: chest, to: chest });
    if (world.getDynamicProperty(SAVED) === true) {
      const item = dimension.getBlock(chest)?.getComponent("minecraft:inventory")?.container.getItem(0);
      if (item?.typeId !== charm.typeId || item.amount !== 1) {
        throw new Error("The Regroup Charm did not survive reopening the world");
      }
      console.warn("NARWHAL_CHARM_PERSISTED");
      return;
    }
    dimension.setBlockType(chest, "minecraft:chest");
    dimension.getBlock(chest).getComponent("minecraft:inventory").container.setItem(0, charm);
    world.setDynamicProperty(SAVED, true);
    console.warn("NARWHAL_CHARM_REGISTERED");
  } catch (error) {
    console.warn("NARWHAL_TEST_FAIL " + String(error));
  }
});
