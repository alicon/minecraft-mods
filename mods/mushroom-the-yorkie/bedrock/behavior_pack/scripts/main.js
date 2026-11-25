import { world } from "@minecraft/server";
import { startDomesticCare } from "./domestic-care.js";
import { installOwnershipEvents, watchNightRest } from "./ownership.js";

installOwnershipEvents();
world.afterEvents.worldLoad.subscribe(startDomesticCare);
world.afterEvents.worldLoad.subscribe(watchNightRest);
