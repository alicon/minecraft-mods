import { BlockVolume, GameMode, ItemStack, system, world } from "@minecraft/server";

const DOG = "mushroom_yorkie:mushroom_yorkie";
const STATE = "qa_expedition_lead";
const FLOOR_Y = 220;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const readState = () => JSON.parse(world.getDynamicProperty(STATE) ?? "{}");
const writeState = state => world.setDynamicProperty(STATE, JSON.stringify(state));
const health = dog => dog.getComponent("minecraft:health")?.currentValue ?? 0;

let running = false;
let loadedCompletedWorld = false;
let reopened = false;
let waitingForDogSince;

function log(marker, state, dog) {
  const line = marker + " " + JSON.stringify({
    owner: state.owner, guest: state.guest, dog: dog.id, health: health(dog),
  });
  console.warn(line);
  world.sendMessage(line);
}

async function prepare(owner, guest) {
  const dimension = world.getDimension("overworld");
  if (owner.dimension.id !== dimension.id || guest.dimension.id !== dimension.id) {
    throw new Error("Both players must join the Overworld in the disposable world");
  }
  const x = Math.floor(owner.location.x);
  const z = Math.floor(owner.location.z);
  const from = { x: x - 5, y: FLOOR_Y, z: z - 3 };
  const to = { x: x + 9, y: FLOOR_Y, z: z + 4 };
  world.gameRules.doMobSpawning = false;
  world.gameRules.doDayLightCycle = false;
  world.setTimeOfDay(1000);
  // Generate the course independently of where the world placed its initial spawn.
  await world.tickingAreaManager.createTickingArea("qa_expedition_lead", {
    dimension, from, to: { ...to, y: FLOOR_Y + 3 },
  });
  dimension.fillBlocks(new BlockVolume(from, to), "minecraft:grass_block");
  const dogAt = { x: x + 0.5, y: FLOOR_Y + 1, z: z + 0.5 };
  const ownerAt = { ...dogAt, x: x - 1.5 };
  const guestAt = { ...dogAt, z: z + 3.5 };
  for (const [player, at] of [[owner, ownerAt], [guest, guestAt]]) {
    player.teleport(at, { dimension, facingLocation: dogAt });
    const inventory = player.getComponent("minecraft:inventory")?.container;
    if (!inventory || inventory.addItem(new ItemStack("minecraft:lead", 2))) {
      throw new Error("Could not provision leads in the test inventory");
    }
  }
  const dog = dimension.spawnEntity(DOG, dogAt);
  await system.waitTicks(5);
  if (!dog.getComponent("minecraft:tameable")?.tame(owner)) throw new Error("Could not tame the fixture dog");
  dog.nameTag = "Mushroom";
  dog.triggerEvent("mushroom_yorkie:equip_harness");
  for (let tick = 0; tick < 30 && !dog.hasComponent("minecraft:leashable"); tick += 2) {
    await system.waitTicks(2);
  }
  if (!dog.hasComponent("minecraft:leashable")) throw new Error("The fixture harness did not enable the native lead");
  world.setDefaultSpawnLocation(ownerAt);
  for (const [player, at] of [[owner, ownerAt], [guest, guestAt]]) {
    player.setSpawnPoint({ ...at, dimension });
  }
  const state = { owner: owner.id, guest: guest.id, dog: dog.id, phase: "owner_lead" };
  writeState(state);
  log("MUSHROOM_LEAD_PAIR_READY", state, dog);
  owner.sendMessage("Hold a lead and use it on Mushroom. Then release the lead so the guest can take it.");
  guest.sendMessage("After the owner releases Mushroom, attach your lead and walk him along the platform.");
}

async function observePair() {
  const players = world.getAllPlayers();
  if (players.length !== 2 || players.some(player => player.getGameMode() !== GameMode.Survival)) return;
  const state = readState();
  if (!state.phase) {
    const owner = players.find(player => player.id === state.owner) ?? players[0];
    await prepare(owner, players.find(player => player.id !== owner.id));
    return;
  }
  const owner = players.find(player => player.id === state.owner);
  const guest = players.find(player => player.id === state.guest);
  if (!owner || !guest) return;
  const dog = world.getEntity(state.dog);
  if (!dog?.isValid) {
    waitingForDogSince ??= system.currentTick;
    if (system.currentTick - waitingForDogSince > 240) throw new Error("Original Mushroom did not load");
    return;
  }
  waitingForDogSince = undefined;
  if (health(dog) <= 0 || dog.getComponent("minecraft:is_tamed")?.tamedToPlayerId !== owner.id) {
    throw new Error("Mushroom died or ownership changed");
  }
  const ownedDogs = dog.dimension.getEntities({ type: DOG })
    .filter(candidate => health(candidate) > 0 && candidate.getComponent("minecraft:is_tamed")?.tamedToPlayerId === owner.id);
  if (ownedDogs.length !== 1 || ownedDogs[0].id !== state.dog) {
    throw new Error("Expected exactly one living dog with the recorded identity and owner");
  }
  const lead = dog.getComponent("minecraft:leashable");
  if (!lead) throw new Error("The harnessed dog lost its native lead component");
  const holder = lead.leashHolder?.id ?? lead.leashHolderEntityId;
  const previousPhase = state.phase;
  switch (state.phase) {
    case "owner_lead":
      if (holder === owner.id) state.phase = "owner_release";
      break;
    case "owner_release":
      if (!lead.isLeashed) state.phase = "guest_lead";
      break;
    case "guest_lead":
      if (holder === guest.id) {
        state.guestLeadStart = dog.location;
        state.phase = "guest_walk";
      }
      break;
    case "guest_walk":
      if (holder !== guest.id) throw new Error("Mushroom lost the guest's lead during the walk");
      if (distance(dog.location, state.guestLeadStart) >= 3) {
        state.phase = "guest_release";
        guest.sendMessage("Mushroom walked with you. Release the lead to finish the handoff.");
      }
      break;
    case "guest_release":
      if (!lead.isLeashed) {
        state.phase = "complete";
        log("MUSHROOM_LEAD_HANDOFF_VERIFIED", state, dog);
        owner.sendMessage("Save and reopen this world. Both players should join again to verify the original dog.");
      }
      break;
    case "complete":
      if (loadedCompletedWorld && !reopened) {
        reopened = true;
        log("MUSHROOM_LEAD_REOPEN_VERIFIED", state, dog);
      }
      return;
  }
  if (state.phase !== previousPhase) writeState(state);
}

world.afterEvents.worldLoad.subscribe(() => {
  loadedCompletedWorld = readState().phase === "complete";
  console.warn("MUSHROOM_LEAD_CLIENT_WORLD_READY");
  const interval = system.runInterval(async () => {
    if (running) return;
    running = true;
    try {
      await observePair();
    } catch (error) {
      system.clearRun(interval);
      const message = "MUSHROOM_LEAD_TEST_FAIL " + String(error);
      console.warn(message);
      world.sendMessage(message);
    } finally {
      running = false;
    }
  }, 4);
});

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (initialSpawn && player.getGameMode() === GameMode.Survival && !readState().owner) {
    writeState({ owner: player.id });
    player.sendMessage("Waiting for a second Survival player in this disposable lead test.");
  }
});
