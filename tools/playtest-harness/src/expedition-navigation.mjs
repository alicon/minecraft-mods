const CARDINAL = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const HEADROOM = /:(?:air|cave_air|void_air|short_grass|tall_grass|fern|large_fern|dead_bush|dandelion|poppy|leaf_litter|wildflowers|\w+_button|torch|wall_torch)$/;
const SUPPORT = /:(?:grass_block|dirt|dirt_path|coarse_dirt|podzol|stone|granite|andesite|diorite|deepslate|tuff|(?:deepslate_)?(?:coal|iron|copper)_ore|cobblestone|(?:mossy_|cracked_)?stone_bricks|end_stone|end_stone_bricks|obsidian|bedrock|netherrack|blackstone|basalt|smooth_basalt|soul_soil|soul_sand|crimson_nylium|warped_nylium|nether_bricks|sandstone|terracotta|sand|gravel|snow_block|\w+_leaves|\w+_log|\w+_planks)$/;
const LEAVES = /_leaves$/;
const QUARRY_BLOCK = /^minecraft:(?:grass_block|dirt|coarse_dirt|podzol|stone|andesite|diorite|granite|deepslate|(?:deepslate_)?(?:coal|iron)_ore)$/;
const QUARRY_HAZARD = /^minecraft:(?:water|lava|powder_snow|.*sand|gravel)$/;
const SHELTER_BLOCK = /^minecraft:(?:dirt|grass_block|stone|cobblestone|granite|diorite|andesite|deepslate|end_stone|end_stone_bricks|obsidian|netherrack|blackstone|nether_bricks)$/;
const MAX_WALK_SEGMENT = 10;
const IRON_ORE = /^minecraft:(?:deepslate_)?iron_ore$/;
export const STRONGHOLD_MASONRY = /^minecraft:(?:(?:cracked_|mossy_|chiseled_)?stone_bricks|(?:mossy_)?stone_brick_stairs)$/;
const STRONGHOLD_STEPS = /^minecraft:(?:(?:mossy_)?stone_brick_(?:stairs|slab)|smooth_stone_slab)$/;
const INFESTED_STONE_BRICKS = /^minecraft:infested_(?:(?:mossy_|cracked_|chiseled_)?stone_bricks)$/;

function gap(id) {
  return id === undefined || HEADROOM.test(id);
}

export function hasDrySupport(id) {
  return SUPPORT.test(id ?? '');
}

export function waterExitWaypoint(cells, [x, y, z], ceiling) {
  const blocks = new Map(cells.map(({ x, y, z, b }) => [`${x},${y},${z}`, b]));
  const at = (a, b, c) => blocks.get(`${a},${b},${c}`);
  const water = id => /:(?:water|bubble_column|kelp(?:_plant)?|(?:tall_)?seagrass)$/.test(id ?? '');
  let surface = [y, y - 1, y + 1].find(height => water(at(x, height, z)));
  if (surface === undefined) return null;
  while (surface < ceiling && water(at(x, surface + 1, z))) surface++;
  if (surface + 2 > ceiling || !gap(at(x, surface + 1, z))) return null;

  const visited = new Set([`${x},${z}`]);
  const queue = [{ tile: [x, z], path: [] }];
  for (const { tile: [px, pz], path } of queue) {
    for (const [dx, dz] of CARDINAL) {
      const tx = px + dx;
      const tz = pz + dz;
      const key = `${tx},${tz}`;
      if (visited.has(key)) continue;
      visited.add(key);
      const next = [...path, [tx, tz]];
      const support = at(tx, surface, tz);
      if (hasDrySupport(support) && !/_(?:leaves|log)$/.test(support)
          && gap(at(tx, surface + 1, tz)) && gap(at(tx, surface + 2, tz))) {
        // Recheck the route on the next swim pulse instead of cutting a corner.
        const [firstX, firstZ] = next[0];
        const turn = next.findIndex(([a, b], i) => a !== x + (i + 1) * (firstX - x) || b !== z + (i + 1) * (firstZ - z));
        const [wx, wz] = next[Math.min(3, (turn < 0 ? next.length : turn) - 1)];
        return { surface, waypoint: [wx, wz] };
      }
      if (water(support) && gap(at(tx, surface + 1, tz))) queue.push({ tile: [tx, tz], path: next });
    }
  }
  return { surface, waypoint: null };
}

