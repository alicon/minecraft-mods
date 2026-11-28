import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appendFile, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import {
  adoptAtNight, dogMealCount, earnIronKit, earnStoneKit, feedAdoptedDog, forageExpeditionMeal, prepareAdoptionCamp,
  breakVisible, climbQuarry, daylightLoadoutIsVisible, descendQuarry, ensurePlanks, hold, packRecoveryMeal, placeBeside, recoverDroppedLoadout,
  regroupExpeditionCompanion, retreatFromNearbyMob,
  settleOnDryStep, sleepNearby, stepOut, waitForDaylightRecovery, WOOD_LOGS,
} from './expedition-home.mjs';
import { canopyLanding } from './expedition-navigation.mjs';
import { defendCompanion } from './expedition-companion.mjs';
import { shelterAtEndArrival } from './expedition-end-camp.mjs';
import { reachEndIslandSurface } from './expedition-end-route.mjs';
import { blazePowderCount, craftBlazePowder, earnBlazeRods } from './expedition-blaze-rods.mjs';
import { clearGeneratedCrystals, readCrystalProgress, shootEndCrystal } from './expedition-end-crystals.mjs';
import { fightEndDragon, recallAndExitEnd, recallEndCompanion } from './expedition-dragon-fight.mjs';
import { prepareEndCombatKit } from './expedition-end-kit.mjs';
import { craftEyes, crossEndPortal, descendToStronghold, enderEyeCount, findStrongholdPortalRoom } from './expedition-end-entry.mjs';
import { earnEnderPearls } from './expedition-pearls.mjs';
import {
  campOutboundTrail, companionRegroupTrail, groundedScoutingTrail, navigateToStronghold, returnToCampWithCompanion, scoutByEye,
} from './expedition-eye-route.mjs';
import { COMPANION_WEARABLES, markExpeditionCamp, practiceStayAndRecall, prepareCompanionGear } from './expedition-gear.mjs';
import { expeditionPolicy } from './expedition-policy.mjs';
import { NETHER, OVERWORLD, netherRoundTrip, prepareNetherPortal, withCompanion } from './expedition-nether.mjs';

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
const ownerFile = join(dirname(statusFile), 'controller-owner');
const launchOwner = process.env.MUSHROOM_EXPEDITION_CONTROLLER_OWNER;
if (launchOwner) {
  assert.equal(await readFile(ownerFile, 'utf8'), launchOwner, 'The launcher no longer owns this expedition');
} else {
  const pendingOwner = `${ownerFile}-${process.pid}`;
  await writeFile(pendingOwner, `controller-${process.pid}-${Date.now()}`);
  await rename(pendingOwner, ownerFile);
}
const coachingFile = join(dirname(statusFile), 'coach.txt');
const checkpointFile = join(dirname(statusFile), 'controller-checkpoint.json');
const deathFile = join(dirname(statusFile), 'last-owner-death');
const playtestLog = join(dirname(statusFile), 'playtest.log');
const live = process.env.MUSHROOM_EXPEDITION_LIVE === '1';
const deathAtStart = live ? await readFile(deathFile, 'utf8').catch(() => '') : '';
const blockPosition = pos => Array.isArray(pos) && pos.length === 3 && pos.every(Number.isInteger);
const campTrail = trail => Array.isArray(trail) && trail.length <= 256 && trail.every(blockPosition);
const DOG_MEAL_INTERVAL = 4_000;
const PORTAL_POWDER = 12;
// Leave enough for the twelve sockets after up to eight scouting throws.
const STRONGHOLD_EYES = 20;
const END = 'minecraft:the_end';
const STRONGHOLD_PHASES = ['gather-eyes', 'arm-for-end', 'follow-eyes', 'descend-stronghold'];
const END_PHASES = ['cross-end', 'end-camp', 'end-surface', 'end-crystals', 'end-dragon', 'end-return', 'home'];

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
  reunion: 'Get through the night, earn a meal, and find the original injured Mushroom.',
  portal: 'Find supplies, repair the Nether portal, and come home with Mushroom.',
  'nether-supplies': 'Shelter Mushroom in the Nether, earn a blaze rod, and return together.',
  'nether-distant-supplies': 'Scout for a distant Nether fortress with Mushroom and bring home a blaze rod.',
  'ender-supplies': 'Shelter Mushroom, earn an Ender pearl, and craft an Eye of Ender.',
  shelter: 'Enter the furnished house and sleep with the door closed.',
  'field-sleep': 'Place the carried bed before the nighttime return with Mushroom.',
  equipment: 'Craft the harness, padded vest, and mat. Fit Mushroom’s gear and mark camp.',
  'end-entry': 'Craft Eyes of Ender and bring Mushroom through the active portal.',
  'generated-end-entry': 'Find the generated portal room, open its portal, and bring Mushroom through.',
  'end-camp': 'Cross the generated portal with Mushroom and build his shelter on safe footing.',
  'end-camp-route': 'Dig a reversible staircase, return to Mushroom’s camp, then recall him and climb out together.',
  'end-crystal': 'Mark Mushroom’s shelter and break an End crystal from a safe bow position.',
  'generated-end-crystals': 'Shelter Mushroom and clear the generated End crystals using the bow and safe approaches.',
  'eye-route': 'Throw an Eye of Ender and follow its visible flight with Mushroom.',
  'stronghold-approach': 'Measure two Eye of Ender bearings and reach the stronghold area with Mushroom.',
  'quarry-tools': 'Craft the starter kit, shovel soil, and switch to a pickaxe for stone.',
  'quarry-iron': 'Mine the iron below camp, return up the stairs, and make the expedition kit.',
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

