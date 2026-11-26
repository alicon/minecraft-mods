import { BlockVolume, GameMode, ItemStack, system, world } from "@minecraft/server";
import { spawnSimulatedPlayer } from "@minecraft/server-gametest";

const NAMESPACE = "mushroom_yorkie:";
const YORKIE = NAMESPACE + "mushroom_yorkie";
export const TREAT = NAMESPACE + "yorkie_treat";
const HARNESS = NAMESPACE + "yorkie_harness";
const LEAD = "minecraft:lead";
export const FLOOR = 230;
export const pause = (ticks) => system.waitTicks(ticks);
export const ownerOf = (pet) => pet.getComponent("minecraft:is_tamed")?.tamedToPlayerId;
const holderOf = (pet) => pet.getComponent("minecraft:leashable")?.leashHolder?.id;
export const prop = (pet, name) => pet.getProperty(NAMESPACE + name);
export const bag = (player) => player.getComponent("minecraft:inventory").container;

export function check(condition, message) {
  if (!condition) throw new Error(message);
}

export async function until(predicate, message, ticks = 100) {
  for (let elapsed = 0; elapsed < ticks; elapsed += 2) {
    if (predicate()) return;
    await pause(2);
  }
  throw new Error(message);
}

async function interact(actor, pet, item, count = 1, raycast = false) {
  actor.stopInteracting();
  actor.selectedSlotIndex = 0;
  if (item) {
    actor.setItem(new ItemStack(item, count), 0, true);
  } else {
    bag(actor).setItem(0);
  }
  await pause(3);
  if (!raycast) {
    const accepted = actor.interactWithEntity(pet);
    await pause(1);
    actor.stopInteracting();
    return accepted;
  }

  // SimulatedPlayer.interact() uses the head ray, so aim with the GameTest
  // head controller at the center of the Yorkie's 0.46-block collider.
  const originalHolder = holderOf(pet);
  let firstHit;
  let missed = 0;
  for (let tick = 0; tick < 40; tick++) {
    const target = pet.location;
    actor.lookAtLocation({ ...target, y: target.y + 0.23 });
    await pause(1);
    const [hit] = actor.getEntitiesFromViewDirection({ maxDistance: 4 });
    firstHit = hit?.entity;
    if (firstHit?.id !== pet.id) continue;
    const accepted = actor.interact();
    await pause(1);
    actor.stopInteracting();
    if (accepted || holderOf(pet) !== originalHolder || (item && itemCount(actor, item) !== count)) {
      if (missed) console.warn("MUSHROOM_PLAY_INPUT_RETRY " + JSON.stringify({ tick: system.currentTick, missed }));
      return accepted;
    }
    // A rejected simulator input can be retried only when it had no effect.
    // Success is still checked independently through the native lead and inventory.
    ++missed;
  }
  throw new Error("input: could not interact at the crosshair " + JSON.stringify({
    action: item ? "attach" : "release", eye: actor.getHeadLocation(), dog: pet.location,
    direction: actor.getViewDirection(), headRotation: actor.headRotation, velocity: pet.getVelocity(),
    hit: firstHit?.typeId, goal: prop(pet, "home_goal"), rejectedInputs: missed,
  }));
}

export function itemCount(actor, type, label = undefined) {
  const inventory = bag(actor);
  let total = 0;
  for (let slot = 0; slot < inventory.size; ++slot) {
    const stack = inventory.getItem(slot);
    if (stack?.typeId === type && (label === undefined || stack.nameTag === label)) total += stack.amount;
  }
  return total;
}

async function placePair(pair) {
  const { actor, pet, origin } = pair;
  actor.stopMoving();
  if (actor.isFlying) actor.stopFlying();
  actor.setGameMode(GameMode.Survival);
  actor.teleport(origin);
  pet.teleport({ ...origin, x: origin.x + 1.5 });
  pet.clearVelocity();
  bag(actor).clearAll();
  await pause(3);
  if (prop(pet, "ordered_sit")) {
    await interact(actor, pet);
    await until(() => !prop(pet, "ordered_sit"), "owner could not tell a sitting pet to stand");
  }
}

