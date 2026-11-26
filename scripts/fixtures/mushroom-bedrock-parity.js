import { BlockPermutation, BlockVolume, GameMode, ItemStack, system, world } from "@minecraft/server";
import { spawnSimulatedPlayer } from "@minecraft/server-gametest";

const NS = "mushroom_yorkie:";
const BALL = NS + "yorkie_ball";
const TREAT = NS + "yorkie_treat";
const origin = { x: 4.5, y: 231, z: 6.5 };
const dogStart = { ...origin, x: 6.5 };
const bag = (player) => player.getComponent("minecraft:inventory").container;
const ownerId = (dog) => dog.getComponent("minecraft:is_tamed")?.tamedToPlayerId;
const leashHolder = (dog) => dog.getComponent("minecraft:leashable")?.leashHolder?.id;

function assert(condition, detail) {
  if (!condition) {
    throw new Error(detail);
  }
}

async function until(predicate, detail, ticks = 80) {
  for (let elapsed = 0; elapsed < ticks; elapsed += 2) {
    if (predicate()) {
      return;
    }
    await system.waitTicks(2);
  }
  throw new Error(detail());
}

async function use(player, dog, type, amount = 1, atCrosshair = false) {
  player.stopInteracting();
  player.selectedSlotIndex = 0;
  player.setItem(new ItemStack(type, amount), 0, true);
  await system.waitTicks(3);
  if (atCrosshair) {
    await until(() => {
      player.lookAtLocation({ ...dog.location, y: dog.location.y + 0.23 });
      return player.getEntitiesFromViewDirection({ maxDistance: 4 })[0]?.entity?.id === dog.id;
    }, () => "setup could not aim at the Yorkie", 20);
    player.interact();
  } else {
    player.interactWithEntity(dog);
  }
  await system.waitTicks(1);
  player.stopInteracting();
}

async function feed(owner, guest, dog, example) {
  const player = example.owner ? owner : guest;
  const item = "minecraft:" + example.item;
  player.setGameMode(example.mode === "creative" ? GameMode.Creative : GameMode.Survival);
  const health = dog.getComponent("minecraft:health");
  const before = health.effectiveMax - example.missingHealth;
  health.setCurrentValue(before);
  await use(player, dog, item, 2, true);
  await system.waitTicks(8);
  const held = bag(player).getItem(0)?.amount ?? 0;
  assert(leashHolder(dog) === (example.leashed ? owner.id : undefined), "changed lead holder");
  assert(health.currentValue === before + example.healed && held === 2 - example.spent,
    "expected health " + (before + example.healed) + " and held " + (2 - example.spent)
      + ", observed health " + health.currentValue + " and held " + held);
  assert(ownerId(dog) === owner.id && !dog.getProperty(NS + "ordered_sit"), "changed owner or sit order");
}

function fillGrass(dimension, type) {
  for (let x = 7; x <= 15; ++x) {
    for (let z = 3; z <= 9; ++z) {
      const position = { x, y: 231, z };
      dimension.setBlockType(position, type);
      if (type === "minecraft:tall_grass") {
        dimension.setBlockPermutation({ ...position, y: 232 }, BlockPermutation.resolve(type, { upper_block_bit: true }));
      }
    }
  }
}

