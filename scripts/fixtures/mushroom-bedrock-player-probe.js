import { BlockVolume, GameMode, ItemStack, system, world } from "@minecraft/server";
import { spawnSimulatedPlayer } from "@minecraft/server-gametest";

const YORKIE = "mushroom_yorkie:mushroom_yorkie";
const TOY = "mushroom_yorkie:yorkie_ball";
const ITEM_NAME = "Mushroom's Test Ball";
const CHEW = "mushroom_yorkie:yorkie_chew_toy";
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
  owner.setItem(new ItemStack("mushroom_yorkie:yorkie_treat"), 0, true);
  const interaction = owner.interactWithEntity(pupil);
  await waitFor(() => pupil.getComponent("minecraft:is_tamed")?.tamedToPlayerId === owner.id,
    "owner to tame Mushroom by interaction (" + interaction + ")", 50);
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

function looseToys(dimension, name) {
  return dimension.getEntities({ type: "minecraft:item", location: { x: 10, y: 231, z: 6 }, maxDistance: 17 })
    .filter((item) => item.getComponent("minecraft:item")?.itemStack.nameTag === name);
}

world.afterEvents.worldLoad.subscribe(async () => {
  try {
    const dimension = world.getDimension("overworld");
    const from = { x: 1, y: 228, z: 1 };
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

    const otherStart = { x: 5.5, y: 231, z: 11.5 };
    const other = spawnSimulatedPlayer({ dimension, ...otherStart }, "MushroomGuest", GameMode.Survival);
    const secondPup = spawnYorkie(dimension, { ...pupStart, z: otherStart.z });
    await system.waitTicks(6);
    owner.teleport(otherStart);
    owner.setItem(new ItemStack("mushroom_yorkie:yorkie_treat"), 0, true);
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
    const returnAfterModeChange = "Real ball with Creative pockets";
    throwToy(owner, TOY, returnAfterModeChange);
    await waitFor(() => carried(pupil)?.nameTag === returnAfterModeChange, "the real toy to be picked up");
    owner.setGameMode(GameMode.Creative);
    for (let slot = 0; slot < pocket.size; ++slot) {
      pocket.setItem(slot, new ItemStack("minecraft:cobblestone", 64));
    }
    await system.waitTicks(55);
    if (carried(pupil)?.nameTag !== returnAfterModeChange || looseToys(dimension, returnAfterModeChange).length) {
      throw new Error("A real toy was lost or dropped when the owner's Creative inventory filled");
    }
    pocket.setItem(0, undefined);
    await waitFor(() => inventoryCount(owner, TOY, returnAfterModeChange) === 1,
      "the carried Survival toy to be returned after creating a slot in Creative");
    console.warn("MUSHROOM_SIM_CREATIVE_OVERFLOW");

    owner.setGameMode(GameMode.Survival);
    pocket.clearAll();
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
