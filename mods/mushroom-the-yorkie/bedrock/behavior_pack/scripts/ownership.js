import { Player, system, world } from "@minecraft/server";
import { YORKIE, storage } from "./yorkie.js";

const PET_ID = storage("owned_yorkie_id");
const DEAD_PREFIX = storage("dead_yorkie_");
const OWNER_PREFIX = storage("owner_of_yorkie_");
const DIMENSIONS = ["overworld", "nether", "the_end"];
const pending = new Map();

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
}

export function installOwnershipEvents() {
  const filter = { entityFilter: { type: YORKIE }, tamingEntityFilter: { type: "minecraft:player" } };

  world.beforeEvents.entityTamed.subscribe((event) => {
    const { entity: pet, tamingEntity: owner } = event;
    if (!(owner instanceof Player)) {
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
