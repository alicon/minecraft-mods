import { BlockVolume, Direction, GameMode, ItemStack, system, world } from "@minecraft/server";
import { spawnSimulatedPlayer } from "@minecraft/server-gametest";

const YORKIE = "mushroom_yorkie:mushroom_yorkie";
const MAT = "mushroom_yorkie:camp_mat";
const CAMP = "mushroom_yorkie:expedition_camp";
const SAVED_DOG = "camp_fixture_dog";
const SAVED_CAMP = "camp_fixture_position";
const FIRST = { x: 9, y: 231, z: 8 };
const SECOND = { x: 12, y: 231, z: 8 };
const UNSAFE = { x: 9, y: 231, z: 11 };
let matPlacement;
let matUse;

world.afterEvents.playerPlaceBlock.subscribe(({ player, block }) => {
  if (block.typeId === MAT) matPlacement = { actor: player.id, at: block.location };
});
world.afterEvents.playerInteractWithBlock.subscribe(({ player, block, beforeItemStack }) => {
  if (beforeItemStack?.typeId === MAT) matUse = { actor: player.id, at: block.location };
});

async function waitFor(ok, message) {
  for (let i = 0; i < 40; i++) {
    if (ok()) return;
    await system.waitTicks(2);
  }
  throw new Error(typeof message === "function" ? message() : message);
}

async function placeMat(player, position) {
  player.stopUsingItem();
  const offset = player.name === "CampOwner" ? -1.25 : 2.25;
  player.teleport({ x: position.x + 0.5, y: position.y, z: position.z + offset });
  const hotbarSlot = 8;
  const inventory = player.getComponent("minecraft:inventory").container;
  player.selectedSlotIndex = hotbarSlot;
  inventory.setItem(hotbarSlot, new ItemStack(MAT));
  const support = { ...position, y: position.y - 1 };
  for (let attempt = 0; attempt < 8 && inventory.getItem(hotbarSlot)?.typeId === MAT; attempt++) {
    player.lookAtLocation({ x: position.x + 0.5, y: position.y, z: position.z + 0.5 });
    await system.waitTicks(2);
    player.useItemInSlotOnBlock(hotbarSlot, support, Direction.Up);
    await system.waitTicks(2);
    player.stopUsingItem();
  }
  await waitFor(() => player.dimension.getBlock(position)?.typeId === MAT && !inventory.getItem(hotbarSlot),
    () => "Native placement did not use the camp mat from the hotbar: " + JSON.stringify({
      matPlacement, matUse, target: position, observed: player.dimension.getBlock(position)?.typeId,
      held: inventory.getItem(hotbarSlot)?.typeId, player: player.location,
    }));
  player.stopUsingItem();
  await system.waitTicks(2);
}

world.afterEvents.worldLoad.subscribe(async () => {
  try {
    const dimension = world.getDimension("overworld");
    const from = { x: 1, y: 230, z: 1 };
    const to = { x: 15, y: 235, z: 15 };
    await world.tickingAreaManager.createTickingArea("mushroom_camp_fixture", { dimension, from, to });
    const savedDog = world.getDynamicProperty(SAVED_DOG);
    if (typeof savedDog === "string") {
      await waitFor(() => world.getEntity(savedDog)?.getDynamicProperty(CAMP) === world.getDynamicProperty(SAVED_CAMP),
        "The same dog did not keep the marked mat across restart");
      console.warn("MUSHROOM_EXPEDITION_CAMP_REOPENED " + savedDog);
      return;
    }
    world.gameRules.doMobSpawning = false;
    world.setTimeOfDay(1000);
    dimension.fillBlocks(new BlockVolume(from, { ...to, y: from.y }), "minecraft:stone");
    const owner = spawnSimulatedPlayer({ dimension, x: 8.5, y: 231, z: 6.5 }, "CampOwner", GameMode.Survival);
    const guest = spawnSimulatedPlayer({ dimension, x: 6.5, y: 231, z: 9.5 }, "CampGuest", GameMode.Survival);
    const dog = dimension.spawnEntity(YORKIE, { x: 7.5, y: 231, z: 8.5 });
    await system.waitTicks(6);
    if (!dog.getComponent("minecraft:tameable").tame(owner)) throw new Error("The fixture dog could not be tamed");
    const expected = position => JSON.stringify({ dimension: dimension.id, ...position });
    await placeMat(owner, FIRST);
    await waitFor(() => dog.getDynamicProperty(CAMP) === expected(FIRST),
      () => "The owner could not mark his camp by placing the mat: " + JSON.stringify({
        matPlacement, matUse, camp: dog.getDynamicProperty(CAMP), owner: dog.getComponent("minecraft:is_tamed")?.tamedToPlayerId,
        actor: owner.id, dog: dog.location, player: owner.location,
        support: dimension.getBlockBelow({ ...FIRST, y: FIRST.y - 1 }, { maxDistance: 1 })?.typeId,
        health: dog.getComponent("minecraft:health")?.currentValue,
      }));

    await placeMat(guest, SECOND);
    if (dog.getDynamicProperty(CAMP) !== expected(FIRST)) throw new Error("A guest changed the owner's camp");
    dimension.setBlockType({ ...UNSAFE, y: UNSAFE.y - 1 }, "minecraft:magma");
    await placeMat(owner, UNSAFE);
    if (dog.getDynamicProperty(CAMP) !== expected(FIRST)) throw new Error("A mat over magma was accepted");
    dimension.setBlockType(SECOND, "minecraft:air");
    await placeMat(owner, SECOND);
    await waitFor(() => dog.getDynamicProperty(CAMP) === expected(SECOND), "The owner could not replace his camp");

    world.setDynamicProperty(SAVED_DOG, dog.id);
    world.setDynamicProperty(SAVED_CAMP, expected(SECOND));
    console.warn("MUSHROOM_EXPEDITION_CAMP_PASS " + dog.id);
  } catch (error) {
    console.warn("MUSHROOM_TEST_FAIL " + String(error) + "\n" + (error.stack ?? ""));
  }
});
