const CARDINAL = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const HEADROOM = /:(?:short_grass|tall_grass|fern|large_fern|dead_bush|dandelion|poppy|leaf_litter|wildflowers)$/;
const SUPPORT = /:(?:grass_block|dirt|coarse_dirt|podzol|stone|sand|gravel|snow_block|\w+_leaves|\w+_log)$/;
const LEAVES = /_leaves$/;

function gap(id) {
  return id === undefined || HEADROOM.test(id);
}

export function hasDrySupport(id) {
  return SUPPORT.test(id ?? '');
}

export function nearbyBuildingSpots(cells, player, bed) {
  const blocks = new Map(cells.map(({ x, y, z, b }) => [`${x},${y},${z}`, b]));
  const fits = (x, y, z) => !blocks.get(`${x},${y},${z}`)
    && hasDrySupport(blocks.get(`${x},${y - 1},${z}`));
  const spots = [];
  const playerX = Math.floor(player.x);
  const playerY = Math.floor(player.y);
  const playerZ = Math.floor(player.z);
  for (const y of [playerY, playerY + 1, playerY - 1]) {
    for (let x = playerX - 3; x <= playerX + 3; x++) {
      for (let z = playerZ - 3; z <= playerZ + 3; z++) {
        const dx = x + 0.5 - player.x;
        const dz = z + 0.5 - player.z;
        const reach = Math.hypot(dx, dz);
        if (reach < 1.1 || reach > 3.6 || !fits(x, y, z)) continue;
        // The native placement tool looks at the supporting block's top face.
        // Vanilla extends the head of the bed away from the player.
        const head = Math.abs(dx) > Math.abs(dz)
          ? [x + Math.sign(dx), y, z] : [x, y, z + Math.sign(dz)];
        if (bed && (!fits(...head) || blocks.get(`${x},${y + 1},${z}`)
          || blocks.get(`${head[0]},${y + 1},${head[2]}`))) continue;
        spots.push({ pos: [x, y, z], score: reach + Math.abs(y - playerY) });
      }
    }
  }
  return spots.sort((a, b) => a.score - b.score).map(({ pos }) => pos);
}

export function leavesBlockingExit(cells, [x, y, z]) {
  const block = new Map(cells.map(cell => [`${cell.x},${cell.y},${cell.z}`, cell.b]));
  for (const [dx, dz] of CARDINAL) {
    const tx = x + dx;
    const tz = z + dz;
    for (const ty of [y, y + 1, y - 1]) {
      if (!hasDrySupport(block.get(`${tx},${ty - 1},${tz}`))) continue;
      const slots = Array.from({ length: Math.max(y, ty) + 2 - ty }, (_, i) => [tx, ty + i, tz]);
      if (ty > y && !gap(block.get(`${x},${ty + 1},${z}`))) continue;
      const ids = slots.map(pos => block.get(pos.join(',')));
      if (!ids.every(id => gap(id) || LEAVES.test(id))) continue;
      const leaf = ids.findIndex(id => LEAVES.test(id));
      if (leaf >= 0) return slots[leaf];
    }
  }
  return null;
}

function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

// Each edge fits a standing player through two adjacent columns, including the lift for a step up.
// Use the native movement controller for the resulting straight segment.
export function dryWaypoint(cells, start, visited, destination) {
  const blocks = new Map(cells.map(({ x, y, z, b }) => [`${x},${y},${z}`, b]));
  const block = (x, y, z) => blocks.get(`${x},${y},${z}`);
  const visits = new Map();
  for (const pos of visited) {
    const key = pos.join(',');
    visits.set(key, (visits.get(key) ?? 0) + 1);
  }
  const queue = [{ pos: start, path: [], repeatCost: 0 }];
  const seen = new Set([start.join(',')]);
  let best = [];
  let bestScore = -Infinity;
  for (const { pos, path, repeatCost } of queue) {
    if (path.length >= 12) continue;
    const [x, y, z] = pos;
    for (const [dx, dz] of CARDINAL) {
      const tx = x + dx;
      const tz = z + dz;
      for (const ty of [y, y + 1, y - 1]) {
        const step = [tx, ty, tz];
        const key = step.join(',');
        if (seen.has(key) || !hasDrySupport(block(tx, ty - 1, tz))
            || !gap(block(tx, ty, tz)) || !gap(block(tx, ty + 1, tz))
            || (ty > y && !gap(block(x, ty + 1, z)))
            || (ty < y && !gap(block(tx, y + 1, tz)))) continue;
        seen.add(key);
        const route = [...path, step];
        const routeRepeatCost = repeatCost + Math.min(12, visits.get(key) ?? 0);
        queue.push({ pos: step, path: route, repeatCost: routeRepeatCost });
        const fresh = Math.min(12, ...visited.map(tile => distance(tile, step)));
        const score = (destination
          ? -2 * distance(destination, step) - route.length * 0.25 + fresh * 0.1
          : fresh + 0.3 * distance(start, step) - route.length * 0.12) - routeRepeatCost * 1.5;
        if (score > bestScore) {
          best = route;
          bestScore = score;
        }
      }
    }
  }
  const [first] = best;
  if (!first) return null;
  const dx = first[0] - start[0];
  const dz = first[2] - start[2];
  const straight = best.findIndex((step, index) =>
    step[0] !== start[0] + (index + 1) * dx || step[2] !== start[2] + (index + 1) * dz);
  const length = straight < 0 ? best.length : straight;
  return best[Math.min(6, length) - 1];
}