async function fetchGrass(dimension, owner, dog, type) {
  const name = "Fetch through " + type;
  const toy = new ItemStack(BALL);
  toy.nameTag = name;
  fillGrass(dimension, type);
  owner.setGameMode(GameMode.Survival);
  owner.teleport(origin);
  dog.teleport(dogStart);
  bag(owner).clearAll();
  owner.setItem(toy, 0, true);
  owner.setRotation({ x: 10, y: -90 });
  await system.waitTicks(2);
  owner.useItemInSlot(0);
  let loose;
  const cargo = bag(dog);
  try {
    await until(() => {
      loose = dimension.getEntities({ type: "minecraft:item", location: origin, maxDistance: 18 })
        .find((item) => item.getComponent("minecraft:item")?.itemStack.nameTag === name);
      return loose?.hasTag("mushroom_fetch_toy");
    }, () => "setup did not launch a marked toy");
    await until(() => loose?.isValid && dimension.getBlock(loose.location)?.typeId === type,
      () => "setup toy missed " + type + " at " + JSON.stringify(loose?.isValid ? loose.location : null));
    await until(() => cargo.getItem(0)?.nameTag === name, () => "did not pick up toy in " + type
      + " (dog=" + JSON.stringify(dog.location) + ", toy=" + JSON.stringify(loose?.isValid ? loose.location : null)
      + ", busy=" + dog.getProperty(NS + "fetch_busy") + ", sit=" + dog.getProperty(NS + "ordered_sit") + ")", 140);
    await until(() => Array.from({ length: bag(owner).size }, (_, slot) => bag(owner).getItem(slot))
      .filter((item) => item?.nameTag === name).reduce((total, item) => total + item.amount, 0) === 1,
    () => "did not bring back exactly one original toy", 140);
    assert(!loose.isValid && !cargo.getItem(0), "added a duplicate or retained cargo");
  } finally {
    if (loose?.isValid) {
      loose.remove();
    }
    dimension.fillBlocks(new BlockVolume({ x: 7, y: 231, z: 3 }, { x: 15, y: 232, z: 9 }), "minecraft:air");
  }
}

world.afterEvents.worldLoad.subscribe(async () => {
  const failures = [];
  async function check(name, action) {
    try {
      await action();
      console.warn("MUSHROOM_PARITY_OK " + name);
    } catch (error) {
      failures.push(name + ": " + error);
      console.warn("MUSHROOM_PARITY_ASSERTION " + failures.at(-1));
    }
  }

  try {
    const dimension = world.getDimension("overworld");
    await world.tickingAreaManager.createTickingArea("mushroom_parity", {
      dimension, from: { x: 1, y: 230, z: 1 }, to: { x: 16, y: 233, z: 13 },
    });
    dimension.fillBlocks(new BlockVolume({ x: 1, y: 230, z: 1 }, { x: 16, y: 230, z: 13 }), "minecraft:grass_block");
    world.setTimeOfDay(1000);
    const owner = spawnSimulatedPlayer({ dimension, ...origin }, "ParityOwner", GameMode.Survival);
    const guest = spawnSimulatedPlayer({ dimension, ...origin, z: 7.5 }, "ParityGuest", GameMode.Survival);
    const dog = dimension.spawnEntity(NS + "mushroom_yorkie", dogStart, { spawnEvent: "minecraft:entity_spawned" });
    await system.waitTicks(8);
    await use(owner, dog, TREAT);
    await until(() => ownerId(dog) === owner.id, () => "setup could not tame the dog");

    for (const type of ["minecraft:short_grass", "minecraft:tall_grass"]) {
      await check(type, () => fetchGrass(dimension, owner, dog, type));
    }
    for (const example of FOOD_EXAMPLES.filter((test) => !test.leashed)) {
      dog.teleport(dogStart);
      await check(example.id, () => feed(owner, guest, dog, example));
    }

    owner.setGameMode(GameMode.Survival);
    owner.teleport(origin);
    dog.teleport(dogStart);
    await use(owner, dog, NS + "yorkie_harness");
    await until(() => dog.getProperty(NS + "wearing_harness"), () => "setup could not fit the harness");
    await use(owner, dog, "minecraft:lead");
    await until(() => leashHolder(dog) === owner.id, () => "setup could not attach the owner's lead");
    for (const example of FOOD_EXAMPLES.filter((test) => test.leashed)) {
      await check(example.id, () => feed(owner, guest, dog, example));
    }
    assert(!failures.length, failures.join(" | "));
    dog.remove();
    owner.disconnect();
    guest.disconnect();
    console.warn("MUSHROOM_PARITY_PASS");
  } catch (error) {
    console.error("MUSHROOM_TEST_FAIL parity " + (error.stack ?? error));
  }
});
