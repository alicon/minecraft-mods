import { EntityDamageCause, GameMode, ItemStack, system, world } from "@minecraft/server";
import { FLIGHT_MODE, YORKIE, storage } from "./yorkie.js";

const STATE = storage("expedition_vest");
const MODEL = storage("vest_kind");
const CRACKED = storage("vest_cracked");
const HARNESS = storage("wearing_harness");
const LEATHER = "minecraft:leather";
const SCUTE = "minecraft:armadillo_scute";
const SHEARS = "minecraft:shears";
const VESTS = {
  padded: { item: storage("padded_vest"), coverage: 0.3, maxWear: 32, repair: 8 },
  plated: { item: storage("plated_vest"), coverage: 0.5, maxWear: 64, repair: 12 },
};
const impactCauses = [
  EntityDamageCause.entityAttack, EntityDamageCause.projectile, EntityDamageCause.fall,
  EntityDamageCause.blockExplosion, EntityDamageCause.entityExplosion,
];
const useEvents = {
  [storage("use_expedition_vest")]: [VESTS.padded.item, VESTS.plated.item],
  [storage("maintain_expedition_vest")]: [LEATHER, SCUTE],
  [storage("unclip_expedition_vest")]: [SHEARS],
};
// Multiple impacts can be dispatched before the script can write to the dog.
// Reserve the wear synchronously, then persist it in the writable callback.
const pendingWear = new Map();

function readVest(dog) {
  const data = dog.getDynamicProperty(STATE);
  if (typeof data !== "string") return undefined;
  const [kind, rawWear] = data.split(":");
  const wear = Number(rawWear);
  return (kind === "padded" || kind === "plated") && Number.isInteger(wear)
    ? { kind, wear: Math.min(VESTS[kind].maxWear, Math.max(0, wear)) } : undefined;
}

function isCracked(vest) {
  return vest.wear * 2 >= VESTS[vest.kind].maxWear;
}

function writeVest(dog, vest) {
  dog.setDynamicProperty(STATE, vest ? vest.kind + ":" + vest.wear : undefined);
  dog.setProperty(MODEL, vest?.kind ?? "none");
  dog.setProperty(CRACKED, vest ? isCracked(vest) : false);
}

function giveVest(dog, player, vest) {
  const item = new ItemStack(VESTS[vest.kind].item);
  const durability = item.getComponent("minecraft:durability");
  // Keep a fully worn vest repairable. The inventory bar still shows it as worn.
  durability.damage = Math.min(durability.maxDurability - 1, vest.wear);
  if (vest.wear === durability.maxDurability) item.setDynamicProperty(STATE, vest.wear);
  const inventory = player?.getComponent("minecraft:inventory")?.container;
  const rest = inventory ? inventory.addItem(item) : item;
  if (rest) dog.dimension.spawnItem(rest, dog.location);
}

function tell(player, key) {
  player?.onScreenDisplay.setActionBar({ translate: "mushroom.vest." + key });
}

function useOnVest(dog, player, type, slot) {
  if (!player.isValid || !dog.isValid || player.dimension.id !== dog.dimension.id
    || dog.getComponent("minecraft:is_tamed")?.tamedToPlayerId !== player.id
    || player.selectedSlotIndex !== slot || player.getGameMode() === GameMode.Spectator) return;
  const inventory = player.getComponent("minecraft:inventory")?.container;
  const item = inventory?.getItem(slot);
  if (item?.typeId !== type) return;
  settleWear(dog, pendingWear.get(dog.id));
  const old = readVest(dog);
  const offered = Object.keys(VESTS).find(kind => VESTS[kind].item === type);
  let vest;
  let result;
  if (offered) {
    if (!dog.getProperty(HARNESS)) return tell(player, "needs_harness");
    if (old) return tell(player, "already_on");
    const durability = item.getComponent("minecraft:durability");
    const savedWear = item.getDynamicProperty(STATE);
    const wear = typeof savedWear === "number" ? savedWear : durability.damage;
    vest = { kind: offered, wear: Math.min(VESTS[offered].maxWear, wear) };
    result = "equipped";
  } else if (!old) {
    return;
  } else if (type === SHEARS) {
    giveVest(dog, player, old);
    writeVest(dog, undefined);
    return tell(player, "removed");
  } else if (type === SCUTE && old.kind === "padded") {
    vest = { ...old, kind: "plated" };
    result = "plated";
  } else if (type === SCUTE || (type === LEATHER && old.kind === "padded")) {
    if (old.wear === 0) return tell(player, "intact");
    vest = { ...old, wear: Math.max(0, old.wear - VESTS[old.kind].repair) };
    result = "repaired";
  } else {
    return;
  }
  writeVest(dog, vest);
  if (player.getGameMode() !== GameMode.Creative) {
    if (item.amount < 2) inventory.setItem(slot);
    else {
      item.amount--;
      inventory.setItem(slot, item);
    }
  }
  dog.dimension.playSound("armor.equip_leather", dog.location, { volume: 0.6 });
  tell(player, result);
}

function settleWear(dog, pending) {
  if (!pending || pendingWear.get(dog.id) !== pending) return;
  pendingWear.delete(dog.id);
  if (!dog.isValid || dog.getComponent("minecraft:health")?.currentValue <= 0) return;
  const current = readVest(dog);
  if (!current) return;
  const updated = { ...current, wear: Math.min(VESTS[current.kind].maxWear, current.wear + pending.wear) };
  writeVest(dog, updated);
  const owner = dog.getComponent("minecraft:is_tamed")?.tamedToPlayer;
  if (updated.wear === VESTS[updated.kind].maxWear && updated.wear !== current.wear) tell(owner, "worn_out");
  else if (!isCracked(current) && isCracked(updated)) tell(owner, "cracked");
}

function protect(event) {
  const dog = event.hurtEntity;
  if (event.cancel || event.damage <= 0 || !dog.getProperty(HARNESS)
    || (event.damageSource.cause === EntityDamageCause.fall && dog.getProperty(FLIGHT_MODE) !== "ground")) return;
  const vest = readVest(dog);
  if (!vest) return;
  const { maxWear, coverage } = VESTS[vest.kind];
  const pending = pendingWear.get(dog.id);
  const absorb = Math.min(event.damage * coverage, maxWear - vest.wear - (pending?.wear ?? 0));
  if (absorb <= 0) return;
  event.damage -= absorb;
  if (pending) {
    pending.wear += Math.ceil(absorb);
    return;
  }
  const reserved = { wear: Math.ceil(absorb) };
  pendingWear.set(dog.id, reserved);
  system.run(() => settleWear(dog, reserved));
}

export function installExpeditionVest() {
  world.afterEvents.dataDrivenEntityTrigger.subscribe(({ entity: dog, eventId }) => {
    const player = dog.getComponent("minecraft:is_tamed")?.tamedToPlayer;
    if (!player?.isValid) return;
    const slot = player.selectedSlotIndex;
    const type = player.getComponent("minecraft:inventory")?.container?.getItem(slot)?.typeId;
    if (useEvents[eventId].includes(type)) useOnVest(dog, player, type, slot);
  }, { entityTypes: [YORKIE], eventTypes: Object.keys(useEvents) });
  world.beforeEvents.entityHurt.subscribe(protect, {
    entityFilter: { type: YORKIE }, allowedDamageCauses: impactCauses,
  });
}
