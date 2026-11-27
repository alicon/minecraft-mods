import { BlockVolume, GameMode, ItemStack, system, world } from "@minecraft/server";
import { spawnSimulatedPlayer } from "@minecraft/server-gametest";

const NS = "mushroom_yorkie:";
const CHASE = NS + "woodland_chase";
const CUE = NS + "woodland_cue";
const GUIDE = NS + "field_guide";
const PAWS = NS + "leave_it_paws";
const FIXTURE_PUP = "mushroom_woodland_fixture:pup";
const FIXTURE_PROGRESS = "mushroom_woodland_fixture:paws";

function expect(condition, description) {
  if (!condition) throw new Error(description);
}

async function waitFor(predicate, message, ticks = 120) {
  for (let count = 0; count < ticks; count++) {
    if (predicate()) return;
    await system.waitTicks(1);
  }
  throw new Error(typeof message === "function" ? message() : message);
}

world.afterEvents.worldLoad.subscribe(async () => {
  try {
    const dimension = world.getDimension("overworld");
    const at = (x, z = 43.5, y = 231) => ({ x, y, z });
    await world.tickingAreaManager.createTickingArea("mushroom_woodland_test", {
      dimension, from: at(32, 36, 230), to: at(95, 52, 236),
    });
    const savedId = world.getDynamicProperty(FIXTURE_PUP);
    if (typeof savedId === "string") {
      await waitFor(() => world.getEntity(savedId)?.isValid, "The training dog was missing on reopen");
      const dog = world.getEntity(savedId);
      expect(dog.getDynamicProperty(PAWS) === world.getDynamicProperty(FIXTURE_PROGRESS)
        && dog.getProperty(CUE) === "none" && !dog.getProperty(CHASE),
        "Reload lost training history or restored an incomplete cue");
      console.warn("MUSHROOM_WOODLAND_REOPENED");
      return;
    }
    const fill = (a, b, type) => dimension.fillBlocks(new BlockVolume(a, b), type);
    fill(at(32, 36), at(95, 52, 236), "minecraft:air");
    fill(at(32, 36, 230), at(95, 52, 230), "minecraft:grass_block");
    world.setTimeOfDay(1000);
    const owner = spawnSimulatedPlayer({ dimension, ...at(39.5) }, "WoodlandOwner", GameMode.Survival);
    const pup = dimension.spawnEntity(NS + "mushroom_yorkie", at(43.5), { spawnEvent: "minecraft:entity_spawned" });
    await system.waitTicks(6);
    expect(pup.getComponent("minecraft:tameable").tame(owner), "Could not tame Mushroom");
    await system.waitTicks(4);
    const squirrel = dimension.spawnEntity(NS + "squirrel", at(47.5));
    const squirrelHealth = squirrel.getComponent("minecraft:health").currentValue;
    await waitFor(() => pup.getProperty(CHASE),
      () => "Mushroom never started the visible chase " + JSON.stringify({ pup: pup.location, squirrel: squirrel.location }));
    const dogStart = pup.location.x;
    const squirrelStart = squirrel.location.x;
    await waitFor(() => pup.location.x > dogStart + 0.4 && squirrel.location.x > squirrelStart + 0.4,
      () => "Dog and squirrel failed to move along the chase " + JSON.stringify({ pup: pup.location, squirrel: squirrel.location }));
    expect(squirrel.getComponent("minecraft:health").currentValue === squirrelHealth, "Play chase hurt the squirrel");
    owner.teleport(at(71.5));
    await waitFor(() => !pup.getProperty(CHASE), "A distant owner did not end the chase", 24);
    squirrel.remove();
    owner.teleport(at(57, 47.5));
    await waitFor(() => Math.hypot(pup.location.x - 57, pup.location.z - 47.5) < 4,
      () => "Native following did not resume: " + JSON.stringify(pup.location), 200);
    expect(pup.getComponent("minecraft:is_tamed")?.tamedToPlayerId === owner.id, "Chase changed the owner");
    console.warn("MUSHROOM_WOODLAND_CHASE_PASS");

    owner.teleport(at(65));
    pup.teleport(at(65));
    await system.waitTicks(130);
    const blocked = dimension.spawnEntity(NS + "squirrel", at(69));
    await waitFor(() => pup.getProperty(CHASE), "Mushroom never began the second chase");
    pup.teleport(at(65.2));
    blocked.teleport(at(69));
    fill(at(66, 36), at(66, 52, 234), "minecraft:stone");
    await waitFor(() => !pup.getProperty(CHASE), "Chase failed to give up at a blocked trail", 90);
    expect(pup.location.x < 66, "Mushroom crossed a solid wall during a chase");
    expect(blocked.getComponent("minecraft:health").currentValue === squirrelHealth, "Blocked play hurt the squirrel");
    fill(at(66, 36), at(66, 52, 234), "minecraft:air");
    blocked.remove();
    await practice(dimension, at, owner, pup);
    world.setDynamicProperty(FIXTURE_PUP, pup.id);
    world.setDynamicProperty(FIXTURE_PROGRESS, pup.getDynamicProperty(PAWS));
    owner.disconnect();
    console.warn("MUSHROOM_WOODLAND_PASS");
  } catch (error) {
    console.warn("MUSHROOM_TEST_FAIL " + String(error) + "\n" + (error.stack ?? ""));
  }
});


function pawCount(pup) {
  return JSON.parse(pup.getDynamicProperty(PAWS) ?? "[]").length;
}

