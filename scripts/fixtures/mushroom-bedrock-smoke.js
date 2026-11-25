import { BlockTypes, BlockVolume, ItemTypes, system, world } from "@minecraft/server";

const YORKIE = "mushroom_yorkie:mushroom_yorkie";
const ENTITY_ID = "mushroom_smoke:original_entity";
const AREA = "mushroom_smoke";
const MIN = { x: 0, y: 195, z: 0 };
const MAX = { x: 15, y: 205, z: 15 };
const CENTER = { x: 8.5, y: 201, z: 8.5 };
const FURNITURE = ["dog_bowl", "dog_food_bowl", "dog_water_bowl", "dog_bed", "doghouse"];

async function testHarness(puppy) {
  if (!ItemTypes.get("mushroom_yorkie:yorkie_harness")) {
    return;
  }
  const property = "mushroom_yorkie:wearing_harness";
  puppy.triggerEvent("mushroom_yorkie:equip_harness");
  await system.waitTicks(2);
  if (!puppy.getProperty(property) || !puppy.getComponent("minecraft:leashable")) {
    throw new Error("Harness event did not enable the visual property and leash component");
  }
  puppy.triggerEvent("mushroom_yorkie:remove_harness");
  await system.waitTicks(2);
  if (puppy.getProperty(property) || puppy.getComponent("minecraft:leashable")) {
    throw new Error("Harness removal did not restore the original leash gate");
  }
  console.warn("MUSHROOM_TEST_HARNESS_EVENTS");
}

function testFurniture(dimension) {
  if (!BlockTypes.get("mushroom_yorkie:dog_bowl")) {
    return;
  }
  for (const [index, name] of FURNITURE.entries()) {
    const identifier = "mushroom_yorkie:" + name;
    const location = { x: 4 + index, y: 201, z: 4 };
    dimension.setBlockType(location, identifier);
    if (dimension.getBlock(location)?.typeId !== identifier) {
      throw new Error("Could not place " + identifier);
    }
  }
  console.warn("MUSHROOM_TEST_FURNITURE");
}

world.afterEvents.worldLoad.subscribe(async () => {
  try {
    const dimension = world.getDimension("overworld");
    await world.tickingAreaManager.createTickingArea(AREA, {
      dimension,
      from: MIN,
      to: MAX,
    });

    for (const item of ["yorkie_treat", "adoption_tag"]) {
      if (!ItemTypes.get("mushroom_yorkie:" + item)) {
        throw new Error("Item was not registered: " + item);
      }
    }

    const originalId = world.getDynamicProperty(ENTITY_ID);
    if (originalId !== undefined) {
      const pups = dimension.getEntities({ type: YORKIE, location: CENTER, maxDistance: 8 });
      if (pups.length !== 1 || pups[0].id !== originalId || !pups[0].getComponent("minecraft:tameable")) {
        throw new Error("Expected the same untamed Yorkie after reopening");
      }
      await testHarness(pups[0]);
      testFurniture(dimension);
      console.warn("MUSHROOM_TEST_REOPENED");
      return;
    }

    const platform = new BlockVolume({ x: 3, y: 200, z: 3 }, { x: 12, y: 200, z: 12 });
    dimension.fillBlocks(platform, "minecraft:stone");
    const puppy = dimension.spawnEntity(YORKIE, CENTER, { spawnEvent: "minecraft:entity_spawned" });
    await system.waitTicks(2);
    if (!puppy.getComponent("minecraft:tameable")) {
      throw new Error("Yorkie spawned without its untamed component group");
    }
    world.setDynamicProperty(ENTITY_ID, puppy.id);
    console.warn("MUSHROOM_TEST_SPAWNED");
  } catch (error) {
    console.warn("MUSHROOM_TEST_FAIL " + (error.stack ?? String(error)));
  }
});