export function canopyLanding(cells, [x, y, z], health) {
  const blocks = cells.filter(cell => cell.x === x && cell.z === z);
  const support = blocks.find(cell => cell.y === y - 1);
  if (!/_(?:leaves|log)$/.test(support?.b ?? '')) return null;
  const floor = blocks.filter(cell => cell.y < y - 1 && cell.b !== 'minecraft:leaf_litter')
    .sort((first, second) => second.y - first.y)[0];
  if (!floor || !hasDrySupport(floor.b)) return null;
  const landingY = floor.y + 1;
  const drop = y - landingY;
  // A full-health starter can take a short drop when loot is directly
  // below the canopy. Keep the no-fall-damage limit when already hurt.
  return drop <= (health >= 18 ? 4 : 3) ? [x, landingY, z] : null;
}

export function hasPlacedBed(cells, [x, y, z], item) {
  return cells.some(cell => cell.x === x && cell.y === y && cell.z === z && cell.b === item)
    && cells.some(cell => cell.y === y && cell.b === item && Math.abs(cell.x - x) + Math.abs(cell.z - z) === 1);
}

function buildingSpots(cells, player, bed, fitsAir) {
  const blocks = new Map(cells.map(({ x, y, z, b }) => [`${x},${y},${z}`, b]));
  const fits = (x, y, z) => fitsAir(blocks.get(`${x},${y},${z}`))
    && hasDrySupport(blocks.get(`${x},${y - 1},${z}`));
  const fitsBed = (x, y, z) => fits(x, y, z) && fitsAir(blocks.get(`${x},${y + 1},${z}`));
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
        let adjacent = [];
        if (bed) {
          if (!fitsBed(x, y, z) || !fitsBed(...head)) continue;
          // Native placement can use a different body facing from the click.
          // Open, supported ground tolerates more than one orientation.
          adjacent = CARDINAL.map(([ox, oz]) => [x + ox, y, z + oz]).filter(pos => fitsBed(...pos));
        }
        spots.push({ pos: [x, y, z], head, adjacent, score: reach + Math.abs(y - playerY) });
      }
    }
  }
  return spots.sort((a, b) => b.adjacent.length - a.adjacent.length || a.score - b.score);
}

export function nearbyBuildingSpots(cells, player, bed) {
  return buildingSpots(cells, player, bed, id => id === undefined).map(({ pos }) => pos);
}

export function bedSpotsWithGroundCover(cells, player) {
  const cover = new Set(cells.filter(({ b }) => HEADROOM.test(b)).map(({ x, y, z }) => `${x},${y},${z}`));
  return buildingSpots(cells, player, true, gap).flatMap(({ pos, head, adjacent }) => {
    const covered = new Map([pos, head, ...adjacent].flatMap(([x, y, z]) => [[x, y, z], [x, y + 1, z]])
      .filter(point => cover.has(point.join(','))).map(point => [point.join(','), point]));
    return covered.size ? [{ pos, clear: [...covered.values()] }] : [];
  });
}

export function exitObstruction(cells, [x, y, z], destination) {
  const block = new Map(cells.map(cell => [`${cell.x},${cell.y},${cell.z}`, cell.b]));
  const removable = id => LEAVES.test(id) || destination && id === 'minecraft:crafting_table';
  for (const [dx, dz] of CARDINAL) {
    const tx = x + dx;
    const tz = z + dz;
    for (const ty of [y, y + 1, y - 1]) {
      if (!hasDrySupport(block.get(`${tx},${ty - 1},${tz}`))) continue;
      const slots = Array.from({ length: Math.max(y, ty) + 2 - ty }, (_, i) => [tx, ty + i, tz]);
      if (ty > y && !gap(block.get(`${x},${ty + 1},${z}`))) continue;
      const ids = slots.map(pos => block.get(pos.join(',')));
      if (!ids.every(id => gap(id) || removable(id))) continue;
      const obstruction = ids.findIndex(removable);
      if (obstruction < 0) continue;
      if (ids[obstruction] === 'minecraft:crafting_table'
          && distance(destination, [tx, ty, tz]) >= distance(destination, [x, y, z])) continue;
      return slots[obstruction];
    }
  }
  return null;
}

