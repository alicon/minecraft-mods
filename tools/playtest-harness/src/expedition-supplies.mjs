import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appendFile, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import {
  adoptAtNight, earnIronKit, earnStoneKit, feedAdoptedDog, forageExpeditionMeal, prepareAdoptionCamp,
  breakVisible, ensurePlanks, hold, placeBeside, recoverDroppedLoadout, settleOnDryStep, WOOD_LOGS,
} from './expedition-home.mjs';
import { canopyLanding, hasDrySupport } from './expedition-navigation.mjs';
import { defendCompanion } from './expedition-companion.mjs';
import { crossEndPortal } from './expedition-end-entry.mjs';
import { scoutByEye } from './expedition-eye-route.mjs';
import { COMPANION_WEARABLES, markExpeditionCamp, practiceStayAndRecall, prepareCompanionGear } from './expedition-gear.mjs';
import { expeditionPolicy } from './expedition-policy.mjs';
import { NETHER, OVERWORLD, netherRoundTrip, prepareNetherPortal } from './expedition-nether.mjs';

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
const playtestLog = join(dirname(statusFile), 'playtest.log');
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
const interruptibleWork = new Set(['go_to', 'move', 'break_block', 'interact_block', 'use_item']);
const lastReport = new Map();

async function narrate(kind, message, interval = 0) {
  const now = Date.now();
  if (now - (lastReport.get(kind) ?? -Infinity) < interval) return;
  lastReport.set(kind, now);
  await appendFile(playtestLog, `[${new Date(now).toISOString()}] ${kind} | ${message.replace(/\s+/g, ' ')}\n`);
}

const milestoneObjectives = {
  defense: 'Protect Mushroom before continuing the errand.',
  feeding: 'Call Mushroom back from the sheep and give him a meal at camp.',
  portal: 'Find supplies, repair the Nether portal, and come home with Mushroom.',
  shelter: 'Enter the furnished house and sleep with the door closed.',
  equipment: 'Craft the harness, padded vest, and mat. Fit Mushroom’s gear and mark camp.',
  'end-entry': 'Craft Eyes of Ender and bring Mushroom through the active portal.',
  'eye-route': 'Throw an Eye of Ender and follow its visible flight with Mushroom.',
  'quarry-tools': 'Craft the starter kit, shovel soil, and switch to a pickaxe for stone.',
};

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
    await narrate('Decision', 'Interrupted the current task to protect Mushroom from a nearby threat.', 10_000);
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
    if (observation?.inWorld) {
      const { x, y, z } = observation.position;
      const threat = observation.threats?.[0];
      const health = Math.round(observation.health * 10) / 10;
      await narrate('Status', `At ${Math.floor(x)}, ${Math.floor(y)}, ${Math.floor(z)}. Health ${health}/20, food ${observation.food}/20.`
        + (threat ? ` Nearby: ${threat.type.split(':').at(-1).replaceAll('_', ' ')} at ${Math.round(threat.distance)} blocks.` : ''), 20_000);
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
  await narrate('Action', `Crafted ${result.crafted} × ${item.split(':').at(-1).replaceAll('_', ' ')}.`);
}

