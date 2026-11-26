import { BlockVolume, Direction, GameMode, ItemStack, ItemTypes, system, world } from "@minecraft/server";
import { spawnSimulatedPlayer } from "@minecraft/server-gametest";

const YORKIE = "mushroom_yorkie:mushroom_yorkie";
const CREATIVE_EGG = `${YORKIE}_spawn_egg`;
const ADOPTION_EGG = "mushroom_yorkie:adoption_tag";

function useAt(player, floor) {
  player.useItemInSlotOnBlock(player.selectedSlotIndex, floor, Direction.Up);
}

function heldAmount(player) {
  return player.getComponent("minecraft:inventory").container.getItem(player.selectedSlotIndex)?.amount ?? 0;
}

world.afterEvents.worldLoad.subscribe(async () => {
  try {
    const dimension = world.getDimension("overworld");
    // The sleep-adoption fixture leaves beds on its platform at this height.
    const from = { x: 25, y: 230, z: 25 };
    const to = { x: 39, y: 234, z: 39 };
    await world.tickingAreaManager.createTickingArea("mushroom_egg_test", { dimension, from, to });
    dimension.fillBlocks(new BlockVolume({ ...from, y: from.y + 1 }, to), "minecraft:air");
    dimension.fillBlocks(new BlockVolume(from, { ...to, y: from.y }), "minecraft:grass_block");
    const players = [
      { name: "CreativeEgg", mode: GameMode.Creative, egg: CREATIVE_EGG, z: 28, expectedAmount: 1 },
      { name: "SurvivalEgg", mode: GameMode.Survival, egg: ADOPTION_EGG, z: 34, expectedAmount: 0 },
    ].map(({ name, mode, egg, z, expectedAmount }) => {
      if (!ItemTypes.get(egg)) {
        const packItems = ItemTypes.getAll().filter(({ id }) => id.startsWith("mushroom_yorkie:"));
        throw new Error(`Missing item ${egg}. Registered Mushroom items: ${packItems.map(({ id }) => id).join(", ")}`);
      }
      const player = spawnSimulatedPlayer({ dimension, x: 28.5, y: 231, z: z + 0.5 }, name, mode);
      player.setRotation({ x: 40, y: -90 });
      player.setItem(new ItemStack(egg), 0, true);
      return { player, egg, floor: { x: 30, y: 230, z }, expectedAmount };
    });
    await system.waitTicks(5);
    const dogs = () => dimension.getEntities({ type: YORKIE });
    const initialCount = dogs().length;
    for (const { player, floor } of players) {
      useAt(player, floor);
      if (player.getGameMode() === GameMode.Creative) {
        useAt(player, { ...floor, x: floor.x + 1 });
      }
    }
    await system.waitTicks(12);
    if (dogs().length !== initialCount + 2) {
      throw new Error(`Two players should spawn two dogs total, even with repeated Creative input. Spawned ${dogs().length - initialCount}.`);
    }
    const originalDogIds = new Set(dogs().map((pet) => pet.id));
    for (const { player, egg, floor, expectedAmount } of players) {
      if (heldAmount(player) !== expectedAmount) {
        throw new Error(`${player.name} should have ${expectedAmount} egg left after the first use.`);
      }
      player.setItem(new ItemStack(egg), 0, true);
      useAt(player, { ...floor, x: floor.x + 1 });
    }
    await system.waitTicks(8);
    if (dogs().length !== originalDogIds.size || dogs().some((pet) => !originalDogIds.has(pet.id))
      || players.some(({ player }) => heldAmount(player) !== 1)) {
      throw new Error("Using another egg should preserve both dogs and both eggs.");
    }
    for (const { player } of players) {
      const owned = dogs().filter((pet) => pet.getComponent("minecraft:is_tamed")?.tamedToPlayerId === player.id);
      if (owned.length !== 1) {
        throw new Error(`${player.name} should still have one owned dog.`);
      }
    }
    console.warn("MUSHROOM_EGG_PASS");
    for (const { player } of players) {
      player.disconnect();
    }
  } catch (error) {
    console.warn("MUSHROOM_TEST_FAIL " + String(error) + "\n" + (error.stack ?? ""));
  }
});
