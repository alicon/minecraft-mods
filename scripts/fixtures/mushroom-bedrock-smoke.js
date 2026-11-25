import { BlockPermutation, BlockTypes, BlockVolume, ItemStack, ItemTypes, system, WeatherType, world } from "@minecraft/server";

const YORKIE = "mushroom_yorkie:mushroom_yorkie";
const ENTITY_ID = "mushroom_smoke:original_entity";
const CARE_TESTED = "mushroom_smoke:care_tested";
const AREA = "mushroom_smoke";
const MIN = { x: 0, y: 195, z: 0 };
const MAX = { x: 15, y: 205, z: 15 };
const CENTER = { x: 8.5, y: 201, z: 8.5 };
const FURNITURE = ["dog_bowl", "dog_food_bowl", "dog_water_bowl", "dog_bed", "doghouse"];
const NAMESPACE = "mushroom_yorkie:";
const FOOD = { x: 5, y: 201, z: 8 };

async function waitFor(condition, description, ticks = 180) {
  for (let elapsed = 0; elapsed < ticks; elapsed += 5) {
    if (condition()) {
      return;
    }
    await system.waitTicks(5);
  }
  throw new Error("Timed out waiting for " + description);
}

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
    dimension.setBlockType(location, "minecraft:air");
  }
  console.warn("MUSHROOM_TEST_FURNITURE");
}

async function testFetchEquipment(dimension) {
  const id = NAMESPACE + "yorkie_ball";
  if (!ItemTypes.get(id)) {
    return;
  }
  const toy = new ItemStack(id);
  toy.nameTag = "Bedrock Fetch Fixture";
  const thrown = dimension.spawnItem(toy, { x: 10.5, y: 202.5, z: 9.5 });
  thrown.applyImpulse({ x: 0.3, y: 0.05, z: 0 });
  await waitFor(() => thrown.location.x > 10.75, "the dropped toy to move under impulse", 30);
  thrown.remove();

  const carrier = dimension.spawnEntity(YORKIE, { x: 10.5, y: 201, z: 9.5 }, { spawnEvent: "minecraft:entity_spawned" });
  const cargo = carrier.getComponent("minecraft:inventory")?.container;
  cargo?.setItem(0, toy);
  if (cargo?.getItem(0)?.nameTag !== toy.nameTag) {
    throw new Error("The Yorkie's carried slot did not keep the real item metadata");
  }
  carrier.kill();
  const findToys = () => dimension.getEntities({ type: "minecraft:item", location: CENTER, maxDistance: 8 })
    .map((item) => item.getComponent("minecraft:item")?.itemStack)
    .filter((stack) => stack?.nameTag === toy.nameTag);
  await waitFor(() => findToys().length !== 0, "the native death drop of the carried toy", 50);
  const [returned] = findToys();
  if (findToys().length !== 1 || returned.amount !== 1 || returned.typeId !== id) {
    throw new Error("The carrier failed to drop exactly one real toy");
  }
  console.warn("MUSHROOM_TEST_FETCH_EQUIPMENT");
}