export async function startPair(dimension, x, tag) {
  const origin = { x, y: FLOOR + 1, z: 6.5 };
  const actor = spawnSimulatedPlayer({ dimension, ...origin }, tag, GameMode.Survival);
  const pet = dimension.spawnEntity(YORKIE, { ...origin, x: x + 1.5 }, {
    spawnEvent: "minecraft:entity_spawned",
  });
  await pause(5);
  await interact(actor, pet, TREAT);
  await until(() => ownerOf(pet) === actor.id, "first treat did not tame the newly spawned pet");
  await interact(actor, pet, HARNESS);
  await until(() => prop(pet, "wearing_harness") === true, "owner could not equip the harness");
  return { actor, pet, origin };
}

async function food(pair, creative, injured) {
  const { actor, pet } = pair;
  const health = pet.getComponent("minecraft:health");
  const before = injured ? 14 : health.effectiveMax;
  health.setCurrentValue(before);
  actor.setGameMode(creative ? GameMode.Creative : GameMode.Survival);
  const used = await interact(actor, pet, TREAT, 2);
  const expected = Math.min(before + 3, health.effectiveMax);
  await until(() => health.currentValue === expected && itemCount(actor, TREAT) === (creative ? 2 : 1),
    `treat outcome differed from health ${expected} and ${creative ? 2 : 1} treats left (interaction ${used})`);
  check(!prop(pet, "ordered_sit"), "feeding toggled the sit order");
}

async function leashWalk(pair, walker, guest) {
  const { actor, pet, origin } = pair;
  if (guest) {
    walker.teleport({ ...origin, z: origin.z + 1 });
    bag(walker).clearAll();
  }
  const initialZ = pet.location.z;
  const accepted = await interact(walker, pet, LEAD, 1, true);
  await until(() => holderOf(pet) === walker.id, "player could not attach a lead to the harness").catch((error) => {
    const component = pet.getComponent("minecraft:leashable");
    throw new Error(error.message + " " + JSON.stringify({
      accepted, guest, actor: walker.location, pet: pet.location, mode: walker.getGameMode(),
      harness: prop(pet, "wearing_harness"), leashed: component?.isLeashed, holder: component?.leashHolderEntityId,
      leadCount: itemCount(walker, LEAD), view: walker.getViewDirection(),
    }));
  });
  check(itemCount(walker, LEAD) === 0, "attaching the lead left " + itemCount(walker, LEAD) + " Survival leads");
  const walkStart = walker.location;
  walker.moveToLocation({ ...walkStart, z: walkStart.z + 9 });
  await until(() => walker.location.z >= walkStart.z + 8, "input: walker did not reach the marked path");
  walker.stopMoving();
  await until(() => pet.location.z > initialZ + 0.8, "dog stayed behind while its walker moved away");
  check(holderOf(pet) === walker.id && ownerOf(pet) === actor.id, "lead or owner changed during the walk");
  const dogPosition = pet.location;
  walker.teleport({ x: dogPosition.x, y: origin.y, z: dogPosition.z + 1.8 });
  // Release the actual leash through native entity interaction. The attach
  // above already verifies the first-person ray and checks its native outcome.
  const released = await interact(walker, pet);
  await until(() => !pet.getComponent("minecraft:leashable").isLeashed,
    "player could not detach the lead after the walk").catch((error) => {
    throw new Error(error.message + " " + JSON.stringify({
      released, guest, walker: walker.location, dog: pet.location, holderIsWalker: holderOf(pet) === walker.id,
      selectedSlot: walker.selectedSlotIndex, heldItem: bag(walker).getItem(walker.selectedSlotIndex)?.typeId,
      harness: prop(pet, "wearing_harness"), sit: prop(pet, "ordered_sit"), goal: prop(pet, "home_goal"),
    }));
  });
  check(ownerOf(pet) === actor.id, "the lead changed ownership");
  // A released lead drops at the dog and can otherwise be picked up during a later walk.
  await until(() => {
    const dropped = pet.dimension.getEntities({ type: "minecraft:item", location: pet.location, maxDistance: 4 })
      .find(entity => entity.getComponent("minecraft:item")?.itemStack.typeId === LEAD);
    if (dropped) walker.teleport(dropped.location);
    return itemCount(walker, LEAD) === 1 || (guest && itemCount(actor, LEAD) === 1);
  }, "input: released lead was not recovered by either nearby player");
}

