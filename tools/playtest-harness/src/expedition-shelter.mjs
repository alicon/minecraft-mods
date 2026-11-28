import { hasDrySupport, hasPlacedBed } from './expedition-navigation.mjs';

const BEDS = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray',
  'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'].map(color => `minecraft:${color}_bed`);
const DOOR = /^minecraft:(?:oak|birch|spruce|jungle|acacia|dark_oak|mangrove|cherry|pale_oak|bamboo)_door$/;
const ROOF = /^minecraft:(?:cobblestone|stone_bricks|sandstone|terracotta|\w+_(?:planks|stairs|slab|log))$/;
const CARDINAL = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const distance = (from, to) => Math.hypot(...from.map((value, axis) => value - to[axis]));
const feet = ({ position: { x, y, z } }) => [x, y, z].map(Math.floor);

export function shelteredBed(cells, bed) {
  const blocks = new Map(cells.map(({ x, y, z, b }) => [`${x},${y},${z}`, b]));
  const at = ([x, y, z], offset = 0) => blocks.get(`${x},${y + offset},${z}`);
  const standing = pos => hasDrySupport(at(pos, -1)) && !at(pos) && !at(pos, 1);
  const covered = pos => [2, 3, 4, 5].some(height => ROOF.test(at(pos, height) ?? ''));
  const item = at(bed);
  if (!BEDS.includes(item) || !hasPlacedBed(cells, bed, item) || !covered(bed) || !hasDrySupport(at(bed, -1))) return;
  for (const { x, y, z, b } of cells) {
    const door = [x, y, z];
    if (!DOOR.test(b) || at(door, 1) !== b || !hasDrySupport(at(door, -1))) continue;
    for (const [dx, dz] of CARDINAL) {
      const inside = [x + dx, y, z + dz];
      if (!standing(inside) || !covered(inside) || distance(inside, bed) > 3) continue;
      const entrance = [0, -1].map(drop => [x - dx, y + drop, z - dz]).find(pos => standing(pos)
        && distance(pos, bed) > distance(inside, bed));
      if (entrance) return { bed, door, entrance, inside };
    }
  }
}

export async function findShelteredBed(action, player, excluded) {
  const scan = await action('scan_blocks', { blocks: BEDS, radius: 32, max: 8 });
  const here = feet(player);
  const beds = scan?.matches.flatMap(match => match.positions).filter(pos => !excluded.has(String(pos))) ?? [];
  for (const bed of beds.sort((a, b) => distance(a, here) - distance(b, here)).slice(0, 4)) {
    const area = await action('get_blocks', { center: bed, size: [11, 13, 11], format: 'json' });
    const site = area && shelteredBed(area.cells, bed);
    if (site) return site;
    excluded.add(String(bed));
  }
}

export async function useShelterDoor(action, door) {
  if (!await action('look', { at: door })) return false;
  const player = await action('observe');
  const hitDoor = observation => {
    const pos = observation?.crosshair?.pos;
    return String(pos) === String(door) || String(pos) === String([door[0], door[1] + 1, door[2]]);
  };
  const use = async () => Boolean((await action('interact_block', { pos: door }))?.success);
  if (hitDoor(player)) return use();
  if (!player?.position) return false;
  // An open door rests against the side of its cell. Aim at each exposed edge.
  for (const [sideX, sideZ] of CARDINAL) {
    const dx = door[0] + 0.5 + sideX * 0.43 - player.position.x;
    const dz = door[2] + 0.5 + sideZ * 0.43 - player.position.z;
    const dy = door[1] + 0.85 - player.position.y - 1.62;
    await action('look', { yaw: Math.atan2(-dx, dz) * 180 / Math.PI,
      pitch: -Math.atan2(dy, Math.hypot(dx, dz)) * 180 / Math.PI });
    if (hitDoor(await action('observe'))) return use();
  }
  return false;
}

export async function enterShelter(action, site) {
  const walkInside = () => action('go_to', { pos: site.inside, stopDistance: 0.3, maxTicks: 24 });
  // An already-open door needs a walk and one click from the inside.
  const open = (await walkInside())?.arrived || (await useShelterDoor(action, site.door) && (await walkInside())?.arrived);
  if (!open) return false;
  return useShelterDoor(action, site.door);
}
