import { InvalidEntityError, ItemStack, Player, system, world } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import { cueClosestDog, nearbyOwnedDog } from "./woodland-play.js";
import { pawsFor } from "./woodland-training.js";
import { YORKIE, storage } from "./yorkie.js";

const GIFT = storage("field_guide_given");
const GUIDE = storage("field_guide");
const ICONS = "textures/alicon/mushroom_yorkie/guide/";
const PAGES = [
  { title: "Leave it", image: ICONS + "leave_it",
    steps: "While Mushroom chases a squirrel, crouch and Use this guide.\n\nWhen he turns and comes back, Use a Yorkie Treat on him. If he missed the cue, try again in the open." },
  { title: "Try another squirrel", image: ICONS + "treat",
    steps: "Find a different squirrel. Crouch and Use the guide mid-chase.\n\nWhen Mushroom looks up at you and comes close, give him a treat." },
  { title: "Heel on the trail", image: ICONS + "heel",
    steps: "With Mushroom beside you, crouch and Use the guide. Walk past a squirrel on a new trail and keep him close.\n\nCrouch and Use again to let him play." },
  { title: "Leave it memories", image: ICONS + "treat", steps: "" },
];

function memoryText(paws, pup) {
  if (!pup) return "Bring your Mushroom nearby to see his progress.";
  return paws.length ? paws.map((paw, i) =>
    `${i + 1}. ${paw.dimension.replace("minecraft:", "").replaceAll("_", " ")} · ${paw.x}, ${paw.y}, ${paw.z}`).join("\n")
    : "His first paw goes here when he comes back from a chase and gets a treat.";
}

async function readGuide(player) {
  const pup = nearbyOwnedDog(player);
  const paws = pawsFor(pup);
  let page = paws.length;
  while (player.isValid) {
    const { title, image, steps } = PAGES[page];
    const text = page === 3 ? memoryText(paws, pup) : steps;
    const form = new ActionFormData().title(title)
      .body(`Paws earned: ${paws.length} / 3\n\n${text}`)
      .button(page < 3 ? "Next page" : "Done", image);
    if (page > 0) form.button("Previous page");
    const response = await form.show(player);
    if (response.canceled || (page === 3 && response.selection === 0)) return;
    page += response.selection === 0 ? 1 : -1;
  }
}

export function installFieldGuide() {
  system.beforeEvents.startup.subscribe(({ itemComponentRegistry }) => {
    itemComponentRegistry.registerCustomComponent(storage("guide_use"), {
      onUse({ source }) {
        if (source.isSneaking) {
          cueClosestDog(source);
        } else {
          readGuide(source).catch((error) => {
            if (!(error instanceof InvalidEntityError)) console.warn(`Mushroom Field Guide: ${error}`);
          });
        }
      },
    });
  });
  world.afterEvents.entityTamed.subscribe(({ tamingEntity }) => {
    if (!(tamingEntity instanceof Player) || tamingEntity.getDynamicProperty(GIFT) || !tamingEntity.isValid) return;
    const extra = tamingEntity.addItem(new ItemStack(GUIDE));
    if (extra) tamingEntity.dimension.spawnItem(extra, tamingEntity.location);
    tamingEntity.setDynamicProperty(GIFT, true);
    tamingEntity.sendMessage("Hold Mushroom's Field Guide and Use it to read.");
  }, { entityFilter: { type: YORKIE }, tamingEntityFilter: { type: "minecraft:player" } });
}