async function fetchToy(pair, chew, label) {
  const { actor, pet } = pair;
  const item = NAMESPACE + (chew ? "yorkie_chew_toy" : "yorkie_ball");
  const stack = new ItemStack(item);
  stack.nameTag = label;
  actor.setItem(stack, 0, true);
  actor.setRotation({ x: 10, y: -90 });
  const used = actor.useItemInSlot(0);
  await until(() => itemCount(actor, item, label) === 0, `toy did not leave hand (interaction ${used})`);
  await until(() => itemCount(actor, item, label) === 1, "the dog did not return one original toy", 220);
  check(!pet.getComponent("minecraft:inventory").container.getItem(0), "toy remained in both inventories");
  const loose = pet.dimension.getEntities({ type: "minecraft:item", location: actor.location, maxDistance: 18 })
    .some((entity) => entity.getComponent("minecraft:item")?.itemStack.nameTag === label);
  check(!loose, "an extra copy of the returned toy remained on the ground");
}

async function flightDuringSleep(pair, far) {
  const { actor, pet, origin } = pair;
  const bed = { x: Math.floor(origin.x) + 2, y: origin.y, z: Math.floor(origin.z) };
  pet.dimension.setBlockType(bed, NAMESPACE + "dog_bed");
  pet.teleport({ x: bed.x + 0.5, y: bed.y + 3 / 16, z: bed.z + 0.5 });
  world.setTimeOfDay(14500);
  try {
    await until(() => prop(pet, "home_goal") === "sleep", "the dog did not settle on the bed");
    const settled = pet.location;
    const facing = pet.getRotation().y;
    actor.setGameMode(GameMode.Creative);
    actor.fly();
    actor.teleport({ ...origin, y: origin.y + (far ? 32 : 11) });
    await until(() => actor.isFlying, "the Creative actor did not enter flight");
    for (let tick = 0; tick < 24; tick += 2) {
      const asleep = prop(pet, "home_goal") === "sleep" && prop(pet, "flight_mode") === "ground"
        && Math.hypot(pet.location.x - settled.x, pet.location.y - settled.y, pet.location.z - settled.z) < 0.05
        && Math.abs(pet.getRotation().y - facing) < 0.1;
      if (!asleep) {
        throw new Error("sleep/flight observation " + JSON.stringify({
          tick: system.currentTick, time: world.getTimeOfDay(), goal: prop(pet, "home_goal"), flight: prop(pet, "flight_mode"),
          start: settled, position: pet.location, velocity: pet.getVelocity(), facing, currentYaw: pet.getRotation().y,
          health: pet.getComponent("minecraft:health").currentValue, owner: actor.location,
          support: pet.dimension.getBlock(pet.location)?.typeId, bed: pet.dimension.getBlock(bed)?.typeId,
          monsters: pet.dimension.getEntities({ families: ["monster"], location: pet.location, maxDistance: 8 }).map(e => e.typeId),
        }));
      }
      await pause(2);
    }
    world.setTimeOfDay(1000);
    actor.teleport({ ...origin, y: origin.y + 11 });
    await until(() => prop(pet, "flight_mode") === "flying", "the dog did not resume flight follow at dawn");
    actor.stopFlying();
    actor.teleport(origin);
    await until(() => prop(pet, "flight_mode") === "ground" && pet.isOnGround, "the dog did not land");
  } finally {
    world.setTimeOfDay(1000);
    pet.dimension.setBlockType(bed, "minecraft:air");
  }
}

