import { ItemStack, world } from "@minecraft/server";

world.afterEvents.worldLoad.subscribe(() => {
  try {
    const charm = new ItemStack("narwhal_together:regroup_charm");
    if (charm.maxAmount !== 1) {
      throw new Error("The Regroup Charm was not registered as a single-slot item");
    }
    console.warn("NARWHAL_CHARM_REGISTERED");
  } catch (error) {
    console.warn("NARWHAL_TEST_FAIL " + String(error));
  }
});
