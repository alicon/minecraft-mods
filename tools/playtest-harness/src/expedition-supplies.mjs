import assert from 'node:assert/strict';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { adoptAtNight } from './expedition-home.mjs';
import { hasDrySupport } from './expedition-navigation.mjs';

const configFile = new URL(
  '../../../mods/mushroom-the-yorkie/build/run/clientGameTest/config/mcagent.json',
  import.meta.url,
);
const config = JSON.parse(await readFile(configFile, 'utf8'));
assert.equal(config.bindAddress, '127.0.0.1');
assert.equal(config.allowCommands, false);
assert.ok(config.authToken);
const statusFile = process.env.MUSHROOM_EXPEDITION_STATUS;
assert.ok(statusFile && isAbsolute(statusFile), 'Set MUSHROOM_EXPEDITION_STATUS to the absolute run status path');
assert.equal(await readFile(statusFile, 'utf8'), 'ready', 'No fresh disposable expedition is ready');

const url = `http://127.0.0.1:${config.port}/mcp`;
let session;
let id = 0;

async function rpc(method, params) {
  const headers = {
    Authorization: `Bearer ${config.authToken}`,
    'Content-Type': 'application/json',
  };
  if (session) headers['Mcp-Session-Id'] = session;
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
    redirect: 'error',
    signal: AbortSignal.timeout(20000),
  });
  assert.ok(response.ok, `Local controller returned HTTP ${response.status}`);
  session = response.headers.get('Mcp-Session-Id') ?? session;
  const data = await response.json();
  assert.ok(!data.error, data.error?.message);
  return data.result;
}

async function action(name, args = {}) {
  const result = await rpc('tools/call', { name, arguments: args });
  const observation = result.structuredContent ?? result.content;
  console.log(JSON.stringify({ at: new Date().toISOString(), action: name, args, observation, ok: !result.isError }));
  return result.isError ? null : observation;
}

async function walk(pos, stopDistance) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const outcome = await action('go_to', { pos, stopDistance, maxTicks: 125 });
    if (outcome?.arrived) return;
    const obstruction = outcome?.reason?.match(/blocked by minecraft:[\w]+_leaves at (-?\d+),(-?\d+),(-?\d+)/);
    if (!obstruction) {
      throw new Error(`Cannot reach ${pos}: ${outcome?.reason ?? 'no route'}`);
    }
    const clear = await action('break_block', { pos: obstruction.slice(1).map(Number), maxTicks: 30 });
    assert.ok(clear?.broken, 'The blocking leaves stayed in place');
  }
  throw new Error(`Could not reach ${pos} in four attempts`);
}

async function craft(item, count) {
  const result = await action('craft', { item, count });
  assert.ok(result?.success, `Could not make ${item}`);
}

async function descendFromCanopy(player) {
  const feet = [player.position.x, player.position.y, player.position.z].map(Math.floor);
  const [x, y, z] = feet;
  const column = await action('get_blocks', { center: [x, y - 2, z], size: [1, 7, 1], format: 'json' });
  const support = column.cells.find(cell => cell.y === y - 1);
  const landing = column.cells.filter(cell => cell.y < y - 1 && cell.b !== 'minecraft:leaf_litter')
    .sort((a, b) => b.y - a.y)[0];
  if (!/_(?:leaves|log)$/.test(support?.b ?? '') || !landing || y - landing.y > 4
      || !hasDrySupport(landing.b)) return null;
  const removed = await action('break_block', { pos: [x, y - 1, z], maxTicks: 100 });
  if (!removed?.broken) return null;
  for (let attempt = 0; attempt < 10; attempt++) {
    await setTimeout(150);
    const after = await action('observe');
    if (after?.onGround && after.position.y < player.position.y) return after;
  }
  return null;
}

function nearbyTrunk(matches, position) {
  const trunks = [];
  for (const { name, positions } of matches) {
    const columns = Map.groupBy(positions, ([x, , z]) => `${x},${z}`);
    for (const column of columns.values()) {
      const reach = column
        .filter(([, y]) => y >= Math.floor(position.y) - 2 && y <= position.y + 3)
        .sort((a, b) => a[1] - b[1]);
      if (reach.length < 3) continue;
      const [x, , z] = reach[0];
      if (x === Math.floor(position.x) && z === Math.floor(position.z)) continue;
      trunks.push({
        name,
        logs: reach.slice(0, 3),
        distance: Math.hypot(x + 0.5 - position.x, z + 0.5 - position.z),
      });
    }
  }
  return trunks.sort((a, b) => a.distance - b.distance)[0];
}

