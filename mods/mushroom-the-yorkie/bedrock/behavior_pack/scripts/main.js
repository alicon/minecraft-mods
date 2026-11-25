import { world } from "@minecraft/server";
import { startDomesticCare } from "./domestic-care.js";
import { startFetch } from "./fetch.js";
import { installToyEvents } from "./fetch-items.js";
import { installOwnershipEvents, watchNightRest } from "./ownership.js";

installOwnershipEvents();
installToyEvents();
world.afterEvents.worldLoad.subscribe(startDomesticCare);
world.afterEvents.worldLoad.subscribe(watchNightRest);
world.afterEvents.worldLoad.subscribe(startFetch);
