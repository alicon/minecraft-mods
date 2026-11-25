import { ItemTypes, world } from "@minecraft/server";

world.afterEvents.worldLoad.subscribe(() => {
  for (const name of ["bank", "police_station", "fire_station"]) {
    const kit = ItemTypes.get("cops_robbers:" + name + "_kit");
    const template = world.structureManager.get("cops_robbers:" + name);
    if (!kit || !template || template.size.x !== 13 || template.size.y !== 6 || template.size.z !== 13) {
      console.warn("COPS_TEST_FAIL Missing or invalid kit " + name);
      return;
    }
  }
  console.warn("COPS_KITS_REGISTERED");
});
