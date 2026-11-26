import { BlockVolume, GameMode, ItemStack, system, world } from "@minecraft/server";
import { spawnSimulatedPlayer } from "@minecraft/server-gametest";

const YORKIE = "mushroom_yorkie:mushroom_yorkie";
const TOY = "mushroom_yorkie:yorkie_ball";
const ITEM_NAME = "Mushroom's Test Ball";
const CHEW = "mushroom_yorkie:yorkie_chew_toy";
const TREAT = "mushroom_yorkie:yorkie_treat";
const OTHER_NAME = "Mushroom's Second Toy";
const OFFLINE_TOY = "Real ball with an offline owner";
const SAVED_PET = "mushroom_smoke:offline_pet";

async function waitFor(predicate, description, ticks = 180) {
  for (let elapsed = 0; elapsed < ticks; elapsed += 2) {
    if (predicate()) {
      return;
    }
    await system.waitTicks(2);
  }
  throw new Error("Timed out: " + description);
}

function inventoryCount(owner, itemId, name) {
  const inventory = owner.getComponent("minecraft:inventory").container;
  let amount = 0;
  for (let slot = 0; slot < inventory.size; ++slot) {
    const item = inventory.getItem(slot);
    if (item?.typeId === itemId && (name === undefined || item.nameTag === name)) {
      amount += item.amount;
    }
  }
  return amount;
}

function spawnYorkie(dimension, location) {
  return dimension.spawnEntity(YORKIE, location, { spawnEvent: "minecraft:entity_spawned" });
}

async function tame(owner, pupil) {
  owner.setItem(new ItemStack(TREAT), 0, true);
  const interaction = owner.interactWithEntity(pupil);
  await waitFor(() => pupil.getComponent("minecraft:is_tamed")?.tamedToPlayerId === owner.id,
    "owner to tame Mushroom by interaction (" + interaction + ")", 50);
}

async function testTreats(owner, pupil) {
  const health = pupil.getComponent("minecraft:health");
  for (const example of TREAT_EXAMPLES) {
    const creative = example.mode === "creative";
    owner.stopInteracting();
    owner.setGameMode(creative ? GameMode.Creative : GameMode.Survival);
    health.setCurrentValue(health.effectiveMax - example.missingHealth);
    owner.setItem(new ItemStack(TREAT, example.treatsBefore), 0, true);
    await system.waitTicks(2);
    owner.interactWithEntity(pupil);
    await waitFor(() => health.currentValue === health.effectiveMax - example.missingAfter
      && inventoryCount(owner, TREAT) === example.treatsAfter, "shared treat example " + JSON.stringify(example));
    if (pupil.getProperty("mushroom_yorkie:ordered_sit")
      || pupil.getComponent("minecraft:is_tamed")?.tamedToPlayerId !== owner.id) {
      throw new Error("Feeding changed the sit order or ownership");
    }
  }
  owner.stopInteracting();
  owner.setGameMode(GameMode.Survival);
  owner.getComponent("minecraft:inventory").container.setItem(0);
  console.warn("MUSHROOM_SIM_TREATS");
}

function throwToy(owner, id, name) {
  const toy = new ItemStack(id);
  toy.nameTag = name;
  owner.setItem(toy, 0, true);
  owner.setRotation({ x: 10, y: -90 });
  return owner.useItemInSlot(0);
}

function carried(pupil) {
  return pupil.getComponent("minecraft:inventory").container.getItem(0);
}

function looseToys(dimension, name, location = { x: 10, y: 231, z: 6 }) {
  return dimension.getEntities({ type: "minecraft:item", location, maxDistance: 17 })
    .filter((item) => item.getComponent("minecraft:item")?.itemStack.nameTag === name);
}

