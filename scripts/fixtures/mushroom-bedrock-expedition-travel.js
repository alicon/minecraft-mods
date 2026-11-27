import { BlockVolume, Direction, GameMode, ItemStack, system, world } from "@minecraft/server";
import { spawnSimulatedPlayer } from "@minecraft/server-gametest";

const YORKIE = "mushroom_yorkie:mushroom_yorkie";
const ORDERED_SIT = "mushroom_yorkie:ordered_sit";
const HARNESS = "mushroom_yorkie:yorkie_harness";
const leash = dog => dog.getComponent("minecraft:leashable");
const holder = dog => leash(dog)?.leashHolder?.id ?? leash(dog)?.leashHolderEntityId;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const stations = [
  { name: "overworld", location: { x: 8.5, y: 231, z: 8.5 } },
  { name: "nether", location: { x: 8.5, y: 101, z: 8.5 } },
  { name: "the_end", location: { x: 100.5, y: 50, z: 0.5 } },
];

async function waitFor(predicate, message, ticks = 100) {
  for (let i = 0; i < ticks; i += 2) {
    if (predicate()) return;
    await system.waitTicks(2);
  }
  throw new Error(typeof message === "function" ? message() : message);
}

async function prepare({ name, location, key = name }) {
  const dimension = world.getDimension(name);
  const { x, y, z } = location;
  const from = { x: Math.floor(x) - 5, y: y - 1, z: Math.floor(z) - 5 };
  const to = { x: from.x + 10, y: y + 2, z: from.z + 10 };
  await world.tickingAreaManager.createTickingArea("mushroom_expedition_" + key, { dimension, from, to });
  dimension.fillBlocks(new BlockVolume(from, { ...to, y: y - 1 }), "minecraft:stone");
  dimension.fillBlocks(new BlockVolume({ ...from, y }, to), "minecraft:air");
  return { dimension, location };
}

function ownedDogs(player, platforms) {
  return platforms.flatMap(({ dimension }) => dimension.getEntities({ type: YORKIE }).filter(dog =>
    dog.getComponent("minecraft:is_tamed")?.tamedToPlayerId === player.id));
}

async function travel(player, { dimension, location }) {
  // The cross-dimension GameTest teleport in 1.26.66.1 applies the player's
  // eye-height offset. Start slightly above the platform and verify footing.
  player.teleport({ ...location, y: location.y + 2 },
    { dimension, checkForBlocks: true, forceProvidedPositionOnDimensionChange: true });
  await waitFor(() => player.dimension.id === dimension.id,
    "The simulated player did not cross to " + dimension.id);
  const landed = () => player.isOnGround && distance(player.location, location) < 0.5;
  for (let i = 0; i < 15 && !landed(); i++) await system.waitTicks(2);
  // GameTest sometimes leaves the simulated player at the staging height
  // when resetting its position after a crossing. Settle on the fixture's
  // prepared surface without issuing another dimension change.
  if (!landed() && distance(player.location, location) < 3) {
    player.teleport(location, { checkForBlocks: true });
  }
  await waitFor(landed,
    () => "The simulated player did not land at " + dimension.id + ": " + JSON.stringify(player.location));
}

async function use(actor, target, tool) {
  actor.stopInteracting();
  actor.selectedSlotIndex = 0;
  if (tool) actor.setItem(new ItemStack(tool), 0, true);
  else actor.getComponent("minecraft:inventory").container.setItem(0, undefined);
  await system.waitTicks(3);
  actor.interactWithEntity(target);
  await system.waitTicks(1);
  actor.stopInteracting();
}

