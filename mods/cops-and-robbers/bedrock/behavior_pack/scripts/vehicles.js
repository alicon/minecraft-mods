import { system, world } from "@minecraft/server";

const CONTROL_ITEM = "cops_robbers:vehicle_controls";
const SIGNAL_MODE = "cops_robbers:signal_mode";
const VEHICLE_FAMILY = "cops_robbers_vehicle";
const SIGNAL_LABELS = ["off", "lights", "siren"];
const DIMENSIONS = ["overworld", "nether", "the_end"];

/** Both seats are on the centerline. The driver sits ahead of the entity's origin. */
function isDriver(player, vehicle) {
  const radians = vehicle.getRotation().y * Math.PI / 180;
  const dx = player.location.x - vehicle.location.x;
  const dz = player.location.z - vehicle.location.z;
  return dx * -Math.sin(radians) + dz * Math.cos(radians) > 0.12;
}

world.beforeEvents.itemUse.subscribe((event) => {
  const { source: player, itemStack } = event;
  if (itemStack.typeId !== CONTROL_ITEM || event.cancel) {
    return;
  }
  event.cancel = true;
  system.run(() => {
    if (!player.isValid) {
      return;
    }
    const vehicle = player.getComponent("minecraft:riding")?.entityRidingOn;
    if (!vehicle?.getComponent("minecraft:type_family")?.hasTypeFamily(VEHICLE_FAMILY) || !isDriver(player, vehicle)) {
      player.onScreenDisplay.setActionBar({ translate: "cops_robbers.signals.driver" });
      return;
    }
    const mode = (Number(vehicle.getProperty(SIGNAL_MODE)) + 1) % SIGNAL_LABELS.length;
    vehicle.setProperty(SIGNAL_MODE, mode);
    player.onScreenDisplay.setActionBar({ translate: "cops_robbers.signals." + SIGNAL_LABELS[mode] });
    vehicle.dimension.playSound("random.click", vehicle.location, { volume: 0.6 });
  });
});

system.runInterval(() => {
  const pitch = Math.floor(system.currentTick / 9) % 2 ? 1.8 : 1.12;
  for (const key of DIMENSIONS) {
    const dimension = world.getDimension(key);
    for (const vehicle of dimension.getEntities({ families: [VEHICLE_FAMILY] })) {
      if (vehicle.getProperty(SIGNAL_MODE) === 2 && vehicle.getComponent("minecraft:rideable")?.getRiders().length) {
        dimension.playSound("note.pling", vehicle.location, { pitch, volume: 0.7 });
      }
    }
  }
}, 9);