function placeFetchTarget(dimension, owner, name, position) {
  const ball = new ItemStack(TOY);
  ball.nameTag = name;
  const item = dimension.spawnItem(ball, position);
  item.addTag("mushroom_fetch_toy");
  item.setDynamicProperty("mushroom_yorkie:fetch_thrower", owner.id);
  item.setDynamicProperty("mushroom_yorkie:fetch_drop_amount", 1);
  return item;
}

async function testWaterFetch(dimension, owner, pupil) {
  const start = { x: 5.5, y: 231, z: 25.5 };
  await world.tickingAreaManager.createTickingArea("mushroom_water", {
    dimension, from: { x: 0, y: 229, z: 22 }, to: { x: 16, y: 234, z: 29 },
  });
  dimension.fillBlocks(new BlockVolume({ x: 0, y: 230, z: 22 }, { x: 16, y: 230, z: 29 }), "minecraft:stone");
  for (const x of [2, 14]) {
    dimension.fillBlocks(new BlockVolume({ x, y: 231, z: 23 }, { x, y: 234, z: 28 }), "minecraft:glass");
  }
  for (const z of [23, 28]) {
    dimension.fillBlocks(new BlockVolume({ x: 2, y: 231, z }, { x: 14, y: 234, z }), "minecraft:glass");
  }
  dimension.fillBlocks(new BlockVolume({ x: 8, y: 231, z: 24 }, { x: 13, y: 231, z: 27 }), "minecraft:water");
  await system.waitTicks(40);
  owner.teleport(start);
  pupil.teleport({ ...start, x: 7.5 });
  const name = "Shallow pool ball";
  throwToy(owner, TOY, name);
  await waitFor(() => looseToys(dimension, name, start).length === 1, "a ball to be launched into the pool");
  let sawToyInWater = false;
  let carriedInWater = false;
  await waitFor(() => {
    sawToyInWater ||= looseToys(dimension, name, start).some((item) => dimension.getBlock(item.location)?.isLiquid);
    carriedInWater ||= pupil.isInWater && carried(pupil)?.nameTag === name;
    return inventoryCount(owner, TOY, name) === 1;
  }, "one original ball to come back from shallow water", 260);
  if (!sawToyInWater || !carriedInWater || looseToys(dimension, name, start).length || carried(pupil)) {
    throw new Error("Mushroom did not complete a single water retrieval");
  }
  await waitFor(() => !pupil.getProperty("mushroom_yorkie:fetch_busy"), "the water retrieval to finish");
  console.warn("MUSHROOM_SIM_SHALLOW_FETCH");

  dimension.fillBlocks(new BlockVolume({ x: 8, y: 232, z: 24 }, { x: 14, y: 232, z: 27 }), "minecraft:glass");
  dimension.setBlockType({ x: 10, y: 231, z: 25 }, "minecraft:glass");
  dimension.setBlockType({ x: 12, y: 231, z: 25 }, "minecraft:glass");
  dimension.setBlockType({ x: 11, y: 231, z: 24 }, "minecraft:glass");
  dimension.setBlockType({ x: 11, y: 231, z: 26 }, "minecraft:glass");
  owner.teleport(start);
  pupil.teleport({ ...start, x: 7.2 });
  const covered = placeFetchTarget(dimension, owner, "Covered pool ball", { x: 11.5, y: 231.2, z: 25.5 });
  for (let tick = 0; tick < 60; tick += 2) {
    if (!covered.isValid || carried(pupil) || pupil.getProperty("mushroom_yorkie:fetch_busy")) {
      throw new Error("Mushroom tried to collect the ball under the pool roof");
    }
    await system.waitTicks(2);
  }
  console.warn("MUSHROOM_SIM_COVERED_WATER");
}

