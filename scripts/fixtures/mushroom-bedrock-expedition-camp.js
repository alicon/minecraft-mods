import { BlockVolume, Direction, EntityDamageCause, GameMode, ItemStack, Potions, system, world } from "@minecraft/server";
import { spawnSimulatedPlayer } from "@minecraft/server-gametest";

const YORKIE = "mushroom_yorkie:mushroom_yorkie";
const MAT = "mushroom_yorkie:camp_mat";
const CAMP = "mushroom_yorkie:expedition_camp";
const HOME = "mushroom_yorkie:home_goal";
const SAVED_DOG = "camp_fixture_dog";
const SAVED_CAMP = "camp_fixture_position";
// The combined suite keeps prior dogs in its save. Keep the camp inputs out
// of the earlier vest and portal yards so another dog cannot block placement.
const campAt = (x, z, y = 231) => ({ x: x + 192, y, z });
const FIRST = campAt(9, 8);
const SECOND = campAt(12, 8);
const UNSAFE = campAt(9, 11);
const RETREAT_START = campAt(4.5, 8.5);
let matPlacement;
let matUse;

world.afterEvents.playerPlaceBlock.subscribe(({ player, block }) => {
  if (block.typeId === MAT) matPlacement = { actor: player.id, at: block.location };
});
world.afterEvents.playerInteractWithBlock.subscribe(({ player, block, beforeItemStack }) => {
  if (beforeItemStack?.typeId === MAT) matUse = { actor: player.id, at: block.location };
});