function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

export function nearestCover(cells, start) {
  const blocks = new Map(cells.map(({ x, y, z, b }) => [`${x},${y},${z}`, b]));
  const at = (x, y, z) => blocks.get(`${x},${y},${z}`);
  const solid = (x, y, z) => SHELTER_BLOCK.test(at(x, y, z) ?? '');
  const candidates = [];
  for (const { x, y, z, b } of cells) {
    const feetY = y + 1;
    if (!SHELTER_BLOCK.test(b) || Math.abs(feetY - start[1]) > 2
        || !gap(at(x, feetY, z)) || !gap(at(x, feetY + 1, z)) || !solid(x, feetY + 2, z)) continue;
    const walls = CARDINAL.filter(([dx, dz]) => solid(x + dx, feetY, z + dz) && solid(x + dx, feetY + 1, z + dz));
    if (walls.length < 2 || walls.length === 4) continue;
    const pos = [x, feetY, z];
    candidates.push({ pos, travel: distance(start, pos) + Math.abs(feetY - start[1]) });
  }
  return candidates.sort((a, b) => a.travel - b.travel)[0]?.pos ?? null;
}

function quarryBlock(id, masonry) {
  return QUARRY_BLOCK.test(id ?? '') || (masonry && STRONGHOLD_MASONRY.test(id ?? ''));
}

export function quarryStep(cells, [x, y, z], bed, walked, { toward, rejected, masonry = false } = {}) {
  const blocks = new Map(cells.map(({ x, y, z, b }) => [`${x},${y},${z}`, b]));
  const at = pos => blocks.get(String(pos));
  const candidates = [];
  for (const [dx, dz] of CARDINAL) {
    const tx = x + dx;
    const tz = z + dz;
    if ((bed && Math.max(Math.abs(tx - bed[0]), Math.abs(tz - bed[2])) <= 2)
        || walked.some(([px, , pz]) => px === tx && pz === tz)) continue;
    for (const drop of masonry ? [1, 2, 3] : [1]) {
      const landing = [tx, y - drop, tz];
      if (rejected?.has(String(landing)) || !quarryBlock(at([tx, y - drop - 1, tz]), masonry)) continue;
      // A head-height plant may already leave enough room to move.
      const height = Array.from({ length: drop + 2 }, (_, index) => y + 1 - index);
      const clear = height.map(by => [tx, by, tz]).filter(pos =>
        at(pos) && (!gap(at(pos)) || !masonry && pos[1] !== y + 1));
      if (!clear.every(pos => gap(at(pos)) || quarryBlock(at(pos), masonry))) continue;
      const exposed = [[tx, y + 2, tz], ...CARDINAL.flatMap(([sx, sz]) =>
        height.map(by => [tx + sx, by, tz + sz]))];
      if (exposed.some(pos => QUARRY_HAZARD.test(at(pos) ?? ''))) continue;
      candidates.push({ landing, clear });
      break;
    }
  }
  return candidates.sort((a, b) => (toward ? distance(a.landing, toward) - distance(b.landing, toward) : 0)
    || b.clear.length - a.clear.length || (bed ? distance(b.landing, bed) - distance(a.landing, bed) : 0))[0] ?? null;
}

export function quarryLandingIsClear(cells, [x, y, z], masonry = false) {
  const at = (by) => cells.find(cell => cell.x === x && cell.y === by && cell.z === z)?.b;
  return quarryBlock(at(y - 1), masonry) && gap(at(y)) && gap(at(y + 1))
    && !cells.some(cell => cell.y >= y - 1 && QUARRY_HAZARD.test(cell.b));
}

