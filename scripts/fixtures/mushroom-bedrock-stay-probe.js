import { BlockPermutation, BlockVolume, GameMode, system, world } from "@minecraft/server";
import { spawnSimulatedPlayer } from "@minecraft/server-gametest";

const YORKIE = "mushroom_yorkie:mushroom_yorkie";
const SITTING = "mushroom_yorkie:ordered_sit";
const WALKING = "mushroom_yorkie:walking_after_stay";

function expect(condition, failure) {
  if (!condition) {
    throw new Error(failure);
  }
}

world.afterEvents.worldLoad.subscribe(async () => {
  try {
    const dimension = world.getDimension("overworld");
    const from = { x: 25, y: 230, z: 5 };
    const to = { x: 79, y: 236, z: 15 };
    await world.tickingAreaManager.createTickingArea("mushroom_stay_test", { dimension, from, to });
    const fill = (x1, y1, z1, x2, y2, z2, type) =>
      dimension.fillBlocks(new BlockVolume({ x: x1, y: y1, z: z1 }, { x: x2, y: y2, z: z2 }), type);
    fill(25, 231, 5, 79, 236, 15, "minecraft:air");
    fill(25, 230, 5, 79, 230, 15, "minecraft:grass_block");
    fill(29, 231, 8, 38, 233, 12, "minecraft:stone");
    fill(30, 231, 9, 37, 232, 11, "minecraft:air");
    const setDoor = (open) => {
      for (const upper of [false, true]) {
        dimension.getBlock({ x: 38, y: upper ? 232 : 231, z: 10 }).setPermutation(
          BlockPermutation.resolve("minecraft:wooden_door", { direction: 0, open_bit: open, upper_block_bit: upper }),
        );
      }
    };
    setDoor(false);
    world.setTimeOfDay(1000);
    const start = { x: 35.5, y: 231, z: 10.5 };
    const owner = spawnSimulatedPlayer({ dimension, x: 34, y: 231, z: 10.5 }, "MushroomDaycareOwner", GameMode.Survival);
    const pet = dimension.spawnEntity(YORKIE, start, { spawnEvent: "minecraft:entity_spawned" });
    const moveOwner = (x, y = 231) => owner.teleport({ x, y, z: 10.5 });
    const stays = (why) => expect(pet.getProperty(SITTING) && pet.location.x < 38 && !pet.getProperty(WALKING), why);
    await system.waitTicks(5);
    expect(pet.getComponent("minecraft:tameable").tame(owner), "Taming failed");
    await system.waitTicks(5);
    owner.interactWithEntity(pet);
    await system.waitTicks(6);
    expect(pet.getProperty(SITTING), "Initial native sit did not register");
    moveOwner(70.5);
    await system.waitTicks(55);
    stays("Pet stopped sitting with the daycare door closed");
    setDoor(true);
    moveOwner(64.5);
    await system.waitTicks(55);
    stays("Pet stopped sitting when the owner was within 32 blocks");
    pet.triggerEvent("mushroom_yorkie:equip_harness");
    await system.waitTicks(2);
    const holder = dimension.spawnEntity("minecraft:armor_stand", { ...start, x: 34.5 });
    pet.getComponent("minecraft:leashable").leashTo(holder);
    expect(pet.getComponent("minecraft:leashable").isLeashed, "Test could not attach a leash");
    moveOwner(70.5);
    await system.waitTicks(55);
    stays("Leashed pet stopped sitting");
    pet.getComponent("minecraft:leashable").unleash();
    holder.remove();
    await system.waitTicks(2);
    let previous = pet.location;
    let crossedExit = false;
    for (let ticks = 0; ticks < 800; ticks++) {
      await system.waitTicks(1);
      const position = pet.location;
      expect(Math.hypot(position.x - previous.x, position.y - previous.y, position.z - previous.z) < 2,
        "The Yorkie teleported while leaving the daycare");
      const tamed = pet.getComponent("minecraft:is_tamed");
      expect(!tamed || tamed.tamedToPlayerId === owner.id, "The original owner was lost");
      previous = position;
      crossedExit ||= position.x > 38.5;
      if (ticks % 80 === 0) {
        console.warn(`MUSHROOM_STAY_POSITION ${ticks} ${JSON.stringify(position)} ${pet.getProperty(WALKING)}`);
      }
      if (crossedExit && position.x > 67 && !pet.getProperty(WALKING)) {
        break;
      }
    }
    expect(crossedExit && pet.location.x > 67 && !pet.getProperty(SITTING) && !pet.getProperty(WALKING),
      `Pet did not walk out and catch up. Current state ${JSON.stringify(pet.location)} sitting=${pet.getProperty(SITTING)} walking=${pet.getProperty(WALKING)}`);
    expect(pet.getComponent("minecraft:is_tamed")?.tamedToPlayerId === owner.id, "The original owner was lost");
    owner.teleport({ ...pet.location, x: pet.location.x + 1.5 });
    await system.waitTicks(4);
    owner.interactWithEntity(pet);
    await system.waitTicks(6);
    expect(pet.getProperty(SITTING), "Owner could not use the native sit interaction again");
    console.warn("MUSHROOM_STAY_WALK_PASS");
    owner.disconnect();
  } catch (error) {
    console.warn("MUSHROOM_TEST_FAIL " + String(error) + "\n" + (error.stack ?? ""));
  }
});