async function feedMushroom(uuid, position, attempts, options) {
  const fed = await feedAdoptedDog(action, uuid, position, attempts, options);
  if (fed) console.log(JSON.stringify({ at: new Date().toISOString(), action: 'companion_meal_consumed', dog: uuid }));
  return fed;
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
  let result;
  let observation;
  for (let attempt = 0; attempt < 2; attempt++) {
    result = await rpc('tools/call', { name, arguments: args });
    observation = result.structuredContent ?? result.content;
    console.log(JSON.stringify({ at: new Date().toISOString(), action: name, args, observation, ok: !result.isError }));
    const delay = observation?.retryAfterMs;
    if (attempt === 1 || !result.isError || !Number.isFinite(delay) || delay <= 0 || delay > 1_000) break;
    await setTimeout(delay + 20);
  }
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

if (resume) {
  console.log(JSON.stringify({ at: new Date().toISOString(), action: 'controller_resume_started', assisted: !launchOwner }));
}
await rpc('initialize', {
  protocolVersion: '2025-06-18',
  capabilities: {},
  clientInfo: { name: 'mushroom-expedition-pilot', version: '1' },
});
try {
  const stage = process.env.MUSHROOM_EXPEDITION_STAGE ?? 'adoption';
  const policy = process.env.MUSHROOM_EXPEDITION_POLICY ?? 'rules';
  const archivedEnd = stage === 'end-return';
  const duel = archivedEnd || (stage === 'generated-end-crystals' && process.env.MUSHROOM_EXPEDITION_DUEL_ONLY === '1');
  await narrate('Run', `${resume ? 'Reattached to the same save' : 'Started the Survival controller'}. Stage ${stage}, policy ${policy}.`);
  const start = await action('observe');
  const startDimension = ['end-crystal', 'generated-end-crystals', 'end-return'].includes(stage) ? 'minecraft:the_end' : OVERWORLD;
  assert.ok(start?.inWorld && !start.dead && (start.dimension === startDimension
    || (resume && ['nether', 'nether-powder', 'stronghold', 'expedition'].includes(stage) && start.dimension === NETHER)
    || (resume && stage === 'expedition' && start.dimension === END)),
  'The controller was not in its expected starting dimension');
  if (!duel && milestoneObjectives[stage]) await narrate('Objective', milestoneObjectives[stage]);
  if (stage === 'defense') await runCompanionDrill(start);
  else if (stage === 'reunion') await runReunion(start);
  else if (stage === 'field-sleep') {
    companion = (await readFile(join(dirname(statusFile), 'field-sleep-dog'), 'utf8')).trim();
    const { x, y, z } = start.position;
    await waitForDaylightRecovery(action, [Math.floor(x) + 64, Math.floor(y), Math.floor(z)],
      message => narrate('Decision', message));
    await withCompanion(action, OVERWORLD, companion);
  }
  else if (stage === 'feeding') {
    companion = (await readFile(join(dirname(statusFile), 'feeding-companion'), 'utf8')).trim();
    assert.ok(/^[\da-f-]{36}$/i.test(companion));
    const camp = [start.position.x, start.position.y, start.position.z].map(Math.floor);
    assert.ok(await feedMushroom(companion, camp, 24), 'The original Mushroom was not fed at camp');
  }
  else if (['portal', 'nether-supplies', 'nether-distant-supplies'].includes(stage)) {
    companion = (await readFile(join(dirname(statusFile), 'portal-companion'), 'utf8')).trim();
    assert.ok(/^[\da-f-]{36}$/i.test(companion));
    const work = stage === 'portal' ? undefined : exit => bringBlazeRods(companion, exit, 2);
    await netherRoundTrip(action, companion, hold, () => prepareNetherPortal(action, craft), OVERWORLD, work);
    if (work) await craftBlazePowder(action, craft, 2);
  } else if (stage === 'ender-supplies') {
    companion = (await readFile(join(dirname(statusFile), 'pearl-companion'), 'utf8')).trim();
    assert.ok(/^[\da-f-]{36}$/i.test(companion));
    await earnEyes(companion, 1);
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
  } else if (stage === 'end-kit') {
    companion = (await readFile(join(dirname(statusFile), 'end-kit-companion'), 'utf8')).trim();
    assert.ok(/^[\da-f-]{36}$/i.test(companion));
    await narrate('Objective', 'Earn the missing feather, craft a bow and arrows, and pack cooked food and water.');
    await prepareEndCombatKit(action, craft, companion, reportEndKit, { arrows: 12, rations: 3 });
  } else if (['end-entry', 'generated-end-entry', 'end-camp', 'end-camp-route'].includes(stage)) {
    companion = (await readFile(join(dirname(statusFile), 'end-companion'), 'utf8')).trim();
    assert.ok(/^[\da-f-]{36}$/i.test(companion));
    if (stage !== 'end-entry' && process.env.MUSHROOM_EXPEDITION_START_ABOVE_STRONGHOLD === '1') {
      const { x, y, z } = start.position;
      await descendToStronghold(action, companion, [x, y, z].map(Math.floor), reportStrongholdEntry);
    }
    const ring = stage !== 'end-entry' ? await findStrongholdPortalRoom(action, companion, async (event, observation) => {
      console.log(JSON.stringify({ at: new Date().toISOString(), action: event, observation }));
      if (event === 'portal_room') await narrate('Result', 'Reached a dry position beside the generated End portal.');
    }) : undefined;
    await crossEndPortal(action, craft, companion, ring);
    if (stage === 'end-camp' || stage === 'end-camp-route') {
      const camp = await shelterAtEndArrival(action, companion, reportEndCamp);
      if (stage === 'end-camp-route') {
        const trail = await reachEndIslandSurface(action, camp, reportEndCamp);
        await reportStatus('surface');
        await awaitNativeProof('native-end-surface', companion, 'The server did not confirm the End surface and sheltered dog');
        await recallEndCompanion(action, companion, camp.shelter, async (kind, observation) => {
          await reportEndCamp(kind, observation);
          if (kind === 'camp_returned') {
            await reportStatus('camp-returned');
            await awaitNativeProof('native-end-camp-returned', companion, 'The server did not confirm the original dog at camp');
          }
        }, trail);
        await narrate('Result', 'Recalled the original Mushroom and climbed out of the End camp together.');
      }
    }
  } else if (stage === 'end-crystal' || stage === 'generated-end-crystals' || archivedEnd) {
    const archive = archivedEnd
      ? JSON.parse(await readFile(join(dirname(statusFile), 'archived-end-start.json'), 'utf8')) : null;
    companion = archive?.dog ?? (await readFile(join(dirname(statusFile), 'end-crystal-companion'), 'utf8')).trim();
    assert.ok(/^[\da-f-]{36}$/i.test(companion));
    const generated = stage === 'generated-end-crystals' || archivedEnd;
    const endFile = join(dirname(statusFile), duel ? 'duel-checkpoint.json' : 'crystal-checkpoint.json');
    let camp;
    let progress;
    if (generated && resume) {
      progress = JSON.parse(await readFile(endFile, 'utf8'));
      assert.equal(progress.bridgeFingerprint, bridgeFingerprint);
      assert.equal(progress.owner, start.name);
      assert.equal(progress.dog, companion);
      assert.ok(blockPosition(progress.camp) && Number.isInteger(progress.hits) && progress.hits >= 0);
      camp = progress.camp;
      await action('stop');
      const block = await action('get_blocks', { center: camp, size: [1, 1, 1], format: 'json' });
      assert.ok(block?.cells.some(cell => cell.b === 'mushroom_yorkie:camp_mat'), 'The marked End mat is missing');
      const dogs = await action('get_entities', { type: 'mushroom_yorkie:mushroom_yorkie', radius: 128 });
      const beyondTracking = archive && Math.hypot(start.position.x - archive.shelter[0],
        start.position.z - archive.shelter[2]) > 48;
      assert.ok(beyondTracking || dogs?.entities.some(dog => dog.uuid === companion && dog.health > 0),
        'The original End companion is missing');
      await reportStatus('ready');
    } else {
      if (archive) assert.ok(blockPosition(archive.camp) && blockPosition(archive.shelter), 'The original End camp is missing');
      camp = archive?.camp ?? await markExpeditionCamp(action);
      progress = { bridgeFingerprint, owner: start.name, dog: companion, camp, hits: 0 };
      if (generated) await writeFile(endFile, JSON.stringify(progress));
    }
    if (duel) {
      const reflexes = await action('set_reflexes', { autoDefend: false, waterLanding: true });
      const fallOnly = !archive && process.env.MUSHROOM_EXPEDITION_FALL_ONLY === '1';
      const refugeOnly = !archive && !fallOnly && process.env.MUSHROOM_EXPEDITION_REFUGE_ONLY === '1';
      await narrate('Objective', archive
        ? 'Defeat the original dragon with the gear carried from the crystal fight, then bring Mushroom home.'
        : 'Fight the full-health dragon through native attacks while Mushroom stays in shelter.');
      const report = async (kind, observation) => {
        console.log(JSON.stringify({ at: new Date().toISOString(), action: `dragon_${kind}`, observation, camp, dog: companion }));
        if (kind === 'fountain' || kind === 'strike') {
          if (kind === 'fountain') progress.fountain = observation.position;
          else Object.assign(progress, { dragon: observation.dragon, hits: observation.hits });
          const next = `${endFile}-${process.pid}`;
          await writeFile(next, JSON.stringify(progress));
          await rename(next, endFile);
        }
        if (kind === 'strike') {
          await narrate('Action', observation.method === 'bow'
            ? `Hit the flying dragon with an arrow. Health is ${observation.after}.`
            : `Struck the perched dragon at ${observation.before} health.`, 4_000);
        }
        if (kind === 'fall_recovery' && observation.landed) {
          await narrate('Action', 'Recovered from dragon knockback and reached the ground.');
        }
        if (kind === 'enderman_refuge') await narrate('Action', 'Used water to take cover from an attacking Enderman.');
        if (kind === 'bucket_refilled') await narrate('Action', 'Refilled a bucket from nearby water.');
        if (kind === 'health_recovered') await narrate('Result', 'Recovered enough health to return to the fight.');
        if (kind === 'victory') await narrate('Result', 'The native End exit is open.');
      };
      if (refugeOnly) await reportStatus('refuge-ready');
      const victory = fallOnly ? await replayBucketLanding(reflexes, start, report) : await fightEndDragon(action, report,
        progress, { useCarriedPickaxe: archivedEnd, nativeWaterLanding: reflexes?.waterLanding === true,
          shootWhileFlying: archivedEnd, stopAfterRefuge: refugeOnly });
      if (archive) {
        assert.equal(victory.dragon, archive.dragon, 'The controller must fight the original dragon from the crystal stage');
        await reportStatus('victory');
        await awaitNativeProof('native-end-victory', archive.dragon, 'The server did not confirm the archived dragon');
        await recallAndExitEnd(action, companion, archive.shelter, victory.portals, report);
        await narrate('Result', 'The player and the original Mushroom reached the Overworld.');
      }
    } else if (generated) {
      const observations = resume
        ? readCrystalProgress(await readFile(join(dirname(statusFile), 'actions.jsonl'), 'utf8')) : undefined;
      await clearGeneratedCrystals(action, companion, entry => reportGeneratedCrystal(entry, camp), {
        cageOnly: process.env.MUSHROOM_EXPEDITION_CAGE_ONLY === '1',
        tallestOnly: process.env.MUSHROOM_EXPEDITION_TALLEST_ONLY === '1',
        progress: observations,
      });
    } else {
      let crystal;
      for (let shot = 0; shot < 3 && !crystal; shot++) crystal = await shootEndCrystal(action, companion);
      assert.ok(crystal, 'The crystal in bow range survived all shots');
      console.log(JSON.stringify({ at: new Date().toISOString(), action: 'end_crystal_destroyed', crystal, camp, dog: companion }));
    }
  } else if (stage === 'eye-route' || stage === 'stronghold-approach') {
    companion = (await readFile(join(dirname(statusFile), 'eye-companion'), 'utf8')).trim();
    assert.ok(/^[\da-f-]{36}$/i.test(companion));
    if (stage === 'stronghold-approach') {
      await earnEyes(companion, PORTAL_POWDER);
      await followEyes(companion);
    } else await scoutByEye(action, companion, async bearing => {
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
  } else if (stage === 'quarry-iron') {
    const fixture = JSON.parse(await readFile(join(dirname(statusFile), 'quarry-iron-fixture'), 'utf8'));
    assert.ok(/^[\da-f-]{36}$/i.test(fixture.dog) && blockPosition(fixture.bed));
    companion = fixture.dog;
    const stairs = [];
    const landing = await descendQuarry(action, start, fixture.bed, stairs, new Set());
    assert.ok(blockPosition(landing), 'The opening quarry stair could not be descended');
    await earnIronKit(action, craft, { bed: fixture.bed }, { resumeQuarry: stairs, resumeQuarryLanding: landing });
    assert.ok(await climbQuarry(action, stairs[0]), 'Could not return to camp with the earned iron kit');
  } else await runExpedition(start, stage);
  await narrate('Result', 'The controller finished its stage. The game test is checking the outcome.');
  await reportStatus('finished');
} catch (error) {
  await narrate('Result', `Run ${live ? 'held' : 'stopped'}. ${error.message.split('\n')[0]}`);
  await reportStatus(live ? 'held' : 'failed');
  throw error;
}

async function runCompanionDrill(start) {
  const [uuid, errand, retreatX] = (await readFile(join(dirname(statusFile), 'defense-fixture'), 'utf8')).trim().split('\n');
  const pos = errand.trim().split(/\s+/).map(Number);
  assert.ok(/^[\da-f-]{36}$/i.test(uuid) && blockPosition(pos));
  companion = uuid;
  assert.equal(await action('go_to', { pos, stopDistance: 0.7, maxTicks: 28 }), null,
    'The proposed errand should be interrupted by danger to Mushroom');
  if (retreatX !== undefined) {
    const after = await playerAction('observe');
    assert.ok(Number.isInteger(Number(retreatX)) && after.onGround && Math.floor(after.position.x) <= Number(retreatX),
      'The companion interrupt did not move the player away from the creeper');
    await narrate('Result', 'Retreated from the creeper before trying to help the original Mushroom.');
    return;
  }
  if (process.env.MUSHROOM_EXPEDITION_DEFENSE_DISTANT === '1') {
    const firstStep = await playerAction('observe');
    assert.ok(firstStep.position.x >= start.position.x + 1,
      'The first interrupt stood still while the zombie was beside Mushroom');
    for (let attempt = 0; attempt < 20; attempt++) {
      const nearby = await playerAction('get_entities', { type: 'minecraft:zombie', radius: 24 });
      if (!nearby.entities.length) return;
      await setTimeout(250);
      await action('observe');
    }
    throw new Error('The player did not reach and kill the zombie during the defense');
  }
  for (let attempt = 0; attempt < 6; attempt++) {
    await setTimeout(250);
    const observed = await playerAction('get_entities', { type: 'minecraft:spider', radius: 8 });
    if (!observed.entities.length) return;
  }
  throw new Error('The spider was still alive after the first companion interruption');
}

async function runReunion(start) {
  const saved = JSON.parse(await readFile(join(dirname(statusFile), 'reunion-start.json'), 'utf8'));
  assert.ok(/^[\da-f-]{36}$/i.test(saved.dog) && blockPosition(saved.lastSeen) && blockPosition(saved.bed));
  companion = saved.dog;
  const waitForDaylight = () => waitForDaylightRecovery(action, saved.bed, message => narrate('Decision', message, 15_000));
  await waitForDaylight();
  await reportStatus('reunion-daylight');
  await awaitNativeProof('native-reunion-daylight', companion, 'The server did not verify a safe daylight start');
  const inventory = await action('get_inventory');
  if (!inventory.slots.some(stack => stack.id.endsWith('_sword'))) {
    await gatherStarterTools(await action('observe'), { combatOnly: true });
  }
  assert.ok(await forageExpeditionMeal(action, { toward: saved.lastSeen, minimum: 2 }),
    'Could not earn a meal to bring to the original Mushroom');
  await waitForDaylight();
  await narrate('Objective', 'Return to the last sighting with a meal reserved for Mushroom.');
  const dog = await regroupExpeditionCompanion(action, saved.dog, saved.lastSeen);
  assert.ok(await feedMushroom(saved.dog, dog.pos.map(Math.floor), 24), 'The original dog did not accept an earned meal');
  console.log(JSON.stringify({ at: new Date().toISOString(), action: 'reunion_fed', dog: saved.dog,
    lastSeen: saved.lastSeen, beforeHealth: dog.health, startedAt: start.gameTime }));
  await narrate('Result', 'Reunited with the original Mushroom and fed him.');
}

async function runExpedition(start, stage) {
  const full = stage === 'expedition';
  const findStronghold = stage === 'stronghold' || full;
  const huntBlazes = stage === 'nether-powder' || findStronghold;
  const powderNeeded = findStronghold ? STRONGHOLD_EYES : PORTAL_POWDER;
  const visitNether = stage === 'nether' || huntBlazes;
  const needsIron = stage === 'iron' || visitNether;
  const recentActions = () => readFile(join(dirname(statusFile), 'actions.jsonl'), 'utf8').catch(error => {
    if (error.code !== 'ENOENT') throw error;
    return '';
  });
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
    assert.ok(['starter', 'provision', 'camp', 'adoption', 'stone', 'iron', 'nether'].includes(checkpoint.phase)
      || huntBlazes && checkpoint.phase === 'nether-returned'
      || findStronghold && STRONGHOLD_PHASES.includes(checkpoint.phase)
      || full && END_PHASES.includes(checkpoint.phase));
    assert.ok(checkpoint.timberSite === undefined || blockPosition(checkpoint.timberSite), 'Invalid recorded timber site');
    if (checkpoint.phase === 'descend-stronghold') {
      assert.ok(blockPosition(checkpoint.surfaceFix), 'Invalid recorded Eye bearing fix');
    }
    const inEndCampaign = full && END_PHASES.includes(checkpoint.phase);
    if (inEndCampaign) {
      const expected = ['cross-end', 'end-return'].includes(checkpoint.phase) ? [OVERWORLD, END]
        : checkpoint.phase === 'home' ? [OVERWORLD] : [END];
      assert.ok(expected.includes(start.dimension), 'The End recovery requires the player in the recorded dimension');
      if (END_PHASES.indexOf(checkpoint.phase) >= END_PHASES.indexOf('end-surface')) {
        assert.ok(blockPosition(checkpoint.endCamp?.mat) && blockPosition(checkpoint.endCamp?.shelter),
          'Invalid recorded End camp');
      }
      assert.ok(checkpoint.endTrail === undefined || (Array.isArray(checkpoint.endTrail)
        && checkpoint.endTrail.length <= 48 && checkpoint.endTrail.every(blockPosition)), 'Invalid recorded End staircase');
    } else {
      assert.ok(start.dimension === OVERWORLD || checkpoint.phase === 'nether', 'Unexpected dimension before the Nether phase');
    }
    const handoffState = join(dirname(statusFile), 'live-handoff-safety');
    const worldTicks = () => readFile(handoffState, 'utf8').catch(error => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (live && await worldTicks() !== null) {
      await reportStatus('resuming');
      for (let attempt = 0; attempt < 40 && await worldTicks() !== 'running'; attempt++) {
        await setTimeout(125);
      }
      assert.equal(await worldTicks(), 'running', 'The held world has not resumed ticking');
    }
    const starterItems = ['crafting_table', 'wooden_sword', 'wooden_pickaxe'];
    if (checkpoint.phase === 'provision'
      && starterItems.some(item => !inventory.slots.some(stack => stack.id === `minecraft:${item}`))) {
      if (Number(deathAtStart.trim().split(' ').at(-1)) > checkpoint.gameTime) {
        verifiedDeathSite(start, checkpoint);
        checkpoint.phase = 'starter';
        checkpoint.gameTime = start.gameTime;
        await writeCheckpoint(checkpoint);
        console.log(JSON.stringify({ at: new Date().toISOString(), action: 'rebuild_after_early_respawn' }));
      } else {
        await gatherStarterTools(start);
      }
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
    assert.ok(checkpoint.firstIronHome === undefined || checkpoint.firstIronHome === true, 'Invalid first iron return');
    assert.ok(checkpoint.returningAfterCare === undefined || checkpoint.returningAfterCare === true,
      'Invalid care return');
    assert.ok(checkpoint.careReturnTrail === undefined
      || (checkpoint.returningAfterCare && campTrail(checkpoint.careReturnTrail)), 'Invalid archived camp trail');
    assert.ok(checkpoint.exhaustedQuarries === undefined || (Array.isArray(checkpoint.exhaustedQuarries)
      && checkpoint.exhaustedQuarries.length <= 6 && checkpoint.exhaustedQuarries.every(attempt =>
        blockPosition(attempt?.entrance) && blockPosition(attempt?.blockedAt) && /^[\da-f]{64}$/.test(attempt.footing))),
    'Invalid recorded quarry attempts');
    assert.ok(checkpoint.recoveryDestination === undefined || blockPosition(checkpoint.recoveryDestination),
      'Invalid recorded recovery destination');
    assert.ok(checkpoint.dog === undefined || /^[\da-f-]{36}$/i.test(String(checkpoint.dog)), 'Invalid recorded dog UUID');
    assert.ok(checkpoint.lastDogMealAt === undefined || (Number.isInteger(checkpoint.lastDogMealAt)
      && checkpoint.lastDogMealAt >= 0 && checkpoint.lastDogMealAt <= start.gameTime), 'Invalid recorded meal time');
    assert.ok(checkpoint.equipment === undefined || (Array.isArray(checkpoint.equipment)
      && new Set(checkpoint.equipment).size === checkpoint.equipment.length
      && checkpoint.equipment.every(item => COMPANION_WEARABLES.includes(item))), 'Invalid recorded companion equipment');
    companion = checkpoint.dog;
    await action('stop', { closeScreen: true });
    const missingGuide = !inventory.slots.some(stack => stack.id === 'mushroom_yorkie:field_guide');
    const newDeath = Number(deathAtStart.trim().split(' ').at(-1)) > checkpoint.gameTime;
    const equippedPhase = ['iron', 'nether', 'nether-returned', 'gather-eyes', 'arm-for-end', 'follow-eyes', 'descend-stronghold'].includes(checkpoint.phase);
    const lostQuarryKit = equippedPhase && newDeath
      && !inventory.slots.some(stack => stack.id === 'minecraft:stone_pickaxe')
      && !inventory.slots.some(stack => stack.id === 'minecraft:furnace');
    if ((checkpoint.phase === 'stone' || equippedPhase)
        && (checkpoint.recoveryDestination || missingGuide && (!checkpoint.recoveredWithoutGuide || newDeath) || lostQuarryKit)) {
      const destination = checkpoint.recoveryDestination ?? verifiedDeathSite(start, checkpoint);
      checkpoint.recoveryDestination = destination;
      await writeCheckpoint(checkpoint);
      const { x, y, z } = start.position;
      const longReturn = Math.hypot(destination[0] - x, destination[1] - y, destination[2] - z) > 32;
      const direct = longReturn && await daylightLoadoutIsVisible(action, start, destination);
      const provisionFirst = longReturn && !direct;
      const resumeAutoEat = provisionFirst && (await action('set_reflexes'))?.autoEat;
      if (resumeAutoEat) await action('set_reflexes', { autoEat: false });
      try {
        if (provisionFirst) {
          let player = await action('observe');
          if (await sleepNearby(action, player)) {
            await narrate('Result', 'Slept until dawn before looking for replacement tools and food.');
            player = await action('observe');
          }
          await narrate('Objective', 'Earn food for the player and Mushroom before returning from the respawn point.');
          if (!inventory.slots.some(stack => stack.id.endsWith('_sword'))) {
            const visited = [];
            const rejected = new Set();
            for (let retreat = 0; retreat < 10; retreat++) {
              if (!await retreatFromNearbyMob(action, player, visited, rejected)) break;
              player = await action('observe');
            }
            assert.ok(player.health >= 8 && !player.threats?.some(threat => threat.distance <= 3),
              'Could not reach safe ground to rebuild tools after respawn');
            await gatherStarterTools(player, { combatOnly: true, timberToward: destination });
          }
          assert.ok(await forageExpeditionMeal(action, { toward: destination, minimum: 2 }),
            'Could not find food for the player and Mushroom before the return');
          await narrate('Result', 'Packed food for the player and reserved one portion for Mushroom.');
        }
        await narrate('Objective', direct ? 'Recover the shield and guide while both are visible in daylight.'
          : 'Return to the recorded death site and collect the dropped gear.');
        console.log(JSON.stringify({ at: new Date().toISOString(), action: 'recover_dropped_loadout', destination, direct }));
        const recovered = await recoverDroppedLoadout(action, destination, {
          reserveMeal: provisionFirst, companionUuid: checkpoint.dog, direct,
          onCompanionFed: async () => {
            checkpoint.fedDog = true;
            checkpoint.lastDogMealAt = (await action('observe')).gameTime;
            await writeCheckpoint(checkpoint);
            await narrate('Result', 'Fed the injured original Mushroom before recovering the gear.');
          },
        });
        if (direct) await narrate('Result', 'Retrieved the dropped shield and equipped it.');
        checkpoint.recoveredWithoutGuide = recovered === 'companion';
        checkpoint.gameTime = (await action('observe')).gameTime;
        if (checkpoint.recoveredWithoutGuide) {
          await narrate('Result', 'Recovered the stone kit and verified the original living Mushroom at camp.');
        }
      } finally {
        if (resumeAutoEat) {
          try {
            await packRecoveryMeal(action);
          } finally {
            await action('set_reflexes', { autoEat: true });
          }
        }
      }
      delete checkpoint.quarry;
      delete checkpoint.quarryLanding;
      delete checkpoint.reenterQuarry;
      delete checkpoint.recoveryDestination;
      await writeCheckpoint(checkpoint);
    }
    await reportStatus('ready');
    console.log(JSON.stringify({ at: new Date().toISOString(), action: 'controller_reattached', phase: checkpoint.phase }));
  } else if (process.env.MUSHROOM_EXPEDITION_RESTORE_MANIFEST) {
    const restored = JSON.parse(await readFile(join(dirname(statusFile), 'restored-checkpoint.json'), 'utf8'));
    assert.ok(needsIron && start.dimension === OVERWORLD && /^[\da-f-]{36}$/i.test(restored.dog));
    assert.ok(blockPosition(restored.camp?.bed) && blockPosition(restored.camp?.table));
    checkpoint = { owner: start.name, gameTime: start.gameTime, bridgeFingerprint, stage, phase: 'iron',
      camp: restored.camp, dog: restored.dog, fedDog: false };
    if (restored.ironProgress) {
      const { quarry, quarryLanding, lastDogMealAt, returningAfterCare, careReturnTrail } = restored.ironProgress;
      assert.ok(Number.isInteger(lastDogMealAt) && lastDogMealAt >= 0 && lastDogMealAt <= start.gameTime,
        'Invalid archived companion meal time');
      if (returningAfterCare === true) {
        assert.ok(campTrail(careReturnTrail), 'Invalid archived camp trail');
        Object.assign(checkpoint, { returningAfterCare, careReturnTrail });
      } else {
        assert.ok(Array.isArray(quarry) && quarry.length > 0 && quarry.length <= 44 && quarry.every(blockPosition)
          && blockPosition(quarryLanding), 'Invalid archived quarry route');
        Object.assign(checkpoint, { quarry, quarryLanding });
      }
      Object.assign(checkpoint, { lastDogMealAt, fedDog: true });
    }
    companion = checkpoint.dog;
    if (live) await writeCheckpoint(checkpoint);
    console.log(JSON.stringify({ at: new Date().toISOString(), action: 'controller_restored_save', assisted: true,
      dog: checkpoint.dog, phase: checkpoint.phase }));
  } else {
    assert.equal(inventory.slots.length, 0, 'Expected an empty expedition inventory');
    checkpoint = { owner: start.name, gameTime: start.gameTime, bridgeFingerprint, stage, phase: 'starter' };
    if (live) await writeCheckpoint(checkpoint);
  }
  await action('set_reflexes', { chargeRanged: false });
  if (checkpoint.phase === 'starter') {
    await narrate('Objective', 'Collect wood and make the starter tools.');
    await gatherStarterTools(start);
    const { x, y, z } = (await action('observe')).position;
    checkpoint.timberSite = [x, y, z].map(Math.floor);
    // Take the bed materials before leaving the timber area for sheep.
    await ensurePlanks(action, craft, 3, checkpoint.timberSite);
    checkpoint.phase = 'provision';
    if (live) await writeCheckpoint(checkpoint);
  }
  if (checkpoint.phase === 'provision') {
    await narrate('Objective', 'Find a sheltered bed, or gather wool to make one.');
    const observedTrail = resume ? groundedScoutingTrail(await recentActions()) : undefined;
    checkpoint.camp = await prepareAdoptionCamp(action, craft, descendFromCanopy,
      { ...policy, observedTrail, timberSite: checkpoint.timberSite });
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
    checkpoint.fedDog = await feedMushroom(checkpoint.dog, checkpoint.camp.bed, stage === 'adoption' ? 120 : 24);
    if (checkpoint.fedDog) checkpoint.lastDogMealAt = (await action('observe')).gameTime;
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
    if (live && needsIron) await writeCheckpoint(checkpoint);
  }
  if (needsIron && checkpoint.phase === 'iron') {
    if (checkpoint.fedDog === false && !checkpoint.quarry?.length) {
      const player = await action('observe');
      if (player?.onGround && !player.inWater) {
        await narrate('Objective', 'Offer the original Mushroom our food before leaving for iron.');
        checkpoint.fedDog = await feedMushroom(checkpoint.dog,
          [player.position.x, player.position.y, player.position.z].map(Math.floor), 24)
          || await feedMushroom(checkpoint.dog, checkpoint.camp.bed, 48);
        if (checkpoint.fedDog) {
          checkpoint.lastDogMealAt = (await action('observe')).gameTime;
          await narrate('Result', 'The original Mushroom ate one portion.');
          if (live) await writeCheckpoint(checkpoint);
        }
      }
    }
    policy.reserveCompanionMeal = true;
    policy.scoutNewGround = resume && !checkpoint.quarry?.length;
    let lastCompanionPosition;
    const regroup = async () => {
      const trail = companionRegroupTrail(await recentActions(), checkpoint.dog);
      const together = await regroupExpeditionCompanion(action, checkpoint.dog, lastCompanionPosition, trail);
      lastCompanionPosition = together.pos;
      console.log(JSON.stringify({ at: new Date().toISOString(), action: 'companion_regrouped',
        dog: together.uuid, position: together.pos, health: together.health, distance: together.distance }));
      await narrate('Result', 'The original Mushroom is nearby on reachable footing.');
    };
    policy.checkCompanion = async (player, canRegroup) => {
      const dogs = await action('get_entities', { type: 'mushroom_yorkie:mushroom_yorkie', radius: 32 });
      const dog = dogs?.entities.find(entity => entity.uuid === checkpoint.dog);
      if (dog?.health > 0) lastCompanionPosition = dog.pos;
      if (canRegroup && (!dog || dog.distance > 16 || Math.abs(dog.pos[1] - player.position.y) > 5)) {
        await narrate('Decision', 'Pause mining and regroup with the original Mushroom.');
        await regroup();
        return 'regrouped';
      }
      if (dog?.health > 0 && (dog.health <= 8
        || player.gameTime - (checkpoint.lastDogMealAt ?? checkpoint.gameTime) >= DOG_MEAL_INTERVAL)) return 'care';
      return null;
    };
    const regroupForCare = async player => {
      const nearby = await action('get_entities', { type: 'mushroom_yorkie:mushroom_yorkie', radius: 32 });
      const dog = nearby?.entities.find(entity => entity.uuid === checkpoint.dog && entity.health > 0);
      if (dog) lastCompanionPosition = dog.pos;
      if (dog?.distance <= 10 && Math.abs(dog.pos[1] - player.position.y) <= 4) return false;
      await narrate('Decision', 'Mushroom is too far away to forage together. Regrouping before searching for food.', 10_000);
      await regroup();
      return true;
    };
    const companionForage = {
      regroup: regroupForCare,
      restUntilDaylight: async () => {
        await narrate('Decision', 'It is night and Mushroom keeps falling behind. Seeking cover until daylight.');
        await waitForDaylightRecovery(action, checkpoint.camp.bed, message => narrate('Decision', message));
      },
    };
    policy.tendCompanion = async ({ inQuarry = false } = {}) => {
      if (inQuarry) {
        await narrate('Objective', 'Offer Mushroom a carried meal at the quarry landing.');
      } else {
        await narrate('Objective', 'Pause the iron search and feed the original Mushroom.');
        await regroupForCare(await action('observe'));
        assert.ok(await forageExpeditionMeal(action, companionForage),
          'Could not gather a meal near the original dog');
      }
      const player = await action('observe');
      const fed = await feedMushroom(checkpoint.dog,
        [player.position.x, player.position.y, player.position.z].map(Math.floor), inQuarry ? 1 : 30, { inPlace: inQuarry });
      if (inQuarry && !fed) return undefined;
      assert.ok(fed, 'Could not feed the original dog before returning to the quarry');
      checkpoint.fedDog = true;
      const afterMeal = await action('observe');
      checkpoint.lastDogMealAt = afterMeal.gameTime;
      const dogs = await action('get_entities', { type: 'mushroom_yorkie:mushroom_yorkie', radius: 24 });
      const dog = dogs?.entities.find(entity => entity.uuid === checkpoint.dog);
      const returnToCamp = afterMeal.timeOfDay >= 10_500 || afterMeal.health < 14 || !(dog?.health >= 9);
      if (returnToCamp) checkpoint.returningAfterCare = true;
      if (live) await writeCheckpoint(checkpoint);
      await narrate('Result', 'The original Mushroom ate one portion.'
        + (returnToCamp ? ' Returning to camp.' : ' Continuing from here.'));
      return returnToCamp;
    };
    policy.returnAfterCare = async () => {
      const bed = checkpoint.camp.bed;
      const trace = await recentActions();
      const trail = checkpoint.careReturnTrail ?? campOutboundTrail(trace, bed);
      await narrate('Objective', 'Get the original Mushroom safely back to camp before looking for more iron.');
      const { owner, dog } = await returnToCampWithCompanion(action, checkpoint.dog, bed, trail, {
        report: message => narrate('Decision', message, 15_000),
        regroupTrail: companionRegroupTrail(trace, checkpoint.dog),
      });
      delete checkpoint.returningAfterCare;
      delete checkpoint.careReturnTrail;
      if (live) await writeCheckpoint(checkpoint);
      console.log(JSON.stringify({ at: new Date().toISOString(), action: 'companion_care_return',
        dog: dog.uuid, dogHealth: dog.health, dogPosition: dog.pos, player: owner.position, camp: bed }));
      await narrate('Result', 'The player and the original living Mushroom reached the camp bed.');
    };
    if (live) {
      policy.resumeQuarry = checkpoint.quarry;
      policy.resumeQuarryLanding = checkpoint.quarryLanding;
      policy.reenterQuarry = checkpoint.reenterQuarry === true;
      policy.exhaustedQuarries = checkpoint.exhaustedQuarries;
      policy.saveExhaustedQuarries = async attempts => {
        checkpoint.exhaustedQuarries = attempts;
        await writeCheckpoint(checkpoint);
      };
      policy.saveQuarry = async (stairs, landing, reenter = false) => {
        checkpoint.quarry = stairs;
        checkpoint.quarryLanding = landing;
        if (reenter) checkpoint.reenterQuarry = true;
        else delete checkpoint.reenterQuarry;
        await writeCheckpoint(checkpoint);
      };
    }
    if (!checkpoint.firstIronHome) {
      policy.bringFirstIronHome = async () => {
        await narrate('Objective', 'Bring the first mined iron back to camp with Mushroom.');
        const trace = await recentActions();
        const bed = checkpoint.camp.bed;
        const trail = campOutboundTrail(trace, bed, { beforeIron: true });
        const { owner, dog } = await returnToCampWithCompanion(action, checkpoint.dog, bed, trail, {
          report: message => narrate('Decision', message, 15_000),
          regroupTrail: companionRegroupTrail(trace, checkpoint.dog),
        });
        const stock = await action('get_inventory');
        const rawIron = stock.slots.filter(stack => stack.id === 'minecraft:raw_iron')
          .reduce((total, stack) => total + stack.count, 0);
        assert.ok(rawIron > 0, 'The first raw iron must still be in the player inventory at camp');
        checkpoint.firstIronHome = true;
        if (live) await writeCheckpoint(checkpoint);
        console.log(JSON.stringify({ at: new Date().toISOString(), action: 'first_iron_home',
          rawIron, dog: checkpoint.dog, dogHealth: dog.health, dogPosition: dog.pos,
          player: owner.position, camp: checkpoint.camp.bed, gameTime: owner.gameTime }));
        await narrate('Result', 'Returned to the bed with the first raw iron and the original living Mushroom.');
      };
    }
    const restoreAutoEat = (await action('set_reflexes'))?.autoEat;
    if (restoreAutoEat) await action('set_reflexes', { autoEat: false });
    try {
      if (!checkpoint.returningAfterCare && !checkpoint.quarry?.length) {
        const companionStatus = await policy.checkCompanion(await action('observe'), true);
        const miner = await action('observe');
        const minimum = (miner.health >= 16 && miner.food >= 18 ? 1 : 2)
          + Number(companionStatus === 'care');
        if (dogMealCount(await action('get_inventory')) < minimum) {
          await narrate('Objective', 'Gather food for the quarry and reserve a portion for Mushroom.');
          assert.ok(await forageExpeditionMeal(action, { ...companionForage, toward: checkpoint.camp.bed, minimum }),
            'Could not stock provisions before mining');
        }
        const stoneKit = await action('get_inventory');
        if (!['minecraft:stone_pickaxe', 'minecraft:furnace']
          .every(item => stoneKit.slots.some(stack => stack.id === item))) {
          await narrate('Objective', 'Rebuild the missing stone pickaxe or furnace before looking for iron.');
          await gatherStarterTools(await action('observe'));
          const table = await placeBeside(action, 'minecraft:crafting_table');
          await earnStoneKit(action, craft, { table, bed: checkpoint.camp.bed });
          await narrate('Result', 'Rebuilt the quarry kit with ordinary Survival materials.');
        }
      }
      if (!checkpoint.quarry?.length && checkpoint.fedDog === false) await policy.tendCompanion();
      if (!checkpoint.returningAfterCare) {
        if (policy.scoutNewGround) await policy.reportScouting('Leaving the previous quarry area to look for exposed iron.');
        await narrate('Objective', 'Mine and smelt iron for a pickaxe, bucket, and shield.');
      }
      await earnIronKit(action, craft, checkpoint.camp,
        { ...policy, returningAfterCare: checkpoint.returningAfterCare, reserveIgnitionIron: visitNether,
          makeIronSword: huntBlazes, extraEndBucket: findStronghold });
    } finally {
      if (restoreAutoEat) {
        try {
          await packRecoveryMeal(action);
        } finally {
          await action('set_reflexes', { autoEat: true });
        }
      }
    }
  }
  if (checkpoint.fedDog === false) {
    await narrate('Objective', 'Find a meal for the original Mushroom.');
    assert.ok(await forageExpeditionMeal(action), 'Could not earn a meal for the original dog');
    const player = await action('observe');
    const position = [player.position.x, player.position.y, player.position.z].map(Math.floor);
    assert.ok(await feedMushroom(checkpoint.dog, position), 'Could not feed the original dog before finishing');
    checkpoint.fedDog = true;
    checkpoint.lastDogMealAt = (await action('observe')).gameTime;
    if (live) await writeCheckpoint(checkpoint);
  }
  const returnedFromNether = ['nether-returned', ...STRONGHOLD_PHASES, ...END_PHASES].includes(checkpoint.phase);
  if (visitNether && !returnedFromNether) {
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
    await narrate('Objective', huntBlazes
      ? 'Find a fortress, shelter Mushroom, and earn blaze rods for the stronghold supply.'
      : 'Make a dry Nether round trip with Mushroom.');
    const work = huntBlazes ? exit => bringBlazeRods(checkpoint.dog, exit, powderNeeded) : undefined;
    await netherRoundTrip(action, checkpoint.dog, hold, () => prepareNetherPortal(action, craft, checkpoint.camp), start.dimension, work);
    if (huntBlazes) {
      checkpoint.phase = 'nether-returned';
      if (live) await writeCheckpoint(checkpoint);
    }
  }
  if (huntBlazes && checkpoint.phase === 'nether-returned') {
    await narrate('Objective', 'Craft the portal supply of blaze powder back in the Overworld.');
    await craftBlazePowder(action, craft, powderNeeded);
    if (findStronghold) {
      checkpoint.phase = 'gather-eyes';
      if (live) await writeCheckpoint(checkpoint);
    }
  }
  if (findStronghold && checkpoint.phase === 'gather-eyes') {
    await narrate('Objective', 'Shelter Mushroom and earn the Eyes of Ender for scouting and the portal.');
    await earnEyes(checkpoint.dog, STRONGHOLD_EYES);
    checkpoint.phase = 'arm-for-end';
    if (live) await writeCheckpoint(checkpoint);
  }
  if (findStronghold && checkpoint.phase === 'arm-for-end') {
    await narrate('Objective', 'Earn a durable bow, ammunition, two water buckets and cooked rations for the End.');
    if (full) await prepareCompanionGear(action, craft, checkpoint.dog, checkpoint.equipment);
    await prepareEndCombatKit(action, craft, checkpoint.dog, reportEndKit);
    checkpoint.phase = 'follow-eyes';
    if (live) await writeCheckpoint(checkpoint);
  }
  if (findStronghold && checkpoint.phase === 'follow-eyes') {
    await narrate('Objective', 'Follow the earned Eyes of Ender to the stronghold with the original Mushroom.');
    const estimate = await followEyes(checkpoint.dog);
    const atSurface = await action('observe');
    checkpoint.surfaceFix = [estimate.x, atSurface.position.y, estimate.z].map(Math.floor);
    checkpoint.phase = 'descend-stronghold';
    if (live) await writeCheckpoint(checkpoint);
  }
  let ring;
  if (findStronghold && checkpoint.phase === 'descend-stronghold') {
    await narrate('Objective', 'Find a safe way down from the Eye bearings and lead Mushroom to the portal room.');
    await descendToStronghold(action, checkpoint.dog, checkpoint.surfaceFix, reportStrongholdEntry);
    ring = await findStrongholdPortalRoom(action, checkpoint.dog, reportStrongholdEntry);
    if (full) {
      checkpoint.phase = 'cross-end';
      if (live) await writeCheckpoint(checkpoint);
    }
  }
  if (full) await finishExpeditionInEnd(checkpoint, ring);
}

async function finishExpeditionInEnd(checkpoint, observedRing) {
  const uuid = checkpoint.dog;
  const save = async () => {
    if (live) await writeCheckpoint(checkpoint);
  };
  const next = async phase => {
    checkpoint.phase = phase;
    await save();
  };
  if (checkpoint.phase === 'cross-end') {
    await narrate('Objective', 'Activate the generated End portal and bring the original Mushroom through.');
    if ((await action('observe')).dimension !== END) {
      const ring = observedRing ?? await findStrongholdPortalRoom(action, uuid, reportStrongholdEntry);
      await crossEndPortal(action, craft, uuid, ring);
    }
    await next('end-camp');
  }
  if (checkpoint.phase === 'end-camp') {
    checkpoint.endCamp = await shelterAtEndArrival(action, uuid, reportEndCamp);
    await next('end-surface');
  }
  if (checkpoint.phase === 'end-surface') {
    checkpoint.endTrail ??= [];
    await reachEndIslandSurface(action, checkpoint.endCamp, reportEndCamp, checkpoint.endTrail, save);
    await next('end-crystals');
  }
  if (checkpoint.phase === 'end-crystals') {
    await narrate('Objective', 'Clear the generated crystals while Mushroom stays under cover.');
    const prior = resume
      ? readCrystalProgress(await readFile(join(dirname(statusFile), 'actions.jsonl'), 'utf8')) : undefined;
    const crystals = await clearGeneratedCrystals(action, uuid,
      entry => reportGeneratedCrystal(entry, checkpoint.endCamp.mat), { progress: prior });
    const center = [0, 2].map(axis => Math.round(crystals.reduce((sum, crystal) => sum + crystal.pos[axis], 0) / crystals.length));
    checkpoint.dragonProgress = { fountain: [center[0], Math.floor((await action('observe')).position.y), center[1]] };
    await next('end-dragon');
  }
  const reportFight = async (kind, observation) => {
    console.log(JSON.stringify({ at: new Date().toISOString(), action: `dragon_${kind}`, observation, dog: uuid }));
    if (kind === 'fountain') checkpoint.dragonProgress.fountain = observation.position;
    if (kind === 'strike') Object.assign(checkpoint.dragonProgress, { dragon: observation.dragon, hits: observation.hits });
    if (kind === 'strike' || kind === 'fountain') await save();
    if (kind === 'victory') await narrate('Result', 'The native End exit is open.');
  };
  if (checkpoint.phase === 'end-dragon') {
    await narrate('Objective', 'Fight the original dragon with the earned gear and keep Mushroom at camp.');
    const reflexes = await action('set_reflexes', { autoDefend: false, waterLanding: true });
    checkpoint.victory = await fightEndDragon(action, reportFight, checkpoint.dragonProgress,
      { nativeWaterLanding: reflexes?.waterLanding === true, shootWhileFlying: true });
    await next('end-return');
  }
  if (checkpoint.phase === 'end-return') {
    if ((await action('observe')).dimension === END) {
      await reportStatus('victory');
      await awaitNativeProof('native-end-victory', checkpoint.victory.dragon, 'The server did not confirm the final dragon');
      await recallAndExitEnd(action, uuid, checkpoint.endCamp.shelter, checkpoint.victory.portals, reportFight, checkpoint.endTrail);
    }
    await withCompanion(action, OVERWORLD, uuid);
    await narrate('Result', 'Returned to the Overworld with the original living Mushroom after the dragon fight.');
    await next('home');
  }
  assert.equal(checkpoint.phase, 'home', 'The full expedition must finish in the Overworld');
}

async function reportEndKit(kind, observation) {
  console.log(JSON.stringify({ at: new Date().toISOString(), action: `end_kit_${kind}`, observation, dog: companion }));
  if (kind === 'packed') await narrate('Result', 'Packed the bow, arrows, rations and two filled buckets.');
}

async function reportGeneratedCrystal({ crystal, position, destroyed, openedCage, highArc, confirmedMissing }, camp) {
  const type = openedCage ? 'generated_cage_opened' : confirmedMissing ? 'generated_crystal_absence' : 'generated_crystal_shot';
  console.log(JSON.stringify({ at: new Date().toISOString(), action: type,
    crystal: crystal.uuid, target: crystal.pos, position, destroyed, openedCage, highArc, camp, dog: companion }));
  if (openedCage) await narrate('Result', 'Opened a crystal cage and descended to the ground.');
  if (destroyed) await narrate('Result', 'A generated End crystal broke.');
  if (confirmedMissing) await narrate('Result', 'Confirmed the previously observed crystal is gone from its loaded tower.');
}

async function reportEndCamp(kind, observation) {
  console.log(JSON.stringify({ at: new Date().toISOString(), action: `end_camp_${kind}`, observation, dog: companion }));
  if (kind === 'sheltered') await narrate('Result', 'Marked the mat and settled the original Mushroom under cover.');
  if (kind === 'surface') await narrate('Result', 'Reached exposed End stone by walking a staircase from camp.');
  if (kind === 'camp_returned') await narrate('Result', 'Walked the same staircase back to Mushroom’s shelter.');
}

async function reportStrongholdEntry(kind, observation) {
  console.log(JSON.stringify({ at: new Date().toISOString(), action: `stronghold_${kind}`, observation }));
  if (kind === 'descent') await narrate('Result', 'Reached the stronghold masonry with the original Mushroom.');
  if (kind === 'portal_room') await narrate('Result', 'Reached a dry stance beside the generated End portal.');
}

async function earnEyes(uuid, total) {
  const needed = Math.max(0, total - enderEyeCount(await action('get_inventory')));
  if (needed) {
    await earnEnderPearls(action, uuid, needed, async (kind, observation) => {
      console.log(JSON.stringify({ at: new Date().toISOString(), action: `pearl_${kind}`, observation }));
      if (kind === 'camp') await narrate('Decision', 'Mushroom is staying at camp while the player looks for an Enderman.');
    });
    await craftEyes(action, craft, total);
  }
  assert.ok(enderEyeCount(await action('get_inventory')) >= total, 'The player did not craft enough Eyes of Ender');
}

async function followEyes(uuid) {
  return navigateToStronghold(action, uuid, async (kind, observation) => {
    console.log(JSON.stringify({ at: new Date().toISOString(), action: `stronghold_${kind}`, observation }));
    if (kind === 'fix') await narrate('Decision',
      `The bearings cross near ${Math.round(observation.x)}, ${Math.round(observation.z)}. Walking there with Mushroom.`);
  });
}

async function bringBlazeRods(uuid, exit, neededPowder) {
  const powder = blazePowderCount(await action('get_inventory'));
  const wantedRods = Math.max(0, Math.ceil((neededPowder - powder) / 2));
  if (!wantedRods) return;
  const reflexes = await action('set_reflexes');
  await action('set_reflexes', { autoDefend: false, chargeRanged: false });
  try {
    const mat = await earnBlazeRods(action, uuid, exit, wantedRods);
    console.log(JSON.stringify({ at: new Date().toISOString(), action: 'blaze_rod_earned', dog: uuid, wantedRods, mat }));
  } finally {
    if (reflexes) {
      await action('set_reflexes', { autoDefend: reflexes.autoDefend, chargeRanged: reflexes.chargeRanged });
    }
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

async function awaitNativeProof(file, expected, failure) {
  const verified = join(dirname(statusFile), file);
  for (let attempt = 0; attempt < 60; attempt++) {
    const result = await readFile(verified, 'utf8').catch(error => {
      if (error.code === 'ENOENT') return '';
      throw error;
    });
    if (result === expected) return;
    await setTimeout(200);
  }
  throw new Error(failure);
}

async function replayBucketLanding(reflexes, start, report) {
  assert.equal(reflexes?.waterLanding, true, 'This replay needs the native bucket landing reflex');
  await hold(action, 'minecraft:water_bucket');
  await reportStatus('fall-ready');
  const center = [start.position.x, start.position.y, start.position.z].map(Math.floor);
  const waterScan = { blocks: ['water'], center, radius: 3, max: 64 };
  const waterBlocks = scan => scan?.matches.find(group => group.name === 'minecraft:water')?.positions ?? [];
  let fromY;
  for (let attempt = 0; attempt < 240; attempt++) {
    const player = await action('observe');
    if (player?.inWorld && player.position.y >= start.position.y + 45) {
      fromY = Math.max(fromY ?? player.position.y, player.position.y);
    }
    if (fromY && player?.inWater && player.health >= 15) {
      const allWater = waterBlocks(await action('scan_blocks', waterScan));
      if (allWater.length < 2) {
        await setTimeout(100);
        continue;
      }
      const scan = await action('scan_blocks', { ...waterScan, waterSourcesOnly: true });
      assert.equal(scan?.waterSourcesOnly, true, 'The bridge did not apply native source filtering');
      const sources = waterBlocks(scan);
      assert.deepEqual(sources, [center], 'Only the bucket source should survive filtering');
      await report('water_source_scan', { source: center, flowingBlocks: allWater.length - sources.length });
      await report('fall_recovery', { launchY: fromY, groundY: player.position.y, landed: true, inWater: true });
      return;
    }
    await setTimeout(75);
  }
  throw new Error('The native bucket landing did not occur');
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

async function collectStarterLogs(start, toward) {
  const scanArgs = {
    blocks: WOOD_LOGS,
    radius: 16,
    max: 48,
  };
  let positionAtStart = start;
  let trunk;
  const visited = [];
  const rejected = new Set();
  for (let step = 0; step < 70; step++) {
    // The walker can reach the horizontal target before stepping down lands.
    for (let settle = 0; positionAtStart?.inWorld && !positionAtStart.onGround
      && !positionAtStart.inWater && !positionAtStart.dead && positionAtStart.health >= 8 && settle < 8; settle++) {
      await setTimeout(125);
      positionAtStart = await action('observe');
    }
    assert.ok(positionAtStart?.onGround && !positionAtStart.dead && positionAtStart.health >= 8,
      'Could not scout for wood safely');
    const scan = await action('scan_blocks', scanArgs);
    trunk = nearbyTrunk(scan.matches, positionAtStart.position);
    if (trunk?.distance <= 6) break;
    const lower = await descendFromCanopy(positionAtStart);
    if (lower) {
      positionAtStart = lower;
      continue;
    }
    if (step === 0) await narrate('Decision', 'Scout dry ground for a tree before crafting.');
    if (!await retreatFromNearbyMob(action, positionAtStart, visited, rejected)) {
      const { x, y, z } = positionAtStart.position;
      visited.push([x, y, z].map(Math.floor));
      let target = trunk?.logs[0] ?? toward;
      if (!target) {
        const wider = await action('scan_blocks', { ...scanArgs, radius: 32, max: 192 });
        const matches = wider?.matches ?? [];
        target = nearbyTrunk(matches, positionAtStart.position)?.logs[0];
        if (!target) {
          target = matches.flatMap(match => match.positions)
            .sort((a, b) => Math.hypot(a[0] - x, a[2] - z) - Math.hypot(b[0] - x, b[2] - z))[0];
        }
      }
      await stepOut(action, positionAtStart, visited, target, 'surface', rejected);
    }
    positionAtStart = await action('observe');
  }
  assert.ok(trunk?.distance <= 6, 'No usable tree trunk reached during the Survival scout');
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

async function packStarterTable(pos) {
  let removed = await breakVisible(action, pos);
  if (!removed?.broken) {
    const { position } = await action('observe');
    const [x, y, z] = pos;
    // An uphill corner can hide the center while the top is visible. A
    // hanging log can hide the top while leaving the near face reachable.
    const near = (player, block) => Math.max(block + 0.02, Math.min(player, block + 0.98));
    const visibleFaces = [[x + 0.5, y + 0.98, z + 0.5],
      [near(position.x, x), y + 0.55, near(position.z, z)]];
    for (const [tx, ty, tz] of visibleFaces) {
      const dx = tx - position.x;
      const dy = ty - position.y - 1.62;
      const dz = tz - position.z;
      removed = await breakVisible(action, pos, {
        yaw: Math.atan2(-dx, dz) * 180 / Math.PI,
        pitch: -Math.atan2(dy, Math.hypot(dx, dz)) * 180 / Math.PI,
      });
      if (removed?.broken) break;
    }
  }
  assert.ok(removed?.broken, 'Could not pack up the crafting table');
  await setTimeout(400);
  const hasTable = stock => stock.slots.some(stack => stack.id === 'minecraft:crafting_table');
  if (hasTable(await action('get_inventory'))) return;
  const approach = await action('go_to', { pos, stopDistance: 0.3, maxTicks: 55 });
  const overhead = [pos[0], pos[1] + 1, pos[2]];
  if (approach?.reason?.includes(`at ${overhead.join(',')} (head)`)) {
    const view = await action('get_blocks', { center: overhead, size: [1, 1, 1], format: 'json' });
    if (WOOD_LOGS.includes(view?.cells[0]?.b.replace(/^minecraft:/, ''))
        && (await breakVisible(action, overhead))?.broken) {
      await walk(pos, 0.3);
    }
  }
  await setTimeout(400);
  if (hasTable(await action('get_inventory'))) return;

  // The dropped table can roll off the tile where it was placed.
  for (let attempt = 0; attempt < 3; attempt++) {
    const drops = await action('get_entities', { type: 'item', radius: 8 });
    const table = drops?.entities.find(entity => entity.item?.id === 'minecraft:crafting_table');
    if (!table) break;
    await action('go_to', { entityId: table.id, stopDistance: 0.3, maxTicks: 55 });
    await setTimeout(400);
    if (hasTable(await action('get_inventory'))) return;
  }
  await narrate('Decision', 'The table drop is out of reach. Make a replacement with earned planks.');
  await ensurePlanks(action, craft, 4);
  await craft('crafting_table', 1);
}

async function gatherStarterTools(start, { combatOnly = false, timberToward } = {}) {
  const stock = await action('get_inventory');
  const amount = item => stock.slots.reduce((total, stack) => total + (stack.id === item ? stack.count : 0), 0);
  const tools = [['wooden_pickaxe', 3, 2], ['wooden_sword', 2, 1], ['wooden_shovel', 1, 2]]
    .filter(([item]) => !combatOnly || item === 'wooden_sword')
    .filter(([item]) => !amount(`minecraft:${item}`));
  const needsTable = !amount('minecraft:crafting_table');
  if (!tools.length && needsTable) {
    const { x, y, z } = (await action('observe')).position;
    const center = [x, y, z].map(Math.floor);
    const area = await action('get_blocks', { center, size: [7, 5, 7], format: 'json' });
    const table = area?.cells.find(cell => cell.b === 'minecraft:crafting_table'
      && Math.hypot(cell.x + 0.5 - x, cell.y - y, cell.z + 0.5 - z) <= 2);
    if (table) {
      await packStarterTable([table.x, table.y, table.z]);
      return;
    }
  }
  const sticksNeeded = tools.reduce((total, [, , cost]) => total + cost, 0) - amount('minecraft:stick');
  const stickBatches = Math.max(0, Math.ceil(sticksNeeded / 4));
  const planks = tools.reduce((total, [, cost]) => total + cost, 0) + (needsTable ? 4 : 0) + stickBatches * 2;
  if (!planks) return;

  const hasWood = stock.slots.some(stack => /_(?:log|planks)$/.test(stack.id));
  if (!hasWood) await collectStarterLogs(start, timberToward);
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
  const pos = await placeBeside(action, 'minecraft:crafting_table');
  const opened = await action('interact_block', { pos });
  assert.equal(opened?.screenOpened, 'CraftingScreen');
  for (const [item] of tools) await craft(item, 1);
  await action('stop', { closeScreen: true });
  await packStarterTable(pos);
}