export function uphillScoutingStep(cells, [x, y, z], toward, rejected = new Set()) {
  const blocks = new Map(cells.map(({ x, y, z, b }) => [`${x},${y},${z}`, b]));
  const at = (a, b, c) => blocks.get(`${a},${b},${c}`);
  if (!gap(at(x, y + 2, z))) return null;
  const candidates = [];
  for (const [dx, dz] of CARDINAL) {
    const tx = x + dx;
    const tz = z + dz;
    const landing = [tx, y + 1, tz];
    if (rejected.has(String(landing)) || !quarryBlock(at(tx, y, tz), false)) continue;
    const clear = [y + 2, y + 1].filter(height => !gap(at(tx, height, tz)));
    if (!clear.length || !clear.every(height => quarryBlock(at(tx, height, tz), false))) continue;
    const exposed = [[0, 0], ...CARDINAL].some(([sx, sz]) =>
      [y, y + 1, y + 2, y + 3].some(height => QUARRY_HAZARD.test(at(tx + sx, height, tz + sz) ?? '')));
    if (exposed) continue;
    candidates.push({ landing, clear: clear.map(height => [tx, height, tz]) });
  }
  return candidates.sort((a, b) => distance(a.landing, toward) - distance(b.landing, toward)
    || a.clear.length - b.clear.length)[0] ?? null;
}

export function missingQuarryExitSupport(cells, [x, y, z]) {
  const blocks = new Map(cells.map(cell => [`${cell.x},${cell.y},${cell.z}`, cell.b]));
  const at = (dx, height, dz) => blocks.get(`${dx},${height},${dz}`);
  const air = block => !block || /:(?:air|cave_air|void_air)$/.test(block);
  if (![y - 1, y, y + 1].every(height => air(at(x, height, z)))) return null;
  const foundation = [y - 2, y - 3].find(height => hasDrySupport(at(x, height, z)));
  if (foundation === undefined || !air(at(x, foundation + 1, z))) return null;
  const stances = CARDINAL.flatMap(([dx, dz]) => [y - 1, y].filter(height =>
    hasDrySupport(at(x + dx, height - 1, z + dz))
      && air(at(x + dx, height, z + dz)) && air(at(x + dx, height + 1, z + dz)))
    .map(height => [x + dx, height, z + dz]));
  if (!stances.length) return null;
  const blocksToPlace = Array.from({ length: y - foundation - 1 }, (_, index) => [x, foundation + 1 + index, z]);
  return { stances, blocksToPlace };
}

export function dryStepKey(from, to) {
  const dx = Math.sign(to[0] - from[0]);
  const dz = Math.sign(to[2] - from[2]);
  return `${from.join(',')}>${from[0] + dx},${from[2] + dz}`;
}

function hasVisibleIron(ores, block, [x, y, z]) {
  const eye = [x + 0.5, y + 1.62, z + 0.5];
  return ores.some(ore => {
    const delta = ore.map((coordinate, axis) => coordinate + 0.5 - eye[axis]);
    const range = Math.hypot(...delta);
    if (range > 4.15) return false;
    const samples = Math.ceil(range * 6);
    for (let step = 1; step < samples; step++) {
      const tile = eye.map((coordinate, axis) => Math.floor(coordinate + delta[axis] * step / samples));
      if (tile.every((coordinate, axis) => coordinate === ore[axis])) return true;
      if (!gap(block(...tile))) return false;
    }
    return true;
  });
}

