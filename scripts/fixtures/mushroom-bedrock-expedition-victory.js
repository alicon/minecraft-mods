import { BlockVolume, GameMode, ItemStack, system, world } from "@minecraft/server";
import { spawnSimulatedPlayer } from "@minecraft/server-gametest";

const DRAGON = "minecraft:ender_dragon";
const YORKIE = "mushroom_yorkie:mushroom_yorkie";
const HEALTH = "minecraft:health";
const HOME = { x: 72.5, y: 151, z: 72.5 };
const ARENA = { x: 32.5, y: 72, z: 0.5 };

async function until(expected, message, ticks = 100) {
  for (let elapsed = 0; elapsed < ticks; elapsed += 2) {
    const result = expected();
    if (result) return result;
    await system.waitTicks(2);
  }
  throw new Error(typeof message === "function" ? message() : message);
}

function portalBlocks(end) {
  const fountain = new BlockVolume({ x: -4, y: 42, z: -4 }, { x: 4, y: 100, z: 4 });
  return Array.from(end.getBlocks(fountain, { includeTypes: ["minecraft:end_portal"] }, true)
    .getBlockLocationIterator());
}

async function stageWorld() {
  const overworld = world.getDimension("overworld");
  const end = world.getDimension("the_end");
  const homeMin = { x: 66, y: 150, z: 66 };
  const homeMax = { x: 78, y: 155, z: 78 };
  await world.tickingAreaManager.createTickingArea("mushroom_victory_home", {
    dimension: overworld, from: homeMin, to: homeMax,
  });
  overworld.fillBlocks(new BlockVolume(homeMin, { ...homeMax, y: homeMin.y }), "minecraft:stone");
  await world.tickingAreaManager.createTickingArea("mushroom_victory_end", {
    dimension: end, from: { x: -12, y: 42, z: -12 }, to: { x: 45, y: 100, z: 12 },
  });
  end.fillBlocks(new BlockVolume({ x: 24, y: 71, z: -7 }, { x: 40, y: 71, z: 7 }), "minecraft:end_stone");
  const owner = spawnSimulatedPlayer({ ...HOME, dimension: overworld }, "ExpeditionVictor", GameMode.Survival);
  owner.setSpawnPoint({ x: 72, y: 151, z: 72, dimension: overworld });
  owner.teleport({ x: 100.5, y: 50, z: 0.5 }, { dimension: end, forceProvidedPositionOnDimensionChange: true });
  await until(() => owner.dimension.id === end.id, "The staged owner did not enter the End");
  owner.teleport(ARENA);
  const dog = end.spawnEntity(YORKIE, { ...ARENA, z: 2.5 });
  await system.waitTicks(5);
  if (!dog.getComponent("minecraft:tameable")?.tame(owner)) throw new Error("The staged Yorkie did not tame");
  return { end, owner, dog };
}

async function finishDragon({ end, owner, dog }) {
  const dragon = await until(() => end.getEntities({ type: DRAGON })[0], "The native End fight did not start", 500);
  if (portalBlocks(end).length) throw new Error("The native exit portal was already open before the fight");
  const health = dragon.getComponent(HEALTH);
  if (!health || health.currentValue <= 0) throw new Error("The native Dragon was already dead");
  const dragonId = dragon.id;
  let lastDamage;
  world.afterEvents.entityHurt.subscribe(event => {
    if (event.hurtEntity.id === dragonId) lastDamage = {
      amount: event.damage, attacker: event.damageSource.damagingEntity?.id, cause: event.damageSource.cause,
    };
  });
  owner.setItem(new ItemStack("minecraft:diamond_sword"), 0, true);
  owner.addEffect("resistance", 1700, { amplifier: 4, showParticles: false });
  for (let elapsed = 0; elapsed < 750; elapsed += 10) {
    if (!dragon.isValid || health.currentValue <= 0) break;
    for (const crystal of end.getEntities({ type: "minecraft:ender_crystal" })) crystal.remove();
    if (health.currentValue > 2) health.setCurrentValue(2);
    const result = owner.attackEntity(dragon);
    if (elapsed % 50 === 0) console.warn("MUSHROOM_EXPEDITION_VICTORY_INPUT " + JSON.stringify({
      result, health: health.currentValue, lastDamage, dragon: dragon.location,
    }));
    await system.waitTicks(10);
  }
  if (!lastDamage || lastDamage.attacker !== owner.id || lastDamage.amount <= 0) {
    throw new Error("The final simulated attack did not damage the native Dragon: " + JSON.stringify({ lastDamage }));
  }
  const active = await until(() => {
    const blocks = portalBlocks(end);
    return blocks.length && blocks;
  }, "The native Dragon fight did not open the End exit portal", 440);
  const dogHealth = dog.isValid ? dog.getComponent(HEALTH)?.currentValue : 0;
  if (!(dogHealth > 0) || dog.dimension.id !== end.id
      || dog.getComponent("minecraft:is_tamed")?.tamedToPlayerId !== owner.id) {
    throw new Error("The original Yorkie was lost before the exit opened");
  }
  console.warn("MUSHROOM_EXPEDITION_NATIVE_DRAGON_VICTORY " + JSON.stringify({
    dragonId, player: owner.id, lastDamage, portalBlocks: active.length, dog: dog.id, dogHealth,
  }));
}

world.afterEvents.worldLoad.subscribe(async () => {
  try {
    const fixture = await stageWorld();
    await finishDragon(fixture);
    fixture.owner.disconnect();
  } catch (error) {
    console.warn("MUSHROOM_TEST_FAIL " + String(error) + "\n" + (error.stack ?? ""));
  }
});