async function descendFromCanopy(player) {
  if (!player?.inWorld || !player.onGround || player.health < 8 || player.inWater) return null;
  const feet = [player.position.x, player.position.y, player.position.z].map(Math.floor);
  const [x, y, z] = feet;
  const column = await action('get_blocks', { center: [x, y - 2, z], size: [1, 7, 1], format: 'json' });
  const landing = canopyLanding(column?.cells ?? [], feet, player.health);
  if (!landing) return null;
  // The player is wider than a point. Center over the checked column so
  // the edge of a neighboring leaf does not catch the fall.
  for (let adjustment = 0; adjustment < 4; adjustment++) {
    const dx = x + 0.5 - player.position.x;
    const dz = z + 0.5 - player.position.z;
    if (Math.max(Math.abs(dx), Math.abs(dz)) <= 0.16) {
      const removed = await action('break_block', { pos: [x, y - 1, z], maxTicks: 100 });
      return removed?.broken && await settleOnDryStep(action, landing) ? action('observe') : null;
    }
    await action('move', { forward: true, sneak: true, ticks: 3, yaw: Math.atan2(-dx, dz) * 180 / Math.PI });
    player = await action('observe');
    if (!player?.onGround || !feet.every((value, axis) =>
      value === Math.floor([player.position.x, player.position.y, player.position.z][axis]))) return null;
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
  const stage = process.env.MUSHROOM_EXPEDITION_STAGE ?? 'adoption';
  const policy = process.env.MUSHROOM_EXPEDITION_POLICY ?? 'rules';
  await narrate('Run', `${resume ? 'Reattached to the same save' : 'Started the Survival controller'}. Stage ${stage}, policy ${policy}.`);
  const start = await action('observe');
  assert.ok(start?.inWorld && !start.dead && (start.dimension === OVERWORLD
    || (resume && stage === 'nether' && start.dimension === NETHER)));
  if (milestoneObjectives[stage]) await narrate('Objective', milestoneObjectives[stage]);
  if (stage === 'defense') await runCompanionDrill();
  else if (stage === 'feeding') {
    companion = (await readFile(join(dirname(statusFile), 'feeding-companion'), 'utf8')).trim();
    assert.ok(/^[\da-f-]{36}$/i.test(companion));
    const camp = [start.position.x, start.position.y, start.position.z].map(Math.floor);
    assert.ok(await feedAdoptedDog(action, companion, camp, 24), 'The original Mushroom was not fed at camp');
  }
  else if (stage === 'portal') {
    companion = (await readFile(join(dirname(statusFile), 'portal-companion'), 'utf8')).trim();
    assert.ok(/^[\da-f-]{36}$/i.test(companion));
    await netherRoundTrip(action, companion, hold, () => prepareNetherPortal(action, craft));
  } else if (stage === 'shelter') {
    const camp = await prepareAdoptionCamp(action, craft, descendFromCanopy);
    assert.ok(camp.door, 'Expected to find a furnished house in the shelter replay');
    await adoptAtNight(action, camp, craft);
  } else if (stage === 'equipment') {
    companion = (await readFile(join(dirname(statusFile), 'gear-companion'), 'utf8')).trim();
    assert.ok(/^[\da-f-]{36}$/i.test(companion));
    await prepareCompanionGear(action, craft, companion);
    await practiceStayAndRecall(action, companion);
    const camp = await markExpeditionCamp(action);
    console.log(JSON.stringify({ at: new Date().toISOString(), action: 'camp_marked', dog: companion, camp }));
  } else if (stage === 'end-entry') {
    companion = (await readFile(join(dirname(statusFile), 'end-companion'), 'utf8')).trim();
    assert.ok(/^[\da-f-]{36}$/i.test(companion));
    await crossEndPortal(action, craft, companion);
  } else if (stage === 'eye-route') {
    companion = (await readFile(join(dirname(statusFile), 'eye-companion'), 'utf8')).trim();
    assert.ok(/^[\da-f-]{36}$/i.test(companion));
    await scoutByEye(action, companion, async bearing => {
      console.log(JSON.stringify({ at: new Date().toISOString(), action: 'eye_bearing', bearing }));
      const yaw = Math.round(Math.atan2(-bearing.x, bearing.z) * 180 / Math.PI);
      await narrate('Decision', `Saw the eye travel ${bearing.distance.toFixed(1)} blocks. Heading toward its bearing at yaw ${yaw}° on dry ground.`);
    });
  } else if (stage === 'quarry-tools') {
    const targets = JSON.parse(await readFile(join(dirname(statusFile), 'quarry-tool-targets'), 'utf8'));
    assert.ok(targets.length === 2 && targets.every(blockPosition));
    await gatherStarterTools(start);
    for (const [index, block] of ['minecraft:dirt', 'minecraft:stone'].entries()) {
      const result = await breakVisible(action, targets[index]);
      assert.ok(result?.broken && result.block === block, `Could not break the staged ${block}`);
    }
  } else await runExpedition(start, stage);
  await narrate('Result', 'The controller finished its stage. The game test is checking the outcome.');
  await reportStatus('finished');
} catch (error) {
  await narrate('Result', `Run ${live ? 'held' : 'stopped'}. ${error.message.split('\n')[0]}`);
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
  const policy = await expeditionPolicy(process.env.MUSHROOM_EXPEDITION_POLICY ?? 'rules', coachingFile, narrate);
  policy.reportScouting = message => narrate('Scouting', message, 20_000);
  if (live) policy.waitForCoaching = waitForCoaching;
  let checkpoint;
  if (resume) {
    checkpoint = JSON.parse(await readFile(checkpointFile, 'utf8'));
    assert.equal(checkpoint.stage, stage);
    assert.equal(checkpoint.owner, start.name);
    assert.equal(checkpoint.bridgeFingerprint, bridgeFingerprint, 'The recorded client is no longer listening');
    assert.ok(Number.isFinite(checkpoint.gameTime) && checkpoint.gameTime <= start.gameTime);
    assert.ok(['starter', 'provision', 'camp', 'adoption', 'stone', 'iron', 'nether'].includes(checkpoint.phase));
    assert.ok(start.dimension === OVERWORLD || checkpoint.phase === 'nether', 'Unexpected dimension before the Nether phase');
    const starterItems = ['crafting_table', 'wooden_sword', 'wooden_pickaxe'];
    if (checkpoint.phase === 'provision'
      && starterItems.some(item => !inventory.slots.some(stack => stack.id === `minecraft:${item}`))) {
      verifiedDeathSite(start, checkpoint);
      checkpoint.phase = 'starter';
      checkpoint.gameTime = start.gameTime;
      await writeCheckpoint(checkpoint);
      console.log(JSON.stringify({ at: new Date().toISOString(), action: 'rebuild_after_early_respawn' }));
    }
    if (checkpoint.phase !== 'starter' && checkpoint.phase !== 'provision') {
      const camp = checkpoint.camp;
      const site = camp?.door ? [camp.bed, camp.door, camp.entrance] : [camp?.bed, camp?.table];
      for (const pos of site) {
        assert.ok(blockPosition(pos), 'Invalid recorded camp');
      }
    }
    assert.ok(checkpoint.quarry === undefined
      || (Array.isArray(checkpoint.quarry) && checkpoint.quarry.length <= 44 && checkpoint.quarry.every(blockPosition)),
    'Invalid recorded quarry path');
    assert.ok(checkpoint.quarryLanding === undefined || blockPosition(checkpoint.quarryLanding), 'Invalid recorded landing');
    assert.ok(checkpoint.dog === undefined || /^[\da-f-]{36}$/i.test(String(checkpoint.dog)), 'Invalid recorded dog UUID');
    assert.ok(checkpoint.equipment === undefined || (Array.isArray(checkpoint.equipment)
      && new Set(checkpoint.equipment).size === checkpoint.equipment.length
      && checkpoint.equipment.every(item => COMPANION_WEARABLES.includes(item))), 'Invalid recorded companion equipment');
    companion = checkpoint.dog;
    await action('stop', { closeScreen: true });
    if (['stone', 'iron', 'nether'].includes(checkpoint.phase)
        && !inventory.slots.some(stack => stack.id === 'mushroom_yorkie:field_guide')) {
      const destination = verifiedDeathSite(start, checkpoint);
      await narrate('Objective', 'Return to the recorded death site and collect the dropped gear.');
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
    await narrate('Objective', 'Collect wood and make the starter tools.');
    await gatherStarterTools(start);
    checkpoint.phase = 'provision';
    if (live) await writeCheckpoint(checkpoint);
  }
  if (checkpoint.phase === 'provision') {
    await narrate('Objective', 'Find a sheltered bed, or gather wool to make one.');
    checkpoint.camp = await prepareAdoptionCamp(action, craft, descendFromCanopy, policy);
    checkpoint.phase = 'camp';
    if (live) await writeCheckpoint(checkpoint);
  }
  if (checkpoint.phase === 'camp') {
    if (stage !== 'adoption' && !checkpoint.camp.door) {
      await narrate('Objective', 'Use the daylight before bedtime to make stone tools.');
      await earnStoneKit(action, craft, checkpoint.camp, { ...policy, beforeNight: true });
    }
    checkpoint.phase = 'adoption';
    if (live) await writeCheckpoint(checkpoint);
  }
  if (checkpoint.phase === 'adoption') {
    await narrate('Objective', 'Sleep at camp, meet Mushroom, and feed him.');
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
    await narrate('Objective', 'Make a stone pickaxe and furnace near camp.');
    if (!checkpoint.camp.table) {
      checkpoint.camp.table = await placeBeside(action, 'minecraft:crafting_table');
      if (live) await writeCheckpoint(checkpoint);
    }
    await earnStoneKit(action, craft, checkpoint.camp, policy);
    checkpoint.phase = 'iron';
    if (live && ['iron', 'nether'].includes(stage)) await writeCheckpoint(checkpoint);
  }
  if (['iron', 'nether'].includes(stage) && checkpoint.phase === 'iron') {
    await narrate('Objective', 'Mine and smelt iron for a pickaxe, bucket, and shield.');
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
    await earnIronKit(action, craft, checkpoint.camp, { ...policy, reserveIgnitionIron: stage === 'nether' });
  }
  if (checkpoint.fedDog === false) {
    await narrate('Objective', 'Find a meal for the original Mushroom.');
    assert.ok(await forageExpeditionMeal(action), 'Could not earn a meal for the original dog');
    const player = await action('observe');
    const position = [player.position.x, player.position.y, player.position.z].map(Math.floor);
    assert.ok(await feedAdoptedDog(action, checkpoint.dog, position), 'Could not feed the original dog before finishing');
    checkpoint.fedDog = true;
    if (live) await writeCheckpoint(checkpoint);
  }
  if (stage === 'nether') {
    if (checkpoint.phase !== 'nether') {
      await narrate('Objective', 'Equip Mushroom and pack the camp mat before travelling.');
      checkpoint.equipment ??= [];
      await prepareCompanionGear(action, craft, checkpoint.dog, checkpoint.equipment, async item => {
        checkpoint.equipment.push(item);
        if (live) await writeCheckpoint(checkpoint);
      });
      await practiceStayAndRecall(action, checkpoint.dog);
    }
    checkpoint.phase = 'nether';
    if (live) await writeCheckpoint(checkpoint);
    await narrate('Objective', 'Make a dry Nether round trip with Mushroom.');
    await netherRoundTrip(action, checkpoint.dog, hold, () => prepareNetherPortal(action, craft, checkpoint.camp), start.dimension);
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
  await narrate('Decision', 'The quarry exit is still blocked. Waiting for a different route in coach.txt.');
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

async function collectStarterLogs(start) {
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
  await recoverLooseLogs();
  async function logCount() {
    const inventory = await action('get_inventory');
    return inventory.slots.filter(stack => stack.id === trunk.name)
      .reduce((count, stack) => count + stack.count, 0);
  }
  if (await logCount() < 3) {
    // go_to may reach the horizontal point with the logs still below.
    await walk(trunk.logs[0], 0.8);
    for (let height = 0; height < 3 && (await logCount()) < 3; height++) {
      if (!(await descendFromCanopy(await action('observe')))) break;
    }
    if (await logCount() < 3) {
      await walk(trunk.logs[0], 0.3);
      await setTimeout(300);
    }
  }
}

async function recoverLooseLogs() {
  const loose = await action('get_entities', { type: 'item', radius: 6 });
  for (const entity of loose?.entities.filter(item => WOOD_LOGS.includes(item.item?.id.replace(/^minecraft:/, ''))) ?? []) {
    await action('go_to', { entityId: entity.id, stopDistance: 0.3, maxTicks: 40 });
  }
}

async function gatherStarterTools(start) {
  const stock = await action('get_inventory');
  const amount = item => stock.slots.reduce((total, stack) => total + (stack.id === item ? stack.count : 0), 0);
  const tools = [['wooden_pickaxe', 3, 2], ['wooden_sword', 2, 1], ['wooden_shovel', 1, 2]]
    .filter(([item]) => !amount(`minecraft:${item}`));
  const needsTable = !amount('minecraft:crafting_table');
  const sticksNeeded = tools.reduce((total, [, , cost]) => total + cost, 0) - amount('minecraft:stick');
  const stickBatches = Math.max(0, Math.ceil(sticksNeeded / 4));
  const planks = tools.reduce((total, [, cost]) => total + cost, 0) + (needsTable ? 4 : 0) + stickBatches * 2;
  if (!planks) return;

  const hasWood = stock.slots.some(stack => /_(?:log|planks)$/.test(stack.id));
  if (!hasWood) await collectStarterLogs(start);
  else await recoverLooseLogs();

  let player = await action('observe');
  for (let descent = 0; descent < 6; descent++) {
    const lower = await descendFromCanopy(player);
    if (!lower) break;
    player = lower;
  }
  await ensurePlanks(action, craft, planks);
  if (stickBatches) await craft('stick', stickBatches * 4);
  if (needsTable) await craft('crafting_table', 1);
  if (!tools.length) return;
  await hold(action, 'minecraft:crafting_table');

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
    for (const [item] of tools) await craft(item, 1);
    await action('stop', { closeScreen: true });
    assert.ok((await breakVisible(action, pos))?.broken, 'Could not pack up the crafting table');
    await walk(pos, 0.3);
    await setTimeout(400);
    assert.ok((await action('get_inventory')).slots.some(stack => stack.id === 'minecraft:crafting_table'),
      'The player did not pick up the crafting table');
    return;
  }
  throw new Error('No nearby location accepted the crafting table');
}
