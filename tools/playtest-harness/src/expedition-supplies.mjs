import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import {
  adoptAtNight, earnIronKit, earnStoneKit, feedAdoptedDog, forageExpeditionMeal, prepareAdoptionCamp,
  hold, placeBeside, recoverDroppedLoadout, WOOD_LOGS,
} from './expedition-home.mjs';
import { hasDrySupport } from './expedition-navigation.mjs';
import { defendCompanion } from './expedition-companion.mjs';
import { expeditionPolicy } from './expedition-policy.mjs';
import { netherRoundTrip } from './expedition-nether.mjs';

const configFile = new URL(
  '../../../mods/mushroom-the-yorkie/build/run/clientGameTest/config/mcagent.json',
  import.meta.url,
);
const config = JSON.parse(await readFile(configFile, 'utf8'));
assert.equal(config.bindAddress, '127.0.0.1');
assert.equal(config.allowCommands, false);
assert.ok(config.authToken);
const bridgeFingerprint = createHash('sha256').update(config.authToken).digest('hex');
const statusFile = process.env.MUSHROOM_EXPEDITION_STATUS;
assert.ok(statusFile && isAbsolute(statusFile), 'Set MUSHROOM_EXPEDITION_STATUS to the absolute run status path');
const resume = process.env.MUSHROOM_EXPEDITION_RESUME === '1';
assert.equal(await readFile(statusFile, 'utf8'), resume ? 'held' : 'ready', 'The disposable expedition is not in the expected state');
const coachingFile = join(dirname(statusFile), 'coach.txt');
const checkpointFile = join(dirname(statusFile), 'controller-checkpoint.json');
const deathFile = join(dirname(statusFile), 'last-owner-death');
const live = process.env.MUSHROOM_EXPEDITION_LIVE === '1';
const deathAtStart = live ? await readFile(deathFile, 'utf8').catch(() => '') : '';
const blockPosition = pos => Array.isArray(pos) && pos.length === 3 && pos.every(Number.isInteger);

const url = `http://127.0.0.1:${config.port}/mcp`;
let session;
let id = 0;
let lastPlayer;
let companion;
let checkedCompanionAt = -Infinity;
let companionEmergency = false;
const interruptibleWork = new Set(['go_to', 'break_block', 'interact_block', 'use_item']);

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
  if (companion && interruptibleWork.has(name) && await checkCompanion(lastPlayer)) return null;
  const result = await playerAction(name, args);
  if (name === 'observe' && companion && await checkCompanion(result)) return playerAction('observe');
  return result;
}

async function checkCompanion(player) {
  if (!player?.inWorld || !Number.isFinite(player.gameTime)) return false;
  if (player.gameTime - checkedCompanionAt < 6) return companionEmergency;
  checkedCompanionAt = player.gameTime;
  companionEmergency = await defendCompanion(playerAction, player, companion);
  if (companionEmergency) {
    console.log(JSON.stringify({ at: new Date().toISOString(), action: 'companion_emergency', dog: companion }));
  }
  return companionEmergency;
}

async function playerAction(name, args = {}) {
  // Native walking adjusts yaw and preserves pitch from the previous input.
  if (name === 'go_to') {
    const night = lastPlayer?.timeOfDay >= 12_542 && lastPlayer.timeOfDay < 23_460;
    const endermen = night || lastPlayer?.dimension === 'minecraft:the_end'
      ? await playerAction('get_entities', { type: 'enderman', radius: 18, max: 8 })
      : null;
    await playerAction('look', { pitch: endermen?.entities?.length ? 26 : 4 });
  }
  const result = await rpc('tools/call', { name, arguments: args });
  const observation = result.structuredContent ?? result.content;
  console.log(JSON.stringify({ at: new Date().toISOString(), action: name, args, observation, ok: !result.isError }));
  if (name === 'observe' && !result.isError) {
    lastPlayer = observation;
    if (observation?.dead || (live && await readFile(deathFile, 'utf8').catch(() => '') !== deathAtStart)) {
      throw new Error('The Survival player died and needs to recover before continuing');
    }
  }
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
  const stage = process.env.MUSHROOM_EXPEDITION_STAGE ?? 'adoption';
  if (stage === 'defense') await runCompanionDrill();
  else if (stage === 'portal') {
    companion = (await readFile(join(dirname(statusFile), 'portal-companion'), 'utf8')).trim();
    assert.ok(/^[\da-f-]{36}$/i.test(companion));
    await netherRoundTrip(action, companion, hold);
  } else if (stage === 'shelter') {
    const camp = await prepareAdoptionCamp(action, craft, descendFromCanopy);
    assert.ok(camp.door, 'Expected to find a furnished house in the shelter replay');
    await adoptAtNight(action, camp, craft);
  }
  else await runExpedition(start, stage);
  await reportStatus('finished');
} catch (error) {
  await reportStatus(live ? 'held' : 'failed');
  throw error;
}