async function testDomesticCare(puppy, dimension) {
  if (puppy.getProperty(NAMESPACE + "home_goal") === undefined) {
    return;
  }
  puppy.teleport(CENTER);
  world.setTimeOfDay(1000);
  puppy.triggerEvent(NAMESPACE + "on_tame");
  const water = { x: 5, y: 201, z: 9 };
  dimension.setBlockType(FOOD, NAMESPACE + "dog_food_bowl");
  dimension.setBlockType(water, NAMESPACE + "dog_water_bowl");
  await waitFor(() => dimension.getBlock(FOOD)?.typeId === NAMESPACE + "dog_bowl", "Mushroom to reach and eat from the food bowl");
  await waitFor(() => dimension.getBlock(water)?.typeId === NAMESPACE + "dog_bowl", "Mushroom to drink from the water bowl");
  const day = world.getDay();
  dimension.setBlockType(FOOD, NAMESPACE + "dog_food_bowl");
  await assertBowlStillFull(puppy, dimension);
  console.warn("MUSHROOM_TEST_DAILY_BOWLS");

  const house = { x: 7, y: 201, z: 8 };
  const bed = { x: 6, y: 201, z: 9 };
  dimension.setBlockPermutation(house, BlockPermutation.resolve(NAMESPACE + "doghouse", {
    "minecraft:cardinal_direction": "south",
  }));
  dimension.setBlockType(bed, NAMESPACE + "dog_bed");
  world.setTimeOfDay(14500);
  await waitFor(() => puppy.getProperty(NAMESPACE + "home_goal") === "sleep", "Mushroom to curl up in his doghouse", 180)
    .catch((error) => {
      const floor = dimension.getBlockBelow({ ...house, y: house.y - 1 }, { maxDistance: 1 });
      throw new Error(String(error) + " " + JSON.stringify({
        goal: puppy.getProperty(NAMESPACE + "home_goal"),
        location: puppy.location,
        ground: puppy.isOnGround,
        time: world.getTimeOfDay(),
        dimension: puppy.dimension.id,
        facing: dimension.getBlock(house)?.permutation.getState("minecraft:cardinal_direction"),
        floor: floor?.typeId,
      }));
    });
  if (Math.floor(puppy.location.x) !== house.x || Math.floor(puppy.location.z) !== house.z
    || Math.abs(puppy.location.y - (house.y + 2 / 16)) > 0.04) {
    throw new Error("Mushroom slept off the doghouse mattress: " + JSON.stringify(puppy.location));
  }
  await system.waitTicks(25);
  if (puppy.getProperty(NAMESPACE + "home_goal") !== "sleep") {
    throw new Error("Mushroom did not stay asleep after settling");
  }

  const entrance = { ...house, z: house.z + 1 };
  dimension.setBlockType(entrance, "minecraft:stone");
  await waitFor(() => puppy.getProperty(NAMESPACE + "home_goal") === "sleep"
    && Math.floor(puppy.location.x) === bed.x && Math.floor(puppy.location.z) === bed.z,
  "Mushroom to switch to his bed when the doghouse entrance is obstructed");

  const monster = dimension.spawnEntity("minecraft:zombie", { x: 10.5, y: 201, z: 8.5 });
  await waitFor(() => puppy.getProperty(NAMESPACE + "home_goal") !== "sleep", "Mushroom to wake when a monster approaches");
  monster.remove();
  await waitFor(() => puppy.getProperty(NAMESPACE + "home_goal") === "sleep", "Mushroom to settle after the threat is gone");
  console.warn("MUSHROOM_TEST_NIGHT_SAFETY");

  world.setAbsoluteTime(day * 24000 + 1000);
  await waitFor(() => puppy.getProperty(NAMESPACE + "home_goal") !== "sleep", "Mushroom to wake at dawn");
  console.warn("MUSHROOM_TEST_NIGHT_REST");
  await assertBowlStillFull(puppy, dimension);
  world.setDynamicProperty(CARE_TESTED, day);
}

async function assertBowlStillFull(puppy, dimension) {
  puppy.teleport({ x: FOOD.x + 0.5, y: FOOD.y, z: FOOD.z + 0.5 });
  await system.waitTicks(35);
  if (dimension.getBlock(FOOD)?.typeId !== NAMESPACE + "dog_food_bowl") {
    throw new Error("Mushroom took a second meal on the same day");
  }
}

world.afterEvents.worldLoad.subscribe(async () => {
  try {
    const dimension = world.getDimension("overworld");
    world.gameRules.doWeatherCycle = false;
    world.gameRules.doMobSpawning = false;
    dimension.setWeather(WeatherType.Clear);
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
      const careDay = world.getDynamicProperty(CARE_TESTED);
      const expectedComponent = careDay === undefined ? "minecraft:tameable" : "minecraft:is_tamed";
      if (pups.length !== 1 || pups[0].id !== originalId || !pups[0].getComponent(expectedComponent)) {
        throw new Error("Expected the same Yorkie and taming state after reopening");
      }
      if (typeof careDay === "number") {
        world.setAbsoluteTime(careDay * 24000 + 1000);
        await assertBowlStillFull(pups[0], dimension);
        console.warn("MUSHROOM_TEST_CARE_PERSISTED");
        return;
      }
      await testHarness(pups[0]);
      testFurniture(dimension);
      await testFetchEquipment(dimension);
      await testDomesticCare(pups[0], dimension);
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
    console.warn("MUSHROOM_TEST_FAIL " + String(error) + "\n" + (error.stack ?? ""));
  }
});
