import { world } from "@minecraft/server";
import { blockAt, center } from "./patrol-sites.js";

const SENTENCE_TICKS = 24000;
const BREAKOUT_WAIT_TICKS = 600;

function exitPosition(dimension, { jail, gate, bars }) {
  const inwardX = bars.x - gate.x;
  const inwardZ = bars.z - gate.z;
  // On a kit station, these offsets from the cell are the front step, street, and lobby.
  for (const distance of [9, 10, 6]) {
    const x = jail.x - inwardX * distance;
    const z = jail.z - inwardZ * distance;
    for (const rise of [-1, 0, 1]) {
      const foot = { x, y: jail.y + rise, z };
      const ground = blockAt(dimension, { ...foot, y: foot.y - 1 });
      if (ground && !ground.isAir && !ground.isLiquid && !ground.isWaterlogged
        && dimension.getBlockBelow(ground, { maxDistance: 1 })?.y === ground.y
        && blockAt(dimension, foot)?.isAir && blockAt(dimension, { ...foot, y: foot.y + 1 })?.isAir) {
        return center(foot);
      }
    }
  }
  return undefined;
}

/** Release the loaded prisoner after a sentence or a rare night escape, without damaging the kit. */
export function releasePrisoner(robber, station, elapsed, jailbreaker) {
  const { dimension } = robber;
  const cell = center(station.jail);
  const night = world.getTimeOfDay();
  const escaped = jailbreaker && elapsed > BREAKOUT_WAIT_TICKS && night >= 13000 && night <= 23000;
  if (!escaped && (jailbreaker || elapsed < SENTENCE_TICKS || !dimension.getEntities({
    type: "cops_robbers:cop", location: cell, maxDistance: 12, closest: 1,
  }).length)) {
    return undefined;
  }
  const exit = exitPosition(dimension, station);
  if (!exit || !robber.tryTeleport(exit, { checkForBlocks: true })) {
    return undefined;
  }
  robber.triggerEvent("cops_robbers:on_foot");
  dimension.playSound(escaped ? "note.bell" : "random.door_open", cell, { volume: 0.75 });
  const notice = escaped ? "escaped" : "released";
  for (const player of dimension.getPlayers({ location: cell, maxDistance: 32 })) {
    player.sendMessage({ translate: "cops_robbers.patrol." + notice });
  }
  return notice;
}