async function runCompanionDrill() {
  const [uuid, errand] = (await readFile(join(dirname(statusFile), 'defense-fixture'), 'utf8')).trim().split('\n');
  const pos = errand.trim().split(/\s+/).map(Number);
  assert.ok(/^[\da-f-]{36}$/i.test(uuid) && blockPosition(pos));
  companion = uuid;
  assert.equal(await action('go_to', { pos, stopDistance: 0.7, maxTicks: 28 }), null,
    'The proposed errand should be interrupted by danger to Mushroom');
  for (let attempt = 0; attempt < 6; attempt++) {
    await setTimeout(250);
    const observed = await playerAction('get_entities', { type: 'minecraft:spider', radius: 8 });
    if (!observed.entities.length) return;
    await action('observe');
  }
  throw new Error('The spider was still alive after the companion interruption');
}

async function runExpedition(start, stage) {
  const inventory = await action('get_inventory');
  const policy = await expeditionPolicy(process.env.MUSHROOM_EXPEDITION_POLICY ?? 'rules', coachingFile);
  if (live) policy.waitForCoaching = waitForCoaching;
  let checkpoint;
  if (resume) {
    checkpoint = JSON.parse(await readFile(checkpointFile, 'utf8'));
    assert.equal(checkpoint.stage, stage);
    assert.equal(checkpoint.owner, start.name);
    assert.equal(checkpoint.bridgeFingerprint, bridgeFingerprint, 'The recorded client is no longer listening');
    assert.ok(Number.isFinite(checkpoint.gameTime) && checkpoint.gameTime <= start.gameTime);
    assert.ok(['starter', 'provision', 'camp', 'adoption', 'stone', 'iron'].includes(checkpoint.phase));
    if (checkpoint.phase === 'provision' && inventory.slots.length === 0) {
      verifiedDeathSite(start, checkpoint);
      checkpoint.phase = 'starter';
      checkpoint.gameTime = start.gameTime;
      await writeCheckpoint(checkpoint);
      console.log(JSON.stringify({ at: new Date().toISOString(), action: 'rebuild_after_early_respawn' }));
    }
    if (checkpoint.phase === 'provision') {
      for (const item of ['crafting_table', 'wooden_sword', 'wooden_pickaxe']) {
        assert.ok(inventory.slots.some(stack => stack.id === `minecraft:${item}`), `The earned ${item} is missing`);
      }
    } else if (checkpoint.phase !== 'starter') {
      const camp = checkpoint.camp;
      const site = camp?.door ? [camp.bed, camp.door, camp.entrance] : [camp?.bed, camp?.table];
      for (const pos of site) {
        assert.ok(blockPosition(pos), 'Invalid recorded camp');
      }
    } else {
      assert.equal(inventory.slots.length, 0, 'Starter recovery requires an empty inventory');
    }
    assert.ok(checkpoint.quarry === undefined
      || (Array.isArray(checkpoint.quarry) && checkpoint.quarry.length <= 44 && checkpoint.quarry.every(blockPosition)),
    'Invalid recorded quarry path');
    assert.ok(checkpoint.quarryLanding === undefined || blockPosition(checkpoint.quarryLanding), 'Invalid recorded landing');
    assert.ok(checkpoint.dog === undefined || /^[\da-f-]{36}$/i.test(String(checkpoint.dog)), 'Invalid recorded dog UUID');
    companion = checkpoint.dog;
    await action('stop', { closeScreen: true });
    if (['stone', 'iron'].includes(checkpoint.phase)
        && !inventory.slots.some(stack => stack.id === 'mushroom_yorkie:field_guide')) {
      const destination = verifiedDeathSite(start, checkpoint);
      console.log(JSON.stringify({ at: new Date().toISOString(), action: 'recover_dropped_loadout', destination }));
      await recoverDroppedLoadout(action, destination);
      delete checkpoint.quarry;
      delete checkpoint.quarryLanding;
      delete checkpoint.reenterQuarry;
      await writeCheckpoint(checkpoint);
    }
    await reportStatus('ready');
    console.log(JSON.stringify({ at: new Date().toISOString(), action: 'controller_reattached', phase: checkpoint.phase }));
  } else {
    assert.equal(inventory.slots.length, 0, 'Expected an empty expedition inventory');
    checkpoint = { owner: start.name, gameTime: start.gameTime, bridgeFingerprint, stage, phase: 'starter' };
  }
  await action('set_reflexes', { chargeRanged: false });
  if (checkpoint.phase === 'starter') {
    await gatherStarterTools(start);
    checkpoint.phase = 'provision';
    if (live) await writeCheckpoint(checkpoint);
  }
  if (checkpoint.phase === 'provision') {
    checkpoint.camp = await prepareAdoptionCamp(action, craft, descendFromCanopy, policy);
    checkpoint.phase = 'camp';
    if (live) await writeCheckpoint(checkpoint);
  }
  if (checkpoint.phase === 'camp') {
    if (stage !== 'adoption' && !checkpoint.camp.door) {
      await earnStoneKit(action, craft, checkpoint.camp, { ...policy, beforeNight: true });
    }
    checkpoint.phase = 'adoption';
    if (live) await writeCheckpoint(checkpoint);
  }
  if (checkpoint.phase === 'adoption') {
    checkpoint.dog = await adoptAtNight(action, checkpoint.camp, craft);
    companion = checkpoint.dog;
    checkpoint.fedDog = await feedAdoptedDog(action, checkpoint.dog, checkpoint.camp.bed, stage === 'adoption' ? 120 : 24);
    checkpoint.phase = 'stone';
    if (live && stage !== 'adoption') await writeCheckpoint(checkpoint);
    if (!checkpoint.fedDog) {
      if (stage === 'adoption') throw new Error('Could not feed the adopted dog at the camp');
      console.log(JSON.stringify({ at: new Date().toISOString(), action: 'mushroom_meal_pending', dog: checkpoint.dog }));
    }
  }
  if (stage !== 'adoption' && checkpoint.phase === 'stone') {
    if (!checkpoint.camp.table) {
      checkpoint.camp.table = await placeBeside(action, 'minecraft:crafting_table');
      if (live) await writeCheckpoint(checkpoint);
    }
    await earnStoneKit(action, craft, checkpoint.camp, policy);
    checkpoint.phase = 'iron';
    if (live && stage === 'iron') await writeCheckpoint(checkpoint);
  }
  if (stage === 'iron') {
    if (live) {
      policy.resumeQuarry = checkpoint.quarry;
      policy.resumeQuarryLanding = checkpoint.quarryLanding;
      policy.reenterQuarry = checkpoint.reenterQuarry === true;
      policy.saveQuarry = async (stairs, landing) => {
        checkpoint.quarry = stairs;
        checkpoint.quarryLanding = landing;
        delete checkpoint.reenterQuarry;
        await writeCheckpoint(checkpoint);
      };
    }
    await earnIronKit(action, craft, checkpoint.camp, policy);
  }
  if (checkpoint.fedDog === false) {
    assert.ok(await forageExpeditionMeal(action), 'Could not earn a meal for the original dog');
    const player = await action('observe');
    const position = [player.position.x, player.position.y, player.position.z].map(Math.floor);
    assert.ok(await feedAdoptedDog(action, checkpoint.dog, position), 'Could not feed the original dog before finishing');
    checkpoint.fedDog = true;
    if (live) await writeCheckpoint(checkpoint);
  }
}