async function testLedgeFetch(dimension, owner, pupil) {
  const start = { x: 5.5, y: 231, z: 3.5 };
  dimension.fillBlocks(new BlockVolume({ x: 10, y: 230, z: 2 }, { x: 15, y: 230, z: 4 }), "minecraft:air");
  dimension.fillBlocks(new BlockVolume({ x: 10, y: 226, z: 2 }, { x: 15, y: 226, z: 4 }), "minecraft:stone");
  owner.teleport(start);
  pupil.teleport({ ...start, x: 8.5 });
  const dropped = placeFetchTarget(dimension, owner, "Ball at the foot of a ledge", { x: 12.5, y: 227.2, z: 3.5 });
  await waitFor(() => pupil.getProperty("mushroom_yorkie:fetch_busy"), "Mushroom to notice a ball below the ledge");
  await waitFor(() => !pupil.getProperty("mushroom_yorkie:fetch_busy"), "Mushroom to give up on the unsafe drop");
  if (!dropped.isValid || carried(pupil) || pupil.location.y < 230.9) {
    throw new Error("Mushroom attempted the unsafe descent or lost its toy");
  }
  owner.teleport({ ...start, x: 2.5 });
  await waitFor(() => pupil.location.x < 5.5, "Mushroom to follow his owner after giving up");
  dropped.remove();
  dimension.fillBlocks(new BlockVolume({ x: 10, y: 230, z: 2 }, { x: 15, y: 230, z: 4 }), "minecraft:stone");
  console.warn("MUSHROOM_SIM_UNSAFE_LEDGE");
}