async function cue(player, slot = 3) {
  player.selectedSlotIndex = slot;
  player.isSneaking = true;
  player.lookAtLocation({ ...player.location, y: player.location.y + 6, z: player.location.z + 0.4 });
  await system.waitTicks(2);
  const used = player.useItemInSlot(slot);
  await system.waitTicks(4);
  player.isSneaking = false;
  return used;
}

async function practice(dimension, at, owner, pup) {
  const inventory = owner.getComponent("minecraft:inventory").container;
  const found = Array.from({ length: inventory.size }, (_, slot) => inventory.getItem(slot))
    .findIndex((stack) => stack?.typeId === GUIDE);
  expect(found >= 0, "Taming did not give the owner a Field Guide");
  if (found !== 3) {
    inventory.setItem(3, inventory.getItem(found));
    inventory.setItem(found, undefined);
  }
  inventory.setItem(4, new ItemStack(NS + "yorkie_treat", 6));
  const guest = spawnSimulatedPlayer({ dimension, ...at(36, 40.5) }, "WoodlandGuest", GameMode.Survival);
  guest.getComponent("minecraft:inventory").container.setItem(3, new ItemStack(GUIDE));
  owner.teleport(at(40));
  pup.teleport(at(43));
  await system.waitTicks(130);
  const first = dimension.spawnEntity(NS + "squirrel", at(47));
  await waitFor(() => pup.getProperty(CHASE), "First training chase did not start");
  await cue(guest);
  expect(pup.getProperty(CUE) === "none" && pawCount(pup) === 0, "A guest used the owner's training cue");

  const rehearse = async (expected) => {
    await waitFor(() => pup.getProperty(CHASE), "A training chase did not start");
    const used = await cue(owner);
    await waitFor(() => pup.getProperty(CUE) === "reward", () =>
      `Guide did not call him back: use=${used}, cue=${pup.getProperty(CUE)}, dog=${JSON.stringify(pup.location)}`);
    if (pawCount(pup) === 0) {
      guest.teleport({ ...pup.location, z: pup.location.z + 1.4 });
      const guestInventory = guest.getComponent("minecraft:inventory").container;
      guestInventory.setItem(4, new ItemStack(NS + "yorkie_treat", 2));
      guest.selectedSlotIndex = 4;
      await system.waitTicks(2);
      guest.interactWithEntity(pup);
      await system.waitTicks(4);
      expect(guestInventory.getItem(4)?.amount === 1 && pawCount(pup) === 0 && pup.getProperty(CUE) === "reward",
        "A guest could not feed normally during a lesson or changed the owner's training");
    }
    const health = pup.getComponent("minecraft:health");
    health.setCurrentValue(16);
    const beforeCue = pup.getProperty(CUE);
    owner.selectedSlotIndex = 4;
    await system.waitTicks(2);
    const originalCount = inventory.getItem(4).amount;
    const fed = owner.interactWithEntity(pup);
    await waitFor(() => pup.getProperty(CUE) === "none" && pawCount(pup) === expected,
      () => `Native feed did not award expected progress: used=${fed}, paws=${pawCount(pup)}, stack=${inventory.getItem(4)?.amount}, cue=${beforeCue}->${pup.getProperty(CUE)}, health=${health.currentValue}`, 24);
    await waitFor(() => health.currentValue === 19, "The training treat did not heal three points", 24);
    expect(inventory.getItem(4)?.amount === originalCount - 1, "The training reward did not consume exactly one treat");
  };

  await rehearse(1);
  console.warn("MUSHROOM_WOODLAND_ONE_PAW");
  first.teleport(at(Math.min(pup.location.x + 4, 55), pup.location.z));
  await rehearse(1);
  const firstId = first.id;
  first.remove();
  const second = dimension.spawnEntity(NS + "squirrel", at(Math.min(pup.location.x + 4, 55), pup.location.z));
  await rehearse(2);
  console.warn("MUSHROOM_WOODLAND_TWO_PAWS");
  const secondId = second.id;
  second.remove();
  guest.disconnect();

  owner.teleport(at(74, 48));
  pup.teleport(at(73.5, 48));
  await system.waitTicks(5);
  await cue(owner);
  await waitFor(() => pup.getProperty(CUE) === "heel", "Two paws did not unlock the heel cue");
  const third = dimension.spawnEntity(NS + "squirrel", at(78, 44));
  await system.waitTicks(12);
  owner.moveToLocation(at(80, 48), { speed: 0.4 });
  await waitFor(() => owner.location.x >= 79, "Owner could not walk the heel trail");
  await cue(owner);
  await waitFor(() => pup.getProperty(CUE) === "none" && pawCount(pup) === 3, () =>
    `Field heel did not earn the third paw, dog=${JSON.stringify(pup.location)}, owner=${JSON.stringify(owner.location)}`);
  const stamps = JSON.parse(pup.getDynamicProperty(PAWS));
  expect(stamps[0].squirrel === firstId && stamps[1].squirrel === secondId && stamps[2].squirrel === third.id,
    "Training did not retain the distinct practice stories");
  third.remove();
  const freePlay = dimension.spawnEntity(NS + "squirrel", at(Math.min(pup.location.x + 4, 91), pup.location.z));
  await waitFor(() => pup.getProperty(CHASE), "Free-play chase did not resume after release", 150);
  freePlay.remove();
  await waitFor(() => !pup.getProperty(CHASE), "Chase did not finish after the target left");
  console.warn("MUSHROOM_WOODLAND_TRAINING_PASS");
}
