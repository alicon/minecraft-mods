import { system, world } from "@minecraft/server";
import { nudgeToward } from "./fetch-ground.js";
import { distanceSquared } from "./home-blocks.js";
import { storage } from "./yorkie.js";

const PAWS = storage("leave_it_paws");
export const CUE = storage("woodland_cue");
const RETURN_TICKS = 200;
const HEEL_TICKS = 1200;
const RECALL_REACH = 2;
const HEEL_REACH = 4;

export function pawsFor(pup) {
  const encoded = pup?.getDynamicProperty(PAWS);
  if (typeof encoded !== "string") return [];
  try {
    const paws = JSON.parse(encoded);
    return Array.isArray(paws) ? paws.slice(0, 3) : [];
  } catch {
    return [];
  }
}

function say(owner, text) {
  owner.onScreenDisplay.setActionBar(text);
}

function stamp(pup, squirrel) {
  const { x, y, z } = pup.location;
  return { squirrel: squirrel.id, dimension: pup.dimension.id, x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) };
}

function earn(pup, owner, paw) {
  const paws = [...pawsFor(pup), paw];
  pup.setDynamicProperty(PAWS, JSON.stringify(paws));
  say(owner, paws.length === 3 ? "Three paws! Mushroom is free to play." : `Paw ${paws.length} earned! Check the Field Guide.`);
}

export function clearTraining(state) {
  const { pup } = state;
  if (state.training || pup.getProperty(CUE) !== "none") {
    pup.triggerEvent(storage("woodland_cue_none"));
  }
  state.training = undefined;
}

export function issueCue(state, owner, target, canSee, stopChase) {
  const { pup, training } = state;
  const now = system.currentTick;
  const paws = pawsFor(pup);
  if (training?.mode === "heel") {
    if (training.walked && paws.length === 2) earn(pup, owner, training.paw);
    else say(owner, "Mushroom is free to play.");
    clearTraining(state);
    state.retryAt = now + 8;
    return;
  }
  if (training) {
    say(owner, training.mode === "reward" ? "He's back! Give him a Yorkie Treat." : "Give him a moment to come back.");
    return;
  }
  if (target?.isValid && canSee(owner, target) && canSee(pup, target)) {
    const paw = stamp(pup, target);
    stopChase();
    state.training = { mode: "recall", until: now + RETURN_TICKS, paw };
    pup.triggerEvent(storage("woodland_cue_recall"));
    say(owner, "Mushroom heard you. Wait for him to come back.");
  } else if (paws.length >= 2 && !target && distanceSquared(pup.location, owner.location) <= RECALL_REACH ** 2) {
    state.training = { mode: "heel", until: now + HEEL_TICKS, previous: owner.location };
    pup.triggerEvent(storage("woodland_cue_heel"));
    say(owner, "He's ready to heel. Walk past a squirrel on a new trail.");
  } else {
    say(owner, paws.length >= 2 ? "Stand beside Mushroom before asking him to heel." : "Try mid-chase with a squirrel you can see.");
  }
}

export function updateTraining(state, owner, now, nearbySquirrels, canSee) {
  const { pup, training } = state;
  const distance = distanceSquared(pup.location, owner.location);
  if (now >= training.until || distance > 16 ** 2) {
    say(owner, training.mode === "heel" ? "Mushroom is free to play." : "Mushroom missed that one. Try again in the open.");
    clearTraining(state);
    return;
  }
  if (training.mode === "recall") {
    if (distance <= RECALL_REACH ** 2 && canSee(pup, owner)) {
      training.mode = "reward";
      training.until = now + RETURN_TICKS;
      pup.triggerEvent(storage("woodland_cue_reward"));
      say(owner, "He's back! Give him a Yorkie Treat.");
    } else {
      nudgeToward(pup, owner.location, false);
    }
  } else if (training.mode === "heel") {
    if (distance > 1.8 ** 2) nudgeToward(pup, owner.location, false);
    const continuous = distance <= HEEL_REACH ** 2 && pup.isOnGround && owner.isOnGround
      && distanceSquared(training.previous, owner.location) < 3 ** 2;
    training.previous = owner.location;
    if (training.walked || pawsFor(pup).length !== 2) return;
    if (!continuous) {
      training.paw = undefined;
    } else if (training.paw) {
      if (distanceSquared(training.start, owner.location) >= 4 ** 2) {
        training.walked = true;
        say(owner, "He stayed close! Crouch and Use the guide to let him play.");
      }
    } else {
      const paws = pawsFor(pup);
      const next = nearbySquirrels().find((squirrel) => canSee(pup, squirrel) && canSee(owner, squirrel));
      if (!next) return;
      const paw = stamp(pup, next);
      if (paws.some((practice) => practice.dimension === paw.dimension && distanceSquared(practice, paw) < 4 ** 2)) return;
      training.paw = paw;
      training.start = owner.location;
    }
  }
}

export function listenForTrainingRewards(pursuits) {
  world.afterEvents.dataDrivenEntityTrigger.subscribe(({ entity: pup }) => {
    // The native feeding interaction checks the owner and consumes the treat.
    pup.triggerEvent(storage("feed_3"));
    const state = pursuits.get(pup.id);
    const owner = pup.getComponent("minecraft:is_tamed")?.tamedToPlayer;
    if (state?.training?.mode !== "reward" || system.currentTick >= state.training.until || !owner?.isValid) return;
    const paws = pawsFor(pup);
    if (paws.length < 2 && !paws.some((paw) => paw.squirrel === state.training.paw.squirrel)) {
      earn(pup, owner, state.training.paw);
    } else {
      say(owner, paws.length < 2 ? "Nice recall. Try a different squirrel for your next paw." : "Try heeling before the next chase.");
    }
    clearTraining(state);
    state.retryAt = system.currentTick + 12;
  }, { entityTypes: [storage("mushroom_yorkie")], eventTypes: [storage("training_treat")] });
}