world.afterEvents.worldLoad.subscribe(async () => {
  try {
    world.gameRules.doMobSpawning = false;
    world.setTimeOfDay(1000);
    const platforms = [];
    for (const station of stations) platforms.push(await prepare(station));
    const [home, nether, end] = platforms;
    const yard = await prepare({ name: "overworld", key: "leash", location: { x: 24.5, y: 231, z: 8.5 } });
    const player = spawnSimulatedPlayer({ ...home.location, dimension: home.dimension }, "ExpeditionOwner", GameMode.Survival);
    const guest = spawnSimulatedPlayer({ ...yard.location, dimension: home.dimension }, "ExpeditionGuest", GameMode.Survival);
    const soil = { x: Math.floor(home.location.x) + 2, y: home.location.y - 1, z: Math.floor(home.location.z) };
    home.dimension.setBlockType(soil, "minecraft:grass_block");
    await system.waitTicks(5);
    player.setItem(new ItemStack("mushroom_yorkie:adoption_tag"), 0, true);
    player.lookAtBlock(soil);
    player.useItemInSlotOnBlock(0, soil, Direction.Up);
    await waitFor(() => ownedDogs(player, platforms).length === 1, "The owner should adopt through grass Use");
    player.stopUsingItem();
    player.stopInteracting();
    const [dog] = ownedDogs(player, platforms);
    const id = dog.id;
    const sameDogIn = ({ dimension }) => {
      const dogs = ownedDogs(player, platforms);
      return dogs.length === 1 && dogs[0].id === id && dogs[0].dimension.id === dimension.id
        && dogs[0].getComponent("minecraft:health")?.currentValue > 0;
    };
    const nearLand = (destination) => {
      const pup = world.getEntity(id);
      return sameDogIn(destination) && Math.hypot(pup.location.x - player.location.x,
        pup.location.y - player.location.y, pup.location.z - player.location.z) <= 4.5;
    };
    console.warn("MUSHROOM_EXPEDITION_TRAVEL_READY " + id);
    for (const destination of [nether, home, end, home]) {
      await travel(player, destination);
      await waitFor(() => nearLand(destination),
        () => {
          const tracked = world.getEntity(id);
          return "The same living owned Yorkie should land near the owner in " + destination.dimension.id
            + ". Tracked: " + JSON.stringify(tracked?.isValid ? [tracked.dimension.id, tracked.location,
              tracked.getComponent("minecraft:health")?.currentValue] : null)
            + ". Observed: " + JSON.stringify(ownedDogs(player, platforms).map(pup => [pup.id, pup.dimension.id]));
        }, 400);
      const pup = world.getEntity(id);
      await waitFor(() => pup.isOnGround, "The Yorkie should settle on the landing surface");
      await system.waitTicks(10);
      if (!nearLand(destination) || pup.getProperty(ORDERED_SIT)) {
        throw new Error("Crossing should retain the living Yorkie and the follow order");
      }
      console.warn("MUSHROOM_EXPEDITION_ARRIVED " + destination.dimension.id + " " + id);
    }
    const pup = world.getEntity(id);
    player.teleport({ ...pup.location, x: pup.location.x - 1.5 });
    player.getComponent("minecraft:inventory").container.setItem(player.selectedSlotIndex, undefined);
    player.interactWithEntity(pup);
    await waitFor(() => pup.getProperty(ORDERED_SIT), "The Yorkie should respond to the empty-hand sit order");
    await travel(player, nether);
    await system.waitTicks(60);
    if (!sameDogIn(home) || !pup.getProperty(ORDERED_SIT)) throw new Error("The seated Yorkie did not stay behind");
    console.warn("MUSHROOM_EXPEDITION_SEATED_STAY");
    await travel(player, home);
    player.teleport({ ...yard.location, z: yard.location.z - 1.5 });
    pup.teleport(yard.location);
    await waitFor(() => distance(pup.location, yard.location) < 3 && distance(player.location, pup.location) < 3,
      () => "The owner and dog should reach the yard: " + JSON.stringify({ player: player.location, dog: pup.location }));
    await use(player, pup);
    await waitFor(() => !pup.getProperty(ORDERED_SIT), "The owner should be able to release the stay");

    const [x, y, z] = [nether.location.x, nether.location.y, nether.location.z].map(Math.floor);
    nether.dimension.fillBlocks(new BlockVolume({ x: x - 5, y: y - 1, z: z - 5 },
      { x: x + 5, y: y - 1, z: z + 5 }), "minecraft:magma");
    nether.dimension.setBlockType({ x, y: y - 1, z }, "minecraft:stone");
    if (pup.getProperty(ORDERED_SIT) || distance(player.location, pup.location) > 5) {
      throw new Error("The Yorkie must be following nearby before the hazard check");
    }
    await travel(player, nether);
    await system.waitTicks(60);
    if (!sameDogIn(home)) {
      const tracked = world.getEntity(id);
      throw new Error("The original Yorkie should stay safe when every arrival spot is hazardous. Saw " + JSON.stringify({
        tracked: tracked?.isValid ? [tracked.id, tracked.dimension.id, tracked.location] : null,
        owned: ownedDogs(player, platforms).map(dog => [dog.id, dog.dimension.id, dog.location]),
      }));
    }
    console.warn("MUSHROOM_EXPEDITION_NO_SAFE_LANDING_STAY");
    await travel(player, yard);
    player.teleport({ ...pup.location, z: pup.location.z - 1.5 });
    if (pup.getProperty(ORDERED_SIT)) await use(player, pup);
    await waitFor(() => !pup.getProperty(ORDERED_SIT), "The Yorkie must be following before the remote End check");
    const remote = await prepare({ name: "the_end", key: "remote_end", location: { x: 208.5, y: 91, z: 208.5 } });
    await travel(player, remote);
    await system.waitTicks(60);
    const remoteDog = world.getEntity(id);
    // Bedrock can move a following pet natively before the script observes
    // the player crossing. In that case it must be alive on the platform.
    if (!sameDogIn(home) && !(sameDogIn(end) && distance(remoteDog.location, end.location) < 4
      && remoteDog.isOnGround)) {
      throw new Error("The original Yorkie should remain safe during remote End travel: " + JSON.stringify(
        remoteDog?.isValid ? [remoteDog.dimension.id, remoteDog.location] : null));
    }
    console.warn("MUSHROOM_EXPEDITION_REMOTE_END_SAFE " + remoteDog.dimension.id);
    await travel(player, yard);
    if (pup.dimension.id === end.dimension.id) {
      await travel(player, end);
      await waitFor(() => nearLand(end), "The owner should be able to rejoin the dog at the End platform");
      await travel(player, yard);
    }
    await waitFor(() => sameDogIn(home), "The lead check needs the original dog at home");
    pup.teleport(yard.location);
    await waitFor(() => distance(pup.location, yard.location) < 3, "The lead check needs the dog at the yard");
    player.teleport({ ...pup.location, z: pup.location.z - 1.5 });
    await use(player, pup, HARNESS);
    await waitFor(() => leash(pup), "The owner should be able to fit a harness");
    guest.teleport({ ...pup.location, x: pup.location.x + 1.5 }, {
      dimension: home.dimension, forceProvidedPositionOnDimensionChange: true,
    });
    await waitFor(() => guest.dimension.id === home.dimension.id && guest.isOnGround
      && Math.hypot(guest.location.x - pup.location.x, guest.location.y - pup.location.y,
        guest.location.z - pup.location.z) < 2.5, "The second simulated player should reach the dog");
    // Stage a lead held by the guest. Native attachment is covered by the
    // daycare fixture. Here the crossing must preserve this exact holder.
    leash(pup).leashTo(guest);
    await waitFor(() => holder(pup) === guest.id, () => "Could not stage the guest's lead: " + JSON.stringify({
      guest: guest.location, guestId: guest.id, dog: pup.location,
      leash: leash(pup)?.isLeashed, holder: holder(pup),
    }));
    await travel(player, end);
    await system.waitTicks(60);
    if (!sameDogIn(home) || holder(pup) !== guest.id) {
      throw new Error("The owner's crossing must preserve the guest's lead and the Yorkie's identity");
    }
    console.warn("MUSHROOM_EXPEDITION_GUEST_LEAD_STAY");
    leash(pup).unleash();
    guest.disconnect();
    player.disconnect();
    console.warn("MUSHROOM_EXPEDITION_TRAVEL_PASS");
  } catch (error) {
    console.warn("MUSHROOM_TEST_FAIL " + String(error) + "\n" + (error.stack ?? ""));
  }
});