world.afterEvents.worldLoad.subscribe(async () => {
  try {
    const dimension = world.getDimension("overworld");
    const from = { x: 1, y: 226, z: 1 };
    const to = { x: 23, y: 233, z: 13 };
    await world.tickingAreaManager.createTickingArea("mushroom_owners", { dimension, from, to });
    const savedPet = world.getDynamicProperty(SAVED_PET);
    if (typeof savedPet === "string") {
      const pet = world.getEntity(savedPet);
      if (!pet?.isValid || carried(pet)?.nameTag !== OFFLINE_TOY || looseToys(dimension, OFFLINE_TOY).length) {
        throw new Error("The same Yorkie did not keep the exact toy across a restart without his owner");
      }
      console.warn("MUSHROOM_SIM_CARGO_SAVED");
      return;
    }
    dimension.fillBlocks(new BlockVolume({ ...from, y: 230 }, { ...to, y: 230 }), "minecraft:stone");
    world.setTimeOfDay(1000);

    const ownerStart = { x: 5.5, y: 231, z: 5.5 };
    const pupStart = { x: 7.5, y: 231, z: 5.5 };
    const owner = spawnSimulatedPlayer({ dimension, ...ownerStart }, "MushroomOwner", GameMode.Survival);
    const pupil = spawnYorkie(dimension, pupStart);
    await system.waitTicks(6);
    await tame(owner, pupil);
    console.warn("MUSHROOM_SIM_TAMED");
    await testTreats(owner, pupil);

    const otherStart = { x: 5.5, y: 231, z: 11.5 };
    const other = spawnSimulatedPlayer({ dimension, ...otherStart }, "MushroomGuest", GameMode.Survival);
    const secondPup = spawnYorkie(dimension, { ...pupStart, z: otherStart.z });
    await system.waitTicks(6);
    owner.teleport(otherStart);
    owner.setItem(new ItemStack(TREAT), 0, true);
    owner.interactWithEntity(secondPup);
    await system.waitTicks(6);
    if (secondPup.getComponent("minecraft:is_tamed")?.tamedToPlayerId === owner.id) {
      throw new Error("An owner claimed a second Yorkie");
    }
    owner.teleport(ownerStart);
    await tame(other, secondPup);
    console.warn("MUSHROOM_SIM_ONE_PET_PER_OWNER");

    pupil.teleport(pupStart);
    secondPup.teleport({ ...pupStart, z: otherStart.z });
    const launched = throwToy(owner, TOY, ITEM_NAME);
    throwToy(other, CHEW, OTHER_NAME);
    await waitFor(() => inventoryCount(owner, TOY, ITEM_NAME) === 0, "toy to leave the owner's inventory (" + launched + ")", 35);
    await waitFor(() => carried(pupil)?.nameTag === ITEM_NAME, "Mushroom to pick up the actual thrown ball");
    console.warn("MUSHROOM_SIM_CARRIED");
    await waitFor(() => inventoryCount(owner, TOY, ITEM_NAME) === 1, "Mushroom to return exactly one original ball");
    await waitFor(() => inventoryCount(other, CHEW, OTHER_NAME) === 1, "the second Yorkie to return the second toy");
    if (inventoryCount(owner, CHEW, OTHER_NAME) || inventoryCount(other, TOY, ITEM_NAME)) {
      throw new Error("The toys were mixed between the two owners");
    }
    console.warn("MUSHROOM_SIM_TWO_OWNERS");

    const practice = "Mushroom's Practice Ball";
    owner.setGameMode(GameMode.Creative);
    owner.teleport(ownerStart);
    pupil.teleport(pupStart);
    throwToy(owner, TOY, practice);
    await waitFor(() => looseToys(dimension, practice).length === 1, "a practice copy to leave the owner's hand");
    await waitFor(() => pupil.getProperty("mushroom_yorkie:fetch_busy") === true, "Mushroom to chase the practice toy");
    await waitFor(() => pupil.getProperty("mushroom_yorkie:fetch_busy") === false, "Mushroom to return from practice");
    if (inventoryCount(owner, TOY, practice) !== 1 || looseToys(dimension, practice).length) {
      throw new Error("Creative practice produced a recoverable copy");
    }
    console.warn("MUSHROOM_SIM_CREATIVE");

    owner.setGameMode(GameMode.Survival);
    const pocket = owner.getComponent("minecraft:inventory").container;
    pocket.clearAll();
    owner.teleport(ownerStart);
    pupil.teleport(pupStart);
    owner.interactWithEntity(pupil);
    await waitFor(() => pupil.getProperty("mushroom_yorkie:ordered_sit") === true, "Mushroom to sit");
    const paused = "Ball thrown while Mushroom is sitting";
    throwToy(owner, TOY, paused);
    await waitFor(() => looseToys(dimension, paused).length === 1, "a ball for the sitting test");
    await system.waitTicks(32);
    if (carried(pupil) || looseToys(dimension, paused).length !== 1) {
      throw new Error("Mushroom disturbed the toy while ordered to sit");
    }
    owner.interactWithEntity(pupil);
    await waitFor(() => pupil.getProperty("mushroom_yorkie:ordered_sit") === false, "Mushroom to stand");
    await waitFor(() => inventoryCount(owner, TOY, paused) === 1, "one original ball to return after standing");
    console.warn("MUSHROOM_SIM_SIT_FETCH");

    owner.teleport(ownerStart);
    pupil.teleport(pupStart);
    const bone = new ItemStack("minecraft:bone");
    bone.nameTag = "Bone tossed using Drop Item";
    owner.setItem(bone, 0, true);
    owner.setRotation({ x: 4, y: -90 });
    const dropped = owner.dropSelectedItem();
    owner.teleport({ ...ownerStart, x: 4 });
    await waitFor(() => carried(pupil)?.nameTag === bone.nameTag,
      "Mushroom to pick up a bone from Drop Item (" + dropped + ")");
    await waitFor(() => inventoryCount(owner, bone.typeId, bone.nameTag) === 1,
      "Mushroom to return exactly one original bone");
    console.warn("MUSHROOM_SIM_BONE_FETCH");

    owner.teleport(ownerStart);
    pupil.teleport(pupStart);
    const full = "A ball to return with full pockets";
    throwToy(owner, TOY, full);
    await waitFor(() => looseToys(dimension, full).length === 1, "the full-inventory scenario to start");
    for (let slot = 0; slot < pocket.size; ++slot) {
      pocket.setItem(slot, new ItemStack("minecraft:cobblestone", 64));
    }
    await waitFor(() => carried(pupil)?.nameTag === full, "Mushroom to carry the full-inventory toy");
    await waitFor(() => !carried(pupil) && looseToys(dimension, full).length === 1,
      "one recoverable Survival toy to be left on the ground");
    console.warn("MUSHROOM_SIM_SURVIVAL_OVERFLOW");

    pocket.clearAll();
    owner.teleport(ownerStart);
    pupil.teleport(pupStart);
    const stopped = "Real ball interrupted by a sit order";
    throwToy(owner, TOY, stopped);
    await waitFor(() => carried(pupil)?.nameTag === stopped, "Mushroom to carry the sit-interruption toy");
    const holding = pupil.location;
    owner.teleport({ ...holding, x: holding.x - 2.9 });
    pocket.setItem(owner.selectedSlotIndex, undefined);
    owner.interactWithEntity(pupil);
    await waitFor(() => pupil.getProperty("mushroom_yorkie:ordered_sit") === true, "Mushroom to sit while holding the toy");
    await waitFor(() => !carried(pupil) && looseToys(dimension, stopped).length === 1,
      "one Survival toy on the ground after interrupting the carry");
    await system.waitTicks(5);
    owner.interactWithEntity(pupil);
    await waitFor(() => pupil.getProperty("mushroom_yorkie:ordered_sit") === false, "Mushroom to resume following");
    console.warn("MUSHROOM_SIM_CARRY_INTERRUPTED");

    owner.teleport(ownerStart);
    pupil.teleport(pupStart);
    const returnAfterModeChange = "Real ball with Creative pockets";
    throwToy(owner, TOY, returnAfterModeChange);
    await waitFor(() => carried(pupil)?.nameTag === returnAfterModeChange, "the real toy to be picked up");
    owner.setGameMode(GameMode.Creative);
    for (let slot = 0; slot < pocket.size; ++slot) {
      pocket.setItem(slot, new ItemStack("minecraft:cobblestone", 64));
    }
    world.setTimeOfDay(14000);
    await waitFor(() => !pupil.getProperty("mushroom_yorkie:fetch_busy"), "nighttime to interrupt fetch");
    await system.waitTicks(55);
    if (carried(pupil)?.nameTag !== returnAfterModeChange || looseToys(dimension, returnAfterModeChange).length) {
      throw new Error("A real toy was lost or dropped at night while the owner's Creative inventory was full");
    }
    world.setTimeOfDay(1000);
    pocket.setItem(0, undefined);
    await waitFor(() => inventoryCount(owner, TOY, returnAfterModeChange) === 1,
      "the carried Survival toy to be returned after creating a slot in Creative");
    console.warn("MUSHROOM_SIM_CREATIVE_OVERFLOW");

    owner.setGameMode(GameMode.Survival);
    pocket.clearAll();
    await testLedgeFetch(dimension, owner, pupil);
    await testWaterFetch(dimension, owner, pupil);
    owner.teleport(ownerStart);
    pupil.teleport(pupStart);
    throwToy(owner, TOY, OFFLINE_TOY);
    await waitFor(() => carried(pupil)?.nameTag === OFFLINE_TOY, "the toy to be held before disconnect");
    owner.disconnect();
    await system.waitTicks(40);
    if (carried(pupil)?.nameTag !== OFFLINE_TOY || looseToys(dimension, OFFLINE_TOY).length) {
      throw new Error("Mushroom did not retain the toy for his offline owner");
    }
    world.setDynamicProperty(SAVED_PET, pupil.id);
    console.warn("MUSHROOM_SIM_OFFLINE_HOLD");
    console.warn("MUSHROOM_SIM_PASS");
    other.disconnect();
  } catch (error) {
    console.warn("MUSHROOM_TEST_FAIL " + String(error) + "\n" + (error.stack ?? ""));
  }
});