await rpc('initialize', {
  protocolVersion: '2025-06-18',
  capabilities: {},
  clientInfo: { name: 'mushroom-expedition-pilot', version: '1' },
});
try {
  const start = await action('observe');
  assert.ok(start?.inWorld && start.dimension === 'minecraft:overworld' && !start.dead);
  const inventory = await action('get_inventory');
  assert.equal(inventory.slots.length, 0, 'Expected an empty expedition inventory');
  await gatherStarterTools(start);
  await adoptAtNight(action, craft, descendFromCanopy);
  await reportStatus('finished');
} catch (error) {
  await reportStatus('failed');
  throw error;
}

async function reportStatus(status) {
  const temporary = `${statusFile}.${process.pid}.tmp`;
  await writeFile(temporary, status, { flag: 'wx' });
  await rename(temporary, statusFile);
}

async function gatherStarterTools(start) {
  const woodTypes = ['oak', 'birch', 'spruce', 'acacia', 'dark_oak', 'jungle', 'cherry', 'pale_oak'];
  const scanArgs = {
    blocks: woodTypes.map(wood => `${wood}_log`),
    radius: 16,
    max: 48,
  };
  let positionAtStart = start;
  let trunk;
  for (let height = 0; height < 4; height++) {
    const scan = await action('scan_blocks', scanArgs);
    trunk = nearbyTrunk(scan.matches, positionAtStart.position);
    if (trunk) break;
    const lower = await descendFromCanopy(positionAtStart);
    if (!lower) break;
    positionAtStart = lower;
  }
  assert.ok(trunk, 'No usable tree trunk in the local search area');
  await walk(trunk.logs[1], 2.8);
  for (const pos of trunk.logs) {
    const mined = await action('break_block', { pos, maxTicks: 100 });
    assert.ok(mined?.broken, `Could not mine the log at ${pos}`);
  }
  async function logCount() {
    const inventory = await action('get_inventory');
    return inventory.slots.filter(stack => stack.id === trunk.name)
      .reduce((count, stack) => count + stack.count, 0);
  }
  if (await logCount() < 3) {
    await walk(trunk.logs[0], 0.8);
    for (let height = 0; height < 3 && (await logCount()) < 3; height++) {
      if (!(await descendFromCanopy(await action('observe')))) break;
    }
    if (await logCount() < 3) {
      await walk(trunk.logs[0], 0.3);
      await setTimeout(300);
    }
    assert.ok(await logCount() >= 3, 'The player did not pick up three logs');
  }

  await craft(trunk.name.replace(/_log$/, '_planks'), 12);
  await craft('stick', 4);
  await craft('crafting_table', 1);
  let player = await action('observe');
  for (let descent = 0; descent < 6; descent++) {
    const lower = await descendFromCanopy(player);
    if (!lower) break;
    player = lower;
  }
  const table = (await action('get_inventory')).slots.find(stack => stack.id === 'minecraft:crafting_table');
  assert.ok(table && table.slot < 9, 'Expected a crafting table on the hotbar');
  await action('select_slot', { slot: table.slot });

  const { position } = await action('observe');
  const { x, y, z } = position;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const pos = [Math.floor(x) + dx, Math.floor(y), Math.floor(z) + dz];
    const ground = await action('get_blocks', { center: [pos[0], pos[1] - 1, pos[2]], size: [1, 1, 1], format: 'json' });
    if (!hasDrySupport(ground?.cells[0]?.b)) continue;
    let placed = await action('place_block', { pos });
    if (!placed?.placed) {
      const cell = await action('get_blocks', { center: pos, size: [1, 1, 1], format: 'json' });
      if (!cell?.cells[0]?.b.endsWith('_leaves')) continue;
      const cleared = await action('break_block', { pos, maxTicks: 30 });
      if (!cleared?.broken) continue;
      placed = await action('place_block', { pos });
    }
    if (!placed?.placed || placed.blockAtPos !== 'minecraft:crafting_table') continue;
    const opened = await action('interact_block', { pos });
    assert.equal(opened?.screenOpened, 'CraftingScreen');
    await craft('wooden_pickaxe', 1);
    await action('stop', { closeScreen: true });
    assert.ok((await action('break_block', { pos, maxTicks: 100 }))?.broken, 'Could not pack up the crafting table');
    await walk(pos, 0.3);
    await setTimeout(400);
    assert.ok((await action('get_inventory')).slots.some(stack => stack.id === 'minecraft:crafting_table'),
      'The player did not pick up the crafting table');
    return;
  }
  throw new Error('No nearby location accepted the crafting table');
}