// Each edge fits a standing player through two adjacent columns, including the lift for a step up.
// Use the native movement controller for the resulting straight segment.
export function dryWaypoint(cells, start, visited, destination, preferredGround, rejectedSteps = new Set(), avoid, exactTargets) {
  const blocks = new Map(cells.map(({ x, y, z, b }) => [`${x},${y},${z}`, b]));
  const block = (x, y, z) => blocks.get(`${x},${y},${z}`);
  const hazards = Array.isArray(avoid?.[0]) ? avoid : avoid ? [avoid] : [];
  const clearance = tile => Math.min(...hazards.map(hazard => distance(hazard, tile)));
  const rock = id => /:(?:stone|andesite|diorite|granite|deepslate|tuff)$/.test(id ?? '');
  const ores = preferredGround === 'iron'
    ? cells.filter(cell => IRON_ORE.test(cell.b)).map(({ x, y, z }) => [x, y, z]) : [];
  const visits = new Map();
  for (const [x, , z] of visited) {
    const key = `${x},${z}`;
    visits.set(key, (visits.get(key) ?? 0) + 1);
  }
  const queue = [{ pos: start, path: [], repeatCost: 0 }];
  const seen = new Set([start.join(',')]);
  const targets = exactTargets && new Set(exactTargets.map(String));
  if (targets?.has(String(start))) return null;
  let best = [];
  let bestScore = -Infinity;
  search: for (const { pos, path, repeatCost } of queue) {
    if (path.length >= (targets ? 48 : 12)) continue;
    const [x, y, z] = pos;
    for (const [dx, dz] of CARDINAL) {
      const tx = x + dx;
      const tz = z + dz;
      for (const ty of [y, y + 1, y - 1]) {
        const step = [tx, ty, tz];
        const key = step.join(',');
        const support = block(tx, ty - 1, tz);
        const supported = hasDrySupport(support) || preferredGround === 'stronghold'
          && (STRONGHOLD_STEPS.test(support ?? '') || INFESTED_STONE_BRICKS.test(support ?? ''));
        if (seen.has(key) || rejectedSteps.has(dryStepKey(pos, step)) || !supported
            || (preferredGround === 'uphill' && ty < y)
            || (['surface', 'elevation', 'uphill', 'cave', 'iron', 'downhill'].includes(preferredGround) && /_(?:leaves|log)$/.test(support))
            || (hazards.length && clearance(step) <= clearance(pos))
            || !gap(block(tx, ty, tz)) || !gap(block(tx, ty + 1, tz))
            || (ty > y && !gap(block(x, ty + 1, z)))
            || (ty < y && !gap(block(tx, y + 1, tz)))) continue;
        seen.add(key);
        const route = [...path, step];
        const routeRepeatCost = repeatCost + Math.min(12, visits.get(`${tx},${tz}`) ?? 0);
        queue.push({ pos: step, path: route, repeatCost: routeRepeatCost });
        if (targets) {
          if (targets.has(key)) {
            best = route;
            break search;
          }
          continue;
        }
        const fresh = Math.min(12, ...visited.map(tile => distance(tile, step)));
        const pasture = preferredGround === 'grass' ? [[0, 0], ...CARDINAL].filter(([ox, oz]) => {
          const px = tx + ox;
          const pz = tz + oz;
          return block(px, ty - 1, pz) === 'minecraft:grass_block'
            && [0, 1, 2, 3].every(dy => gap(block(px, ty + dy, pz)));
        }).length : 0;
        const exposedRock = preferredGround === 'stone' ? [[0, 0], ...CARDINAL].filter(([ox, oz]) => {
          const px = tx + ox;
          const pz = tz + oz;
          return rock(block(px, ty - 1, pz))
            && gap(block(px, ty, pz)) && gap(block(px, ty + 1, pz));
        }).length : 0;
        const cave = ['cave', 'iron'].includes(preferredGround) ? CARDINAL.filter(([ox, oz]) =>
          rock(block(tx + ox, ty, tz + oz)) || rock(block(tx + ox, ty + 1, tz + oz))).length
          + Number(rock(block(tx, ty - 1, tz))) + Number(rock(block(tx, ty + 2, tz))) : 0;
        const masonry = preferredGround === 'stronghold' ? CARDINAL.filter(([ox, oz]) =>
          STRONGHOLD_MASONRY.test(block(tx + ox, ty, tz + oz) ?? ''))
          .length + Number(STRONGHOLD_MASONRY.test(support)) : 0;
        const score = (destination
          ? -2 * distance(destination, step)
            - (preferredGround === 'surface' ? 0 : (['elevation', 'uphill'].includes(preferredGround) ? 5 : 1.25)
              * Math.abs(destination[1] - ty))
            - route.length * 0.25 + fresh * 0.1
          : fresh + 0.3 * distance(start, step) - route.length * 0.12 + pasture * 0.65
            + exposedRock * 0.9 + cave * 1.8 + masonry * 1.4
            + (preferredGround === 'downhill' ? (start[1] - ty) * 2.4 : 0)
            + (hasVisibleIron(ores, block, step) ? 35 : 0)) - routeRepeatCost * 1.5;
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
  return best[Math.min(MAX_WALK_SEGMENT, length) - 1];
}
