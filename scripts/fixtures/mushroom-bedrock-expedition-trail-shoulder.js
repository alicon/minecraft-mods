import { BlockVolume, GameMode, system, world } from "@minecraft/server";
import { spawnSimulatedPlayer } from "@minecraft/server-gametest";

const YORKIE = "mushroom_yorkie:mushroom_yorkie";
const HOME = "mushroom_yorkie:home_goal";
const at = (x, z, y = 231) => ({ x: x + 240, y, z: z + 32 });
const START = at(4.5, 8.5);
const EDGE = at(6, 8.5);

async function waitFor(dog, condition, message, ticks) {
  for (let elapsed = 0; elapsed < ticks; elapsed += 2) {
    if (condition()) return;
    await system.waitTicks(2);
  }
  throw new Error(message + ": " + JSON.stringify({
    position: dog.location,
    velocity: dog.getVelocity(),
    home: dog.getProperty(HOME),
  }));
}

world.afterEvents.worldLoad.subscribe(async () => {
  try {
    const dimension = world.getDimension("overworld");
    await world.tickingAreaManager.createTickingArea("expedition_trail_shoulder_fixture", {
      dimension, from: at(1, 1, 228), to: at(15, 15, 237),
    });
    world.gameRules.doMobSpawning = false;
    world.setTimeOfDay(1000);
    const fill = (x1, z1, x2, z2, type = "minecraft:stone") => {
      dimension.fillBlocks(new BlockVolume(at(x1, z1, 230), at(x2, z2, 230)), type);
    };
    fill(1, 3, 5, 13);
    fill(10, 3, 15, 13);
    fill(6, 7, 9, 9, "minecraft:air");
    fill(6, 9, 9, 9);
    const owner = spawnSimulatedPlayer({ dimension, ...START, z: START.z - 2 }, "TrailShoulderOwner", GameMode.Survival);
    const dog = dimension.spawnEntity(YORKIE, START);
    const id = dog.id;
    await system.waitTicks(4);
    if (!dog.getComponent("minecraft:tameable")?.tame(owner)) throw new Error("Fixture dog did not tame");
    dog.teleport(at(5.36, 8.5));
    owner.teleport(START);
    await system.waitTicks(4);
    owner.teleport(at(11.5, 8.5));
    dog.applyImpulse({ x: 0.22, y: 0, z: 0 });
    await waitFor(dog, () => dog.getProperty(HOME) === "trail",
      "Mushroom did not brake before the unsupported trail beside a solid shoulder", 16);
    if (dog.location.x >= EDGE.x || dog.location.y < EDGE.y) {
      throw new Error("Mushroom left the bank beside the shoulder");
    }
    fill(6, 8, 9, 8);
    await waitFor(dog, () => dog.getProperty(HOME) === "idle" && dog.location.x >= at(9.5, 8.5).x,
      "Mushroom did not take the supported trail after the drop was filled", 120);
    if (dog.id !== id || dog.getComponent("minecraft:is_tamed")?.tamedToPlayerId !== owner.id
      || dog.getComponent("minecraft:health")?.currentValue <= 0) {
      throw new Error("The original living dog or owner record changed on the trail");
    }
    console.warn("MUSHROOM_EXPEDITION_TRAIL_SHOULDER_PASS " + id);
  } catch (error) {
    console.warn("MUSHROOM_TEST_FAIL " + String(error) + "\n" + (error.stack ?? ""));
  }
});
