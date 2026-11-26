import { Direction, GameMode, Player, system, world } from "@minecraft/server";
import { blockAt, distanceSquared, hasDrySupport } from "./home-blocks.js";
import { YORKIE, storage } from "./yorkie.js";

const PET_ID = storage("owned_yorkie_id");
const DEAD_PREFIX = storage("dead_yorkie_");
const OWNER_PREFIX = storage("owner_of_yorkie_");
const LAST_CONTACT = storage("last_owner_contact");
const DIMENSIONS = ["overworld", "nether", "the_end"];
const TICKS_PER_DAY = 24000;
const CONTACT_RADIUS_SQUARED = 32 ** 2;
const SPAWN_EGG = `${YORKIE}_spawn_egg`;
const ADOPTION_EGG = storage("adoption_tag");
const ADOPTION_GROUND = new Set(["minecraft:grass_block", "minecraft:dirt", "minecraft:coarse_dirt"]);
const FACE_OFFSETS = {
  [Direction.Down]: { x: 0, y: -1, z: 0 },
  [Direction.Up]: { x: 0, y: 1, z: 0 },
  [Direction.North]: { x: 0, y: 0, z: -1 },
  [Direction.South]: { x: 0, y: 0, z: 1 },
  [Direction.West]: { x: -1, y: 0, z: 0 },
  [Direction.East]: { x: 1, y: 0, z: 0 },
};
const pending = new Map();
const waking = new Set();
const spawning = new Set();
const spawnOwnerByPet = new Map();

function loadedPetOf(owner) {
  for (const key of DIMENSIONS) {
    const pet = world.getDimension(key).getEntities({ type: YORKIE }).find(
      (entity) => entity.getComponent("minecraft:is_tamed")?.tamedToPlayerId === owner.id,
    );
    if (pet) {
      return pet.id;
    }
  }
  return undefined;
}

function ownedPetId(owner) {
  const saved = owner.getDynamicProperty(PET_ID);
  if (typeof saved === "string" && world.getDynamicProperty(DEAD_PREFIX + saved) !== true) {
    return saved;
  }
  return loadedPetOf(owner);
}

function rememberOwner(owner, pet) {
  const previous = owner.getDynamicProperty(PET_ID);
  if (typeof previous === "string" && world.getDynamicProperty(DEAD_PREFIX + previous) === true) {
    world.setDynamicProperty(DEAD_PREFIX + previous, undefined);
  }
  owner.setDynamicProperty(PET_ID, pet.id);
  world.setDynamicProperty(OWNER_PREFIX + pet.id, owner.id);
  owner.setDynamicProperty(LAST_CONTACT, world.getAbsoluteTime());
}

function landingNear(owner) {
  const position = owner.location;
  const center = { x: Math.floor(position.x) + 0.5, y: Math.floor(position.y), z: Math.floor(position.z) + 0.5 };
  for (const y of [center.y, center.y + 1, center.y - 1]) {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0, 0]]) {
      const spot = { x: center.x + dx, y, z: center.z + dz };
      const block = blockAt(owner.dimension, spot);
      if (block?.isAir && hasDrySupport(owner.dimension, spot)) {
        return spot;
      }
    }
  }
  return undefined;
}

async function afterNightRest(owner) {
  const id = ownedPetId(owner);
  const spot = landingNear(owner);
  if (!spot) {
    return;
  }
  if (id) {
    const pet = world.getEntity(id);
    const lastContact = owner.getDynamicProperty(LAST_CONTACT);
    if (pet?.isValid && !pet.getProperty(storage("ordered_sit")) && typeof lastContact === "number"
      && world.getAbsoluteTime() - lastContact >= TICKS_PER_DAY
      && pet.tryTeleport(spot, { dimension: owner.dimension, checkForBlocks: true })) {
      pet.triggerEvent(storage("home_idle"));
      owner.setDynamicProperty(LAST_CONTACT, world.getAbsoluteTime());
      owner.onScreenDisplay.setActionBar({ translate: "mushroom.owner.recovered" });
    }
    return;
  }

  if (await spawnOwnedPet(owner, spot)) {
    owner.onScreenDisplay.setActionBar({ translate: "mushroom.owner.woke" });
  }
}

async function spawnOwnedPet(owner, spot, canAdopt = () => true) {
  if (spawning.has(owner.id) || pending.has(owner.id) || ownedPetId(owner) || !canAdopt()) {
    return false;
  }
  const { dimension, id } = owner;
  spawning.add(id);
  let pet;
  let adopted = false;
  try {
    pet = dimension.spawnEntity(YORKIE, spot, { spawnEvent: "minecraft:entity_spawned" });
    spawnOwnerByPet.set(pet.id, id);
    await system.waitTicks(2);
    if (owner.isValid && pet.isValid && owner.dimension.id === dimension.id && canAdopt()
      && !ownedPetId(owner) && pet.getComponent("minecraft:tameable")?.tame(owner)) {
      adopted = true;
      if (!pet.getComponent("minecraft:is_tamed")) {
        pet.triggerEvent(storage("on_tame"));
      }
      rememberOwner(owner, pet);
    }
    return adopted;
  } finally {
    spawning.delete(id);
    if (pet) {
      spawnOwnerByPet.delete(pet.id);
      if (!adopted && pet.isValid) {
        pet.remove();
      }
    }
  }
}

function isYorkieEgg(type) {
  return type === SPAWN_EGG || type === ADOPTION_EGG;
}

