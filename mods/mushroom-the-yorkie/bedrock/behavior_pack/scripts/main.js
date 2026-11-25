import { world } from "@minecraft/server";
import { startDomesticCare } from "./domestic-care.js";
import { installOwnershipEvents } from "./ownership.js";

installOwnershipEvents();
world.afterEvents.worldLoad.subscribe(startDomesticCare);
