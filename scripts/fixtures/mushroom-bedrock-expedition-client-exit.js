import { GameMode, system, world } from "@minecraft/server";

const DOG = "mushroom_yorkie:mushroom_yorkie";
const HEALTH = "minecraft:health";
const OWNER = "qa_end_exit_owner";
const ORIGINAL = "qa_end_exit_original";
const RETURNED = "qa_end_exit_returned";
const HOME = { x: 72, y: 151, z: 72 };
const START = { x: 5.5, y: 65, z: 0.5 };
const END = "minecraft:the_end";
const OVERWORLD = "minecraft:overworld";

async function until(read, failure) {
  for (let tick = 0; tick < 240; tick += 2) {
    const value = read();
    if (value) return value;
    await system.waitTicks(2);
  }
  throw new Error(failure);
}

function verifyDog(player) {
  const id = world.getDynamicProperty(ORIGINAL);
  const dog = typeof id === "string" ? world.getEntity(id) : undefined;
  if (!dog?.isValid || dog.dimension.id !== OVERWORLD || dog.getComponent(HEALTH)?.currentValue <= 0
    || dog.getComponent("minecraft:is_tamed")?.tamedToPlayerId !== player.id) return undefined;
  const living = player.dimension.getEntities({ type: DOG }).filter(candidate => candidate.getComponent(HEALTH)?.currentValue > 0
    && candidate.getComponent("minecraft:is_tamed")?.tamedToPlayerId === player.id);
  return living.length === 1 && dog;
}

async function stage(player) {
  if (world.getDynamicProperty(OWNER) !== undefined) return;
  world.setDynamicProperty(OWNER, player.id);
  const end = world.getDimension("the_end");
  const over = world.getDimension("overworld");
  await system.waitTicks(30);
  world.setDefaultSpawnLocation(HOME);
  player.setSpawnPoint({ ...HOME, dimension: over });
  world.gameRules.doMobSpawning = false;
  player.addEffect("resistance", 1200, { amplifier: 4, showParticles: false });
  player.teleport(START, {
    dimension: end, forceProvidedPositionOnDimensionChange: true, rotation: { x: 15, y: 90 },
  });
  await until(() => player.dimension.id === END, "QA player could not enter the staged End");
  const portal = await until(() => end.getBlock({ x: 2, y: 64, z: 0 }),
    "The native exit chunk did not load near the staged player");
  if (portal.typeId !== "minecraft:end_portal") throw new Error("Native exit block is " + portal.typeId);
  for (const bystander of end.getEntities({ type: "minecraft:enderman" })) bystander.remove();
  player.teleport(START, { facingLocation: { x: 2.5, y: 64.4, z: 0.5 } });
  const dog = end.spawnEntity(DOG, { ...START, x: 6.5, z: 1.5 });
  await system.waitTicks(5);
  if (!dog.getComponent("minecraft:tameable")?.tame(player)) throw new Error("The official client fixture could not adopt a dog");
  dog.nameTag = "Mushroom";
  world.setDynamicProperty(ORIGINAL, dog.id);
  player.sendMessage("EXPEDITION READY. Walk into the portal. Original Mushroom " + dog.id);
}

function reportFailure(player, error) {
  console.warn("MUSHROOM_OFFICIAL_EXIT_FAIL " + String(error));
  if (player.isValid) player.sendMessage("EXPEDITION FAILED. " + String(error));
}

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn || player.getGameMode() !== GameMode.Survival) return;
  if (world.getDynamicProperty(OWNER) === undefined) {
    stage(player).catch(error => reportFailure(player, error));
  } else if (world.getDynamicProperty(OWNER) === player.id && world.getDynamicProperty(RETURNED)) {
    until(() => verifyDog(player), "The original dog or ownership did not survive the reopen")
      .then(dog => player.sendMessage("EXPEDITION REOPEN VERIFIED. Original Mushroom " + dog.id + " HP " + dog.getComponent(HEALTH).currentValue))
      .catch(error => reportFailure(player, error));
  }
});

world.afterEvents.playerDimensionChange.subscribe(({ player, fromDimension, toDimension }) => {
  if (player.id !== world.getDynamicProperty(OWNER) || fromDimension.id !== END || toDimension.id !== OVERWORLD) return;
  until(() => verifyDog(player), "The original living dog did not arrive via the native exit")
    .then(dog => {
      world.setDynamicProperty(RETURNED, true);
      player.sendMessage("EXPEDITION RETURN VERIFIED. Original Mushroom " + dog.id + " HP " + dog.getComponent(HEALTH).currentValue);
    }).catch(error => reportFailure(player, error));
});
