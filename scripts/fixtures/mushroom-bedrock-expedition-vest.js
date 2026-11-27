import { BlockVolume, EntityDamageCause, GameMode, ItemStack, system, world } from "@minecraft/server";
import { spawnSimulatedPlayer } from "@minecraft/server-gametest";

const MUSHROOM = "mushroom_yorkie:";
const YORKIE = MUSHROOM + "mushroom_yorkie";
const PADDED = MUSHROOM + "padded_vest";
const PLATED = MUSHROOM + "plated_vest";
const KIND = MUSHROOM + "vest_kind";
const CRACKED = MUSHROOM + "vest_cracked";
const SAVED_DOG = "vest_saved_dog";
const SAVED_OWNER = "vest_saved_owner";

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

function inventory(player) {
  return player.getComponent("minecraft:inventory").container;
}

function lookAtDog(player, dog) {
  player.lookAtLocation({ ...dog.location, y: dog.location.y + 0.23 });
}

function seesDog(player, dog) {
  return player.getEntitiesFromViewDirection({ maxDistance: 3 })[0]?.entity.id === dog.id;
}

async function aim(player, dog, item) {
  player.stopInteracting();
  const offset = player.name === "VestOwner" ? -1.5 : 1.5;
  player.teleport({ ...dog.location, z: dog.location.z + offset });
  player.selectedSlotIndex = 0;
  inventory(player).setItem(0, typeof item === "string" ? new ItemStack(item) : item);
  await system.waitTicks(3);
  for (let attempt = 0; attempt < 8; attempt++) {
    lookAtDog(player, dog);
    await system.waitTicks(1);
    if (seesDog(player, dog)) return;
  }
  throw new Error("The player's crosshair missed the dog: " + JSON.stringify({
    actor: player.location, dog: dog.location,
  }));
}

async function use(player, dog, item) {
  await aim(player, dog, item);
  const used = player.interact();
  await system.waitTicks(6);
  player.stopInteracting();
  console.warn("MUSHROOM_EXPEDITION_VEST_USE " + JSON.stringify({
    used, held: inventory(player).getItem(0)?.typeId, vest: dog.getProperty(KIND),
    owner: dog.getComponent("minecraft:is_tamed")?.tamedToPlayerId, actor: player.id,
  }));
}

async function damage(dog, amount, cause, expected) {
  const health = dog.getComponent("minecraft:health");
  health.setCurrentValue(health.effectiveMax);
  if (cause === EntityDamageCause.projectile) {
    const arrow = dog.dimension.spawnEntity("minecraft:arrow", { ...dog.location, y: dog.location.y + 4 });
    dog.applyDamage(amount, { damagingProjectile: arrow });
    arrow.remove();
  } else {
    dog.applyDamage(amount, { cause });
  }
  await system.waitTicks(3);
  const observed = health.effectiveMax - health.currentValue;
  expect(Math.abs(observed - expected) < 0.01,
    "Expected " + expected + " " + cause + " damage, observed " + observed);
  await system.waitTicks(20);
  health.setCurrentValue(health.effectiveMax);
}

async function reopen() {
  const id = world.getDynamicProperty(SAVED_DOG);
  for (let i = 0; i < 100; i++) {
    const dog = world.getEntity(id);
    if (dog?.isValid) {
      const owner = dog.getComponent("minecraft:is_tamed");
      const savedOwner = world.getDynamicProperty(SAVED_OWNER);
      const recordedOwner = world.getDynamicProperty(MUSHROOM + "owner_of_yorkie_" + id);
      expect(owner && recordedOwner === savedOwner && (!owner.tamedToPlayerId || owner.tamedToPlayerId === savedOwner),
        "The reopened Yorkie changed owner: " + JSON.stringify({ recordedOwner, current: owner?.tamedToPlayerId }));
      expect(dog.getProperty(KIND) === "plated" && dog.getProperty(CRACKED), "The reopened vest lost its appearance");
      expect(dog.getDynamicProperty(MUSHROOM + "expedition_vest") === "plated:64", "The reopened vest lost exact wear");
      await damage(dog, 10, EntityDamageCause.entityAttack, 10);
      console.warn("MUSHROOM_EXPEDITION_VEST_REOPENED " + id);
      return;
    }
    await system.waitTicks(2);
  }
  throw new Error("Saved dog did not load");
}