function verifiedDeathSite(player, checkpoint) {
  const [dimension, x, y, z, tick] = deathAtStart.trim().split(' ');
  const destination = [x, y, z].map(Number);
  assert.ok(dimension === player.dimension && blockPosition(destination)
    && Number(tick) > checkpoint.gameTime && Number(tick) <= player.gameTime,
  'Cannot confirm a death in this save after the recorded checkpoint');
  return destination;
}

async function reportStatus(status) {
  await replaceFile(statusFile, status);
}

async function writeCheckpoint(checkpoint) {
  await replaceFile(checkpointFile, JSON.stringify(checkpoint));
}

async function replaceFile(path, content) {
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, content, { flag: 'wx' });
  await rename(temporary, path);
}

async function waitForCoaching(context) {
  const prior = await readFile(coachingFile, 'utf8').catch(() => '');
  console.log(JSON.stringify({ at: new Date().toISOString(), action: 'awaiting_coaching', ...context }));
  await reportStatus('awaiting-coaching');
  for (let second = 0; second < 180; second++) {
    await setTimeout(1000);
    const next = await readFile(coachingFile, 'utf8').catch(() => '');
    if (next.trim() && next !== prior) {
      await reportStatus('ready');
      return true;
    }
  }
  return false;
}

async function gatherStarterTools(start) {
  const scanArgs = {
    blocks: WOOD_LOGS,
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
    await craft('wooden_sword', 1);
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