async function useAdoptionEgg(owner, dimension, spot, slot, egg, mode) {
  if (!owner.isValid || owner.dimension.id !== dimension.id || owner.getGameMode() !== mode) {
    return;
  }
  if (ownedPetId(owner)) {
    owner.onScreenDisplay.setActionBar({ translate: "mushroom.owner.already_adopted" });
    return;
  }
  const inventory = owner.getComponent("minecraft:inventory")?.container;
  const eggIsHeld = () => owner.selectedSlotIndex === slot && owner.getGameMode() === mode
    && inventory?.getItem(slot)?.typeId === egg;
  if (!blockAt(dimension, spot)?.isAir || !await spawnOwnedPet(owner, spot, eggIsHeld)
    || mode === GameMode.Creative) {
    return;
  }
  const stack = inventory?.getItem(slot);
  if (stack?.typeId === egg) {
    if (stack.amount === 1) {
      inventory?.setItem(slot, undefined);
    } else {
      stack.amount--;
      inventory?.setItem(slot, stack);
    }
  }
}

function installEggEvents() {
  world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
    const { block, blockFace, itemStack, player } = event;
    const egg = itemStack?.typeId;
    if (event.cancel || !egg || !isYorkieEgg(egg)) {
      return;
    }
    // Native egg placement spawns an untamed dog with no record of the player.
    event.cancel = true;
    const mode = player.getGameMode();
    if (!event.isFirstEvent || (mode !== GameMode.Creative && mode !== GameMode.Survival)
      || (egg === ADOPTION_EGG && !ADOPTION_GROUND.has(block.typeId))) {
      return;
    }
    const { x, y, z } = block.location;
    const offset = FACE_OFFSETS[blockFace];
    const spot = { x: x + offset.x + 0.5, y: y + offset.y, z: z + offset.z + 0.5 };
    const { dimension } = block;
    const slot = player.selectedSlotIndex;
    system.run(() => useAdoptionEgg(player, dimension, spot, slot, egg, mode)
      .catch((error) => console.warn("Mushroom egg adoption: " + String(error))));
  });
  world.beforeEvents.playerInteractWithEntity.subscribe((event) => {
    // A native spawn egg can otherwise spawn another dog when used on a dog.
    if (event.target.typeId === YORKIE && event.itemStack?.typeId === SPAWN_EGG) {
      event.cancel = true;
    }
  });
}

export function watchNightRest() {
  let previousTime;
  let nightSkipTick = -Infinity;
  let sleepers = new Set();
  system.runInterval(() => {
    const now = world.getAbsoluteTime();
    const tick = system.currentTick;
    if (previousTime !== undefined && now - previousTime > 200
      && previousTime % TICKS_PER_DAY >= 12000 && now % TICKS_PER_DAY < 1000) {
      nightSkipTick = tick;
    }
    const sleepingNow = new Set();
    for (const owner of world.getAllPlayers()) {
      const petId = owner.getDynamicProperty(PET_ID);
      const pet = typeof petId === "string" ? world.getEntity(petId) : undefined;
      const last = owner.getDynamicProperty(LAST_CONTACT);
      if (pet?.isValid && pet.dimension.id === owner.dimension.id
        && (typeof last !== "number" || now - last >= 100)
        && distanceSquared(pet.location, owner.location) <= CONTACT_RADIUS_SQUARED) {
        owner.setDynamicProperty(LAST_CONTACT, now);
      }
      if (owner.dimension.id !== "minecraft:overworld") {
        continue;
      }
      if (owner.isSleeping) {
        sleepingNow.add(owner.id);
      } else if (sleepers.has(owner.id) && tick - nightSkipTick <= 25 && !waking.has(owner.id)) {
        waking.add(owner.id);
        afterNightRest(owner).catch((error) => console.warn("Mushroom wake-up: " + String(error)))
          .finally(() => waking.delete(owner.id));
      }
    }
    sleepers = sleepingNow;
    previousTime = now;
  }, 5);
}

export function installOwnershipEvents() {
  installEggEvents();
  const filter = { entityFilter: { type: YORKIE }, tamingEntityFilter: { type: "minecraft:player" } };

  world.beforeEvents.entityTamed.subscribe((event) => {
    const { entity: pet, tamingEntity: owner } = event;
    if (!(owner instanceof Player)) {
      return;
    }
    const spawnOwner = spawnOwnerByPet.get(pet.id);
    if (spawnOwner && spawnOwner !== owner.id) {
      event.cancel = true;
      return;
    }
    const existing = ownedPetId(owner) ?? pending.get(owner.id);
    if (existing && existing !== pet.id) {
      event.cancel = true;
      system.run(() => {
        if (owner.isValid) {
          owner.onScreenDisplay.setActionBar({ translate: "mushroom.owner.already_adopted" });
        }
      });
      return;
    }
    pending.set(owner.id, pet.id);
    system.runTimeout(() => {
      if (pending.get(owner.id) === pet.id) {
        pending.delete(owner.id);
      }
    }, 2);
  }, filter);

  world.afterEvents.entityTamed.subscribe(({ entity: pet, tamingEntity: owner }) => {
    if (owner instanceof Player) {
      rememberOwner(owner, pet);
      pending.delete(owner.id);
    }
  }, filter);

  world.afterEvents.entityDie.subscribe(({ deadEntity: pet }) => {
    const ownerId = world.getDynamicProperty(OWNER_PREFIX + pet.id);
    if (typeof ownerId !== "string") {
      return;
    }
    world.setDynamicProperty(OWNER_PREFIX + pet.id, undefined);
    const owner = world.getAllPlayers().find((player) => player.id === ownerId);
    if (owner?.getDynamicProperty(PET_ID) === pet.id) {
      owner.setDynamicProperty(PET_ID, undefined);
    } else if (!owner) {
      // The owner may be offline. A death record distinguishes a lost pet from an unloaded pet.
      world.setDynamicProperty(DEAD_PREFIX + pet.id, true);
    }
  }, { entityTypes: [YORKIE] });
}
