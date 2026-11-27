import { world } from "@minecraft/server";
import { blockAt, centerOf, distanceSquared, hasSafeExpeditionSupport } from "./home-blocks.js";
import { recordedPetOf } from "./ownership.js";
import { YORKIE, storage } from "./yorkie.js";

const MAT = storage("camp_mat");
const ASSIGNED_CAMP = storage("expedition_camp");
const ASSIGN_RADIUS = 12;

function validMat(dimension, location) {
  const block = blockAt(dimension, location);
  return block?.typeId === MAT && !block.isWaterlogged
    && blockAt(dimension, { ...location, y: location.y + 1 })?.isAir
    && hasSafeExpeditionSupport(dimension, location);
}

function livingOwnerDog(dog, owner, center) {
  return dog?.isValid && dog.dimension.id === owner.dimension.id
    && dog.getComponent("minecraft:is_tamed")?.tamedToPlayerId === owner.id
    && dog.getComponent("minecraft:health")?.currentValue > 0
    && distanceSquared(dog.location, center) <= ASSIGN_RADIUS ** 2;
}

function markCamp(owner, mat) {
  const { dimension, location } = mat;
  const center = centerOf(mat);
  const recorded = recordedPetOf(owner);
  const dog = livingOwnerDog(recorded, owner, center) ? recorded
    : dimension.getEntities({ type: YORKIE, location: center, maxDistance: ASSIGN_RADIUS })
      .find(candidate => livingOwnerDog(candidate, owner, center));
  if (!dog) {
    owner.onScreenDisplay.setActionBar({ translate: "mushroom.camp.no_dog" });
  } else if (!validMat(dimension, location)) {
    owner.onScreenDisplay.setActionBar({ translate: "mushroom.camp.unsafe" });
  } else {
    const { x, y, z } = location;
    dog.setDynamicProperty(ASSIGNED_CAMP, JSON.stringify({ dimension: dimension.id, x, y, z }));
    owner.onScreenDisplay.setActionBar({ translate: "mushroom.camp.marked" });
  }
}

export function installExpeditionCamp() {
  world.afterEvents.playerPlaceBlock.subscribe(({ player, block }) => {
    if (block.typeId === MAT) markCamp(player, block);
  });
}