export function startAutoplay(seconds, seed, onlyCase) {
  world.afterEvents.worldLoad.subscribe(async () => {
    let randomState = seed >>> 0;
    let active = { case: "setup", phase: "setup" };
    let round = 0;
    const counts = {};
    const random = () => {
      randomState = (Math.imul(1664525, randomState) + 1013904223) >>> 0;
      return randomState / 4294967296;
    };

    try {
      const dimension = world.getDimension("overworld");
      const from = { x: 0, y: FLOOR, z: 0 };
      const to = { x: 48, y: FLOOR + 34, z: 21 };
      await world.tickingAreaManager.createTickingArea("mushroom_autoplay", { dimension, from, to });
      dimension.fillBlocks(new BlockVolume(from, { ...to, y: FLOOR }), "minecraft:stone");
      world.gameRules.doMobSpawning = false;
      world.setTimeOfDay(1000);
      const pairs = [await startPair(dimension, 5.5, "MushroomWalkerA"),
        await startPair(dimension, 26.5, "MushroomWalkerB")];
      const cases = [
        ["survival-feed", (pair, _, variant) => food(pair, false, variant)],
        ["creative-feed", (pair, _, variant) => food(pair, true, variant)],
        ["owner-walk", (pair) => leashWalk(pair, pair.actor, false)],
        ["guest-walk", (pair, other) => leashWalk(pair, other.actor, true)],
        ["fetch", (pair, _, variant) => fetchToy(pair, variant, `Autoplay toy ${seed}-${round}`)],
        ["sleep-flight", (pair, _, variant) => flightDuringSleep(pair, variant)],
      ].filter(([name]) => !onlyCase || name === onlyCase);
      const start = Date.now();
      console.warn("MUSHROOM_PLAY_START " + JSON.stringify({ seed, seconds, tick: system.currentTick }));
      let cycle = [];
      do {
        if (!cycle.length) cycle = [...cases];
        const [name, run] = cycle.splice(Math.floor(random() * cycle.length), 1)[0];
        const index = Math.floor(random() * pairs.length);
        const variant = random() < 0.5;
        const pair = pairs[index];
        const other = pairs[1 - index];
        active = { case: name, phase: "setup", round: ++round, index, variant, tick: system.currentTick };
        console.warn("MUSHROOM_PLAY_ACTION " + JSON.stringify(active));
        await placePair(other);
        await placePair(pair);
        active.phase = "gameplay";
        await run(pair, other, variant);
        for (const { actor, pet } of pairs) {
          check(pet.isValid && ownerOf(pet) === actor.id, "a dog disappeared or changed owners");
          check(!(prop(pet, "ordered_sit") && prop(pet, "flight_mode") === "flying"), "a sitting dog flew");
          check(!(prop(pet, "home_goal") === "sleep" && prop(pet, "flight_mode") !== "ground"), "a sleeping dog left the ground");
        }
        counts[name] = (counts[name] ?? 0) + 1;
        console.warn("MUSHROOM_PLAY_RESULT " + JSON.stringify({ round, case: name, tick: system.currentTick }));
      } while (Date.now() - start < seconds * 1000 || cycle.length);
      console.warn("MUSHROOM_PLAY_PASS " + JSON.stringify({
        seed, rounds: round, elapsedSeconds: (Date.now() - start) / 1000, tick: system.currentTick, counts,
      }));
    } catch (error) {
      const message = error?.message ?? String(error);
      const phase = message.startsWith("input:") ? "input" : active.phase;
      console.error("MUSHROOM_TEST_FAIL " + JSON.stringify({ seed, ...active, phase, error: message }));
    }
  });
}
