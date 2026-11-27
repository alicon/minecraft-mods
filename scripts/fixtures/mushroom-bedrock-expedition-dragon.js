import { BlockVolume, GameMode, system, world } from "@minecraft/server";
import { spawnSimulatedPlayer } from "@minecraft/server-gametest";

const YORKIE = "mushroom_yorkie:mushroom_yorkie";
const DRAGON = "minecraft:ender_dragon";
const ORIGIN = { x: 34.5, y: 72, z: 0.5 };

world.afterEvents.worldLoad.subscribe(async () => {
  try {
    const over = world.getDimension("overworld");
    const end = world.getDimension("the_end");
    await world.tickingAreaManager.createTickingArea("mushroom_dragon_probe", {
      dimension: end, from: { x: 0, y: 64, z: -8 }, to: { x: 47, y: 78, z: 15 },
    });
    end.fillBlocks(new BlockVolume({ x: 23, y: 71, z: -7 }, { x: 44, y: 71, z: 7 }), "minecraft:end_stone");
    const owner = spawnSimulatedPlayer({ dimension: over, x: 5.5, y: 100, z: 5.5 }, "DragonObserver", GameMode.Survival);
    owner.teleport({ x: 100.5, y: 50, z: 0.5 }, { dimension: end, forceProvidedPositionOnDimensionChange: true });
    for (let tick = 0; tick < 60 && owner.dimension.id !== end.id; tick += 2) await system.waitTicks(2);
    if (owner.dimension.id !== end.id) throw new Error("The probe owner could not enter the vanilla End");
    owner.teleport(ORIGIN);
    const dog = end.spawnEntity(YORKIE, { ...ORIGIN, z: 1.5 });
    await system.waitTicks(5);
    if (!dog.getComponent("minecraft:tameable")?.tame(owner)) throw new Error("The probe dog did not tame");
    owner.addEffect("resistance", 2200, { amplifier: 4, showParticles: false });
    let projectileCount = 0;
    world.afterEvents.projectileHitBlock.subscribe(({ projectile }) => {
      if (projectile.typeId !== "minecraft:dragon_fireball") return;
      projectileCount++;
      console.warn("MUSHROOM_NATIVE_DRAGON_IMPACT " + projectileCount);
    });
    for (let tick = 0; tick < 1800; tick += 5) {
      await system.waitTicks(5);
      if (tick === 100 && !end.getEntities({ type: DRAGON }).length) {
        try {
          end.spawnEntity(DRAGON, { x: 0.5, y: 90, z: 0.5 });
        } catch (error) {
          console.warn("MUSHROOM_NATIVE_DRAGON_SPAWN " + String(error));
        }
      }
      const clouds = end.getEntities({ type: "minecraft:area_effect_cloud", location: ORIGIN, maxDistance: 64 });
      if (tick % 100 === 0) console.warn("MUSHROOM_NATIVE_DRAGON_OBSERVED " + JSON.stringify({
        dragons: end.getEntities({ type: DRAGON }).map(dragon => dragon.location), clouds: clouds.map(cloud => cloud.location),
        owner: owner.location, dog: dog.isValid ? dog.location : null, projectileCount,
      }));
      if (projectileCount > 0 && clouds.length) {
        console.warn("MUSHROOM_EXPEDITION_DRAGON_CLOUD_OBSERVED " + JSON.stringify(clouds.map(cloud => [cloud.id, cloud.location])));
        const cloud = clouds[0].location;
        const y = Math.floor(cloud.y);
        const x = Math.floor(cloud.x);
        const z = Math.floor(cloud.z);
        await world.tickingAreaManager.createTickingArea("mushroom_dragon_cloud_route", {
          dimension: end, from: { x: x - 9, y: y - 1, z: z - 9 }, to: { x: x + 9, y: y + 3, z: z + 9 },
        });
        end.fillBlocks(new BlockVolume({ x: x - 8, y: y - 1, z: z - 8 }, { x: x + 8, y: y - 1, z: z + 8 }), "minecraft:end_stone");
        end.fillBlocks(new BlockVolume({ x: x - 8, y, z: z - 8 }, { x: x + 8, y: y + 2, z: z + 8 }), "minecraft:air");
        owner.teleport({ x: cloud.x - 6.5, y, z: cloud.z });
        dog.teleport({ x: cloud.x + 2.25, y, z: cloud.z });
        const originalId = dog.id;
        for (let elapsed = 0; elapsed < 140; elapsed += 2) {
          await system.waitTicks(2);
          const location = dog.location;
          if (dog.getProperty("mushroom_yorkie:home_goal") === "camp"
            && Math.hypot(location.x - cloud.x, location.z - cloud.z) > 4.05
            && dog.getComponent("minecraft:health")?.currentValue > 0) {
            console.warn("MUSHROOM_EXPEDITION_DRAGON_CLOUD_RETREAT " + JSON.stringify({
              originalId, at: location, from: cloud, health: dog.getComponent("minecraft:health").currentValue,
            }));
            return;
          }
        }
        throw new Error("The real Dragon cloud did not produce a living retreat: " + JSON.stringify({
          cloud, position: dog.location, health: dog.getComponent("minecraft:health")?.currentValue,
        }));
      }
    }
    throw new Error("No vanilla End cloud observed. Dragon fireball impacts: " + projectileCount);
  } catch (error) {
    console.warn("MUSHROOM_TEST_FAIL " + String(error) + "\n" + (error.stack ?? ""));
  }
});