async function waitFor(ok, message, ticks = 80) {
  for (let i = 0; i < ticks; i += 2) {
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

function distance(from, to) {
  return Math.hypot(from.x - to.x, from.y - to.y, from.z - to.z);
}

async function exerciseRetreat(dimension, dog, owner, guest) {
  const camp = { x: SECOND.x + 0.5, y: SECOND.y, z: SECOND.z + 0.5 };
  const magma = campAt(8, 6, 230);
  dimension.fillBlocks(new BlockVolume(campAt(8, 7), campAt(8, 9, 232)), "minecraft:stone");
  dimension.setBlockType(magma, "minecraft:magma");
  owner.teleport(campAt(14.5, 12.5));
  guest.teleport(campAt(14.5, 5.5));
  dog.teleport(RETREAT_START);
  await system.waitTicks(2);
  const health = dog.getComponent("minecraft:health");
  const before = health.currentValue;
  if (!dog.applyDamage(2, { cause: EntityDamageCause.magic }) || health.currentValue >= before) {
    throw new Error("The staged hit did not damage the dog");
  }
  await waitFor(() => dog.getProperty(HOME) === "camp", "Mushroom did not retreat after damage with a camp marked");
  await waitFor(() => {
    const foot = { x: Math.floor(dog.location.x), y: 230, z: Math.floor(dog.location.z) };
    if (dog.location.y < 230.75 || (foot.x === magma.x && foot.z === magma.z)) {
      throw new Error("Mushroom used the unsafe floor during retreat");
    }
    return distance(dog.location, camp) < 0.7;
  }, () => "Mushroom did not walk around the wall to his marked mat: " + JSON.stringify({
    dog: dog.location, home: dog.getProperty(HOME), health: health.currentValue,
  }), 320);
  guest.teleport({ ...camp, z: camp.z + 1.3 });
  await system.waitTicks(50);
  if (distance(dog.location, camp) > 0.8 || dog.getProperty(HOME) !== "camp") {
    throw new Error("A nearby guest ended the owner's camp stay");
  }
  owner.teleport({ ...camp, z: camp.z - 1.5 });
  await waitFor(() => dog.getProperty(HOME) === "idle", "The returning owner could not recall Mushroom");
  owner.teleport(campAt(14.5, 12.5));
  guest.teleport(campAt(14.5, 5.5));
  dimension.setBlockType(SECOND, "minecraft:air");
  dog.teleport(RETREAT_START);
  health.setCurrentValue(health.effectiveMax);
  await system.waitTicks(3);
  if (!dog.applyDamage(2, { cause: EntityDamageCause.magic })) throw new Error("The second staged hit was ignored");
  await waitFor(() => dog.getProperty(HOME) === "camp", "The dog failed to hold safely when its mat was gone");
  await system.waitTicks(60);
  if (distance(dog.location, RETREAT_START) > 0.8 || dog.getProperty(HOME) !== "camp") {
    throw new Error("Mushroom left safe ground for a missing or unassigned mat");
  }
  console.warn("MUSHROOM_EXPEDITION_CAMP_RETREAT " + dog.id);
}

async function exerciseCloudRetreat() {
  const dimension = world.getDimension("the_end");
  const origin = { x: 104.5, y: 211, z: 88.5 };
  const from = { x: 97, y: 210, z: 81 };
  const to = { x: 112, y: 218, z: 96 };
  await world.tickingAreaManager.createTickingArea("mushroom_cloud_fixture", { dimension, from, to });
  dimension.fillBlocks(new BlockVolume(from, { ...to, y: from.y }), "minecraft:end_stone");
  const player = spawnSimulatedPlayer({ dimension, ...origin, x: origin.x + 3 }, "CloudOwner", GameMode.Survival);
  const dog = dimension.spawnEntity(YORKIE, origin);
  await system.waitTicks(5);
  if (!dog.getComponent("minecraft:tameable")?.tame(player)) throw new Error("Cloud fixture dog did not tame");
  player.teleport({ ...origin, x: origin.x + 3 });
  player.selectedSlotIndex = 5;
  player.getComponent("minecraft:inventory").container.setItem(5, Potions.resolve("minecraft:slowness", "ThrownLingering"));
  await system.waitTicks(3);
  player.lookAtLocation(origin);
  await system.waitTicks(2);
  player.useItemInSlot(5);
  const nativeCloud = () => dimension.getEntities({
    type: "minecraft:area_effect_cloud", location: origin, maxDistance: 4,
  })[0];
  await waitFor(nativeCloud, "The native lingering potion did not create a cloud");
  const cloud = nativeCloud().location;
  const clearOfCloud = () => distance(dog.location, cloud) > 4 && dog.getProperty(HOME) === "camp";
  await waitFor(clearOfCloud, "Mushroom did not walk out of the native cloud", 180);
  for (let tick = 0; tick < 50; tick += 2) {
    if (!clearOfCloud()) throw new Error("The owner standing in the cloud called Mushroom back into it");
    await system.waitTicks(2);
  }
  const safe = dog.location;
  const away = Math.atan2(safe.z - cloud.z, safe.x - cloud.x);
  player.teleport({ x: safe.x + 1.25 * Math.cos(away), y: safe.y, z: safe.z + 1.25 * Math.sin(away) });
  await waitFor(() => dog.getProperty(HOME) === "idle", "The owner could not release the hold from outside the cloud");
  if (dog.getComponent("minecraft:health").currentValue <= 0) throw new Error("The original dog died in the cloud fixture");
  player.disconnect();
  console.warn("MUSHROOM_EXPEDITION_CAMP_NATIVE_CLOUD " + dog.id);
}

world.afterEvents.worldLoad.subscribe(async () => {
  try {
    const dimension = world.getDimension("overworld");
    const from = campAt(1, 1, 230);
    const to = campAt(15, 15, 235);
    await world.tickingAreaManager.createTickingArea("mushroom_camp_fixture", { dimension, from, to });
    const savedDog = world.getDynamicProperty(SAVED_DOG);
    if (typeof savedDog === "string") {
      await waitFor(() => {
        const dog = world.getEntity(savedDog);
        return dog?.getDynamicProperty(CAMP) === world.getDynamicProperty(SAVED_CAMP)
          && dog.getProperty(HOME) === "camp";
      }, "The same dog did not keep the marked mat and safety hold across restart");
      console.warn("MUSHROOM_EXPEDITION_CAMP_REOPENED " + savedDog);
      return;
    }
    world.gameRules.doMobSpawning = false;
    world.setTimeOfDay(1000);
    dimension.fillBlocks(new BlockVolume(from, { ...to, y: from.y }), "minecraft:stone");
    const owner = spawnSimulatedPlayer({ dimension, ...campAt(8.5, 6.5) }, "CampOwner", GameMode.Survival);
    const guest = spawnSimulatedPlayer({ dimension, ...campAt(6.5, 9.5) }, "CampGuest", GameMode.Survival);
    const dog = dimension.spawnEntity(YORKIE, campAt(7.5, 8.5));
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
    await exerciseRetreat(dimension, dog, owner, guest);
    await exerciseCloudRetreat();

    world.setDynamicProperty(SAVED_DOG, dog.id);
    world.setDynamicProperty(SAVED_CAMP, expected(SECOND));
    console.warn("MUSHROOM_EXPEDITION_CAMP_PASS " + dog.id);
  } catch (error) {
    console.warn("MUSHROOM_TEST_FAIL " + String(error) + "\n" + (error.stack ?? ""));
  }
});