world.afterEvents.worldLoad.subscribe(async () => {
  try {
    const dimension = world.getDimension("overworld");
    const from = { x: 1, y: 230, z: 1 };
    const to = { x: 15, y: 236, z: 15 };
    await world.tickingAreaManager.createTickingArea("mushroom_vest", { dimension, from, to });
    if (world.getDynamicProperty(SAVED_DOG)) return await reopen();
    world.gameRules.doMobSpawning = false;
    world.setTimeOfDay(1000);
    dimension.fillBlocks(new BlockVolume(from, { ...to, y: from.y }), "minecraft:stone");
    const owner = spawnSimulatedPlayer({ dimension, x: 8.5, y: 231, z: 7.5 }, "VestOwner", GameMode.Survival);
    const guest = spawnSimulatedPlayer({ dimension, x: 8.5, y: 231, z: 10.5 }, "VestGuest", GameMode.Survival);
    const dog = dimension.spawnEntity(YORKIE, { x: 8.5, y: 231, z: 9.0 });
    await system.waitTicks(6);
    expect(dog.getComponent("minecraft:tameable")?.tame(owner), "Taming did not register");
    await system.waitTicks(6);
    await use(owner, dog, PADDED);
    expect(inventory(owner).getItem(0)?.typeId === PADDED && dog.getProperty(KIND) === "none",
      "An unharnessed dog accepted the vest");
    await use(owner, dog, MUSHROOM + "yorkie_harness");
    for (let tick = 0; tick < 30 && !dog.getProperty(MUSHROOM + "wearing_harness"); tick += 2) {
      await system.waitTicks(2);
    }
    expect(dog.getProperty(MUSHROOM + "wearing_harness"), "Owner could not attach the harness: " + JSON.stringify({
      item: inventory(owner).getItem(0)?.typeId, dog: dog.location,
      wearing: dog.getProperty(MUSHROOM + "wearing_harness"), leashable: dog.hasComponent("minecraft:leashable"),
    }));
    await use(guest, dog, PADDED);
    expect(inventory(guest).getItem(0)?.typeId === PADDED && dog.getProperty(KIND) === "none",
      "The guest equipped the owner's dog");
    await aim(owner, dog, PADDED);
    await aim(guest, dog, PADDED);
    // Aiming the second player takes several ticks, during which the dog can move.
    lookAtDog(owner, dog);
    lookAtDog(guest, dog);
    expect(seesDog(owner, dog) && seesDog(guest, dog), "Both crosshairs must reach the dog in the same tick");
    const tick = system.currentTick;
    const guestUsed = guest.interact();
    const ownerUsed = owner.interact();
    await system.waitTicks(6);
    owner.stopInteracting();
    guest.stopInteracting();
    const ownerHeld = inventory(owner).getItem(0)?.typeId;
    const guestHeld = inventory(guest).getItem(0)?.typeId;
    const vest = dog.getProperty(KIND);
    expect(!ownerHeld && guestHeld === PADDED && vest === "padded",
      "Same-tick attempts should equip only the owner's vest: "
      + JSON.stringify({ tick, guestUsed, ownerUsed, ownerHeld, guestHeld, vest }));
    await damage(dog, 10, EntityDamageCause.entityAttack, 7);
    await damage(dog, 5, EntityDamageCause.lava, 5);
    await use(owner, dog, "minecraft:leather");
    expect(!inventory(owner).getItem(0), "Padded wear should use one leather for repair");
    await damage(dog, 10, EntityDamageCause.projectile, 7);
    await use(owner, dog, "minecraft:armadillo_scute");
    expect(dog.getProperty(KIND) === "plated" && !inventory(owner).getItem(0), "One scute should add plates");
    await damage(dog, 10, EntityDamageCause.entityAttack, 5);
    await use(guest, dog, "minecraft:shears");
    expect(dog.getProperty(KIND) === "plated", "The guest removed the owner's vest");
    await use(owner, dog, "minecraft:shears");
    const returned = Array.from({ length: inventory(owner).size }, (_, slot) => inventory(owner).getItem(slot))
      .find(item => item?.typeId === PLATED);
    expect(dog.getProperty(KIND) === "none" && returned?.getComponent("minecraft:durability")?.damage === 8,
      "Shears should return the plated vest with eight wear");
    inventory(owner).clearAll();
    await use(owner, dog, returned);
    expect(dog.getProperty(KIND) === "plated", "The returned vest should equip with its wear");
    for (let impact = 0; impact < 11; impact++) await damage(dog, 10, EntityDamageCause.entityAttack, 5);
    expect(dog.getProperty(CRACKED), "Cracked state did not become visible");
    await damage(dog, 10, EntityDamageCause.entityAttack, 9);
    await damage(dog, 10, EntityDamageCause.entityAttack, 10);
    expect(dog.getComponent("minecraft:is_tamed")?.tamedToPlayerId === owner.id, "The original Yorkie changed owner");
    world.setDynamicProperty(SAVED_DOG, dog.id);
    world.setDynamicProperty(SAVED_OWNER, owner.id);
    console.warn("MUSHROOM_EXPEDITION_VEST_PASS " + dog.id);
  } catch (error) {
    console.warn("MUSHROOM_TEST_FAIL " + String(error) + "\n" + (error.stack ?? ""));
  }
});
