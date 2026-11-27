import { BlockPermutation, BlockVolume, GameMode, system, world } from "@minecraft/server";
import { spawnSimulatedPlayer } from "@minecraft/server-gametest";

const YORKIE = "mushroom_yorkie:mushroom_yorkie";

async function until(test, reason, ticks = 220) {
  for (let i = 0; i < ticks; i += 2) {
    if (test()) return;
    await system.waitTicks(2);
  }
  throw new Error(reason());
}

async function prepare(dimension, x, y, z) {
  const min = { x: x - 5, y: y - 1, z: z - 5 };
  const max = { x: x + 5, y: y + 4, z: z + 5 };
  await world.tickingAreaManager.createTickingArea("expedition_native_" + dimension.id.split(":")[1],
    { dimension, from: min, to: max });
  dimension.fillBlocks(new BlockVolume(min, { ...max, y: y - 1 }), "minecraft:stone");
  dimension.fillBlocks(new BlockVolume({ ...min, y }, max), "minecraft:air");
  dimension.fillBlocks(new BlockVolume({ x: x - 1, y: y - 1, z }, { x: x + 2, y: y + 3, z }), "minecraft:obsidian");
  dimension.fillBlocks(new BlockVolume({ x, y, z }, { x: x + 1, y: y + 2, z }),
    BlockPermutation.resolve("minecraft:portal", { portal_axis: "x" }));
  return { x: x + 0.5, y, z: z + 0.5 };
}

world.afterEvents.worldLoad.subscribe(async () => {
  try {
    world.gameRules.doMobSpawning = false;
    world.setTimeOfDay(1000);
    const home = world.getDimension("overworld");
    const nether = world.getDimension("nether");
    const portal = await prepare(home, 64, 101, 64);
    await prepare(nether, 8, 101, 8);
    const player = spawnSimulatedPlayer({ ...portal, z: portal.z - 3, dimension: home }, "ExpeditionNative", GameMode.Survival);
    const dog = home.spawnEntity(YORKIE, { ...portal, x: portal.x - 2, z: portal.z - 2 });
    await system.waitTicks(5);
    if (!dog.getComponent("minecraft:tameable")?.tame(player)) throw new Error("Could not tame dog");
    const id = dog.id;
    world.afterEvents.playerDimensionChange.subscribe(event => {
      if (event.player.id === player.id) console.warn("MUSHROOM_NATIVE_PORTAL_EVENT " + JSON.stringify(event.toLocation));
    });
    player.moveToLocation(portal);
    await until(() => player.dimension.id === nether.id,
      () => "The simulated player did not use the Nether portal: " + JSON.stringify(player.location));
    player.stopMoving();
    await until(() => world.getEntity(id)?.dimension.id === nether.id,
      () => "Native Nether portal left the dog behind: " + id);
    const dogs = [home, nether].flatMap(dimension => dimension.getEntities({ type: YORKIE }))
      .filter(candidate => candidate.getComponent("minecraft:is_tamed")?.tamedToPlayerId === player.id);
    if (dogs.length !== 1 || dogs[0].id !== id || dogs[0].getComponent("minecraft:health")?.currentValue <= 0) {
      throw new Error("The crossing should retain exactly one living dog with the original owner");
    }
    player.disconnect();
    console.warn("MUSHROOM_EXPEDITION_NATIVE_NETHER_PASS " + id);
  } catch (error) {
    console.warn("MUSHROOM_TEST_FAIL " + String(error) + "\n" + (error.stack ?? ""));
  }
});
