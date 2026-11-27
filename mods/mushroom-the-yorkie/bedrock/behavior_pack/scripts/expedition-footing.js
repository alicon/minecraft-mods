import { blockAt, distanceSquared, hasSafeExpeditionSupport } from "./home-blocks.js";

export const CAMP_MAT = "mushroom_yorkie:camp_mat";
const CAMP_RANGE = 24;
const ESCAPE_RANGE = 5;
const SEARCH_LIMIT = 512;
const CLOUD_RADIUS = 4;
const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function dryCampFooting(dimension, location) {
  const block = blockAt(dimension, location);
  return (block?.isAir || (block?.typeId === CAMP_MAT && !block.isWaterlogged))
    && blockAt(dimension, { ...location, y: location.y + 1 })?.isAir
    && hasSafeExpeditionSupport(dimension, location);
}

function inCloud(cloud, point) {
  return Math.abs(cloud.y - point.y) < 2 && Math.hypot(cloud.x - point.x, cloud.z - point.z) <= CLOUD_RADIUS;
}

export function outsideClouds(clouds, point) {
  return !clouds.some(cloud => inCloud(cloud, point));
}

export function canStepTo(dimension, clouds, from, to) {
  return dryCampFooting(dimension, { ...to, y: Math.floor(to.y) })
    && clouds.every(cloud => !inCloud(cloud, to)
      || (inCloud(cloud, from) && distanceSquared(cloud, to) > distanceSquared(cloud, from)));
}

export function findRetreat(dimension, location, camp, clouds) {
  const start = { x: Math.floor(location.x) + 0.5, y: Math.floor(location.y), z: Math.floor(location.z) + 0.5 };
  const safeHere = dryCampFooting(dimension, start) && outsideClouds(clouds, start);
  if (!camp && safeHere) return [];

  const queue = [{ step: start, parent: undefined }];
  const seen = new Set([`${start.x},${start.z}`]);
  let escape;
  for (let i = 0; i < queue.length && i < SEARCH_LIMIT; i++) {
    const node = queue[i];
    const { step } = node;
    if (camp && step.x === camp.x && step.z === camp.z && step.y === camp.y) {
      return routeTo(node);
    }
    if (!escape && !safeHere && distanceSquared(step, start) <= ESCAPE_RANGE ** 2
        && outsideClouds(clouds, step) && dryCampFooting(dimension, step)) {
      escape = node;
      if (!camp) break;
    }
    for (const [dx, dz] of STEPS) {
      const to = { x: step.x + dx, y: step.y, z: step.z + dz };
      const key = `${to.x},${to.z}`;
      const radius = camp ? CAMP_RANGE : ESCAPE_RANGE;
      if (seen.has(key) || distanceSquared(to, start) > radius ** 2 || !canStepTo(dimension, clouds, step, to)) continue;
      seen.add(key);
      queue.push({ step: to, parent: node });
    }
  }
  return escape ? routeTo(escape) : [];
}

function routeTo(node) {
  const steps = [];
  for (let current = node; current?.parent; current = current.parent) steps.push(current.step);
  return steps.reverse();
}
