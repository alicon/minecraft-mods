'use strict';

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { setTimeout: wait } = require('node:timers/promises');
const { withBridgeLock } = require('./bridge-lock');
const { provenance } = require('./bridge-provenance');
const { driveClientInput } = require('./client-input');
const { runCases } = require('./scenario-runner');
const { captureMatrixFailure } = require('./yorkie-failure-capture');
const { assertInspectionWorld } = require('./yorkie-post-run');
const { assertLivingTestOwner } = require('./yorkie-world');

const DOG = 'mushroom_yorkie:mushroom_yorkie';
const BALL = 'mushroom_yorkie:yorkie_ball';
const TREAT = 'mushroom_yorkie:yorkie_treat';
const FEED_AT_HUNGER = 40;

function phaseAt(time) {
  if (time >= 12000 && time < 23000) return time >= 13500 ? 'sleep' : 'return';
  return time < 11500 || time >= 23000 ? 'walk' : 'dusk';
}

async function runDaycare(baseUrl, args) {
  assert(/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(baseUrl), 'Daycare requires a loopback bridge');
  const seconds = Number(args.seconds ?? 1800);
  assert(Number.isInteger(seconds) && seconds >= 90 && seconds <= 28800, '--seconds must be an integer from 90 to 28800');
  const runId = randomUUID().slice(0, 8);
  const reportFile = args.reportFile || `build/playtest-reports/java-daycare-${runId}.json`;
  assert(!fs.existsSync(reportFile), 'Use a new report path to preserve earlier evidence');
  return withBridgeLock(baseUrl, async () => {
    const abort = new AbortController();
    const interrupt = () => abort.abort();
    process.once('SIGINT', interrupt);
    process.once('SIGTERM', interrupt);
    try {
      return await runInWorld(baseUrl, args.expectedSave, seconds, runId, reportFile, args.clientLog, abort.signal);
    } finally {
      process.removeListener('SIGINT', interrupt);
      process.removeListener('SIGTERM', interrupt);
    }
  });
}

async function runInWorld(baseUrl, expectedSave, seconds, runId, reportFile, clientLog, signal) {
  async function request(route, body) {
    try {
      const response = await fetch(baseUrl + route, {
        method: body ? 'POST' : 'GET',
        headers: body ? { 'content-type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15000)
      });
      const data = await response.json();
      assert(response.ok && data.ok !== false, `${route}: ${JSON.stringify(data)}`);
      require('./command-result').checkCommandParsed(data);
      return data;
    } catch (error) {
      throw Object.assign(new Error(`Bridge could not complete ${route}: ${error.message}`, { cause: error }), { phase: 'observation' });
    }
  }
  const state = () => request('/state');
  const initial = await state();
  assertLivingTestOwner(initial, expectedSave);
  const actor = initial.players[0];
  const { savePath } = initial;
  const context = { state, request, expectedSave, playerUuid: actor.uuid, runId };
  assertInspectionWorld(initial, context);
  assert(/^[A-Za-z0-9_]{1,16}$/.test(actor.name), 'Unexpected test player name');
  const player = actor.name;
  const x = Math.floor(actor.position.x);
  const z = Math.floor(actor.position.z) + 80;
  const y = 220;
  const home = z + 0.5;
  const dogId = actor.nearbyEntities.find(entity => entity.type === DOG && entity.tameable?.ownedByPlayer)?.uuid;
  const label = JSON.stringify(`Daycare ${runId}`);
  const item = BALL + "[minecraft:custom_name='" + label + "']";

  async function command(text, allowNoChange = false) {
    const data = await request('/command', { command: text });
    assert(data.success !== false || allowNoChange && data.result === 0, `${text}: ${JSON.stringify(data)}`);
    return data.result;
  }

  const countBall = () => command(`clear ${player} ${item} 0`, true);
  async function observe() {
    const snapshot = await state();
    assertInspectionWorld(snapshot, context);
    assert.equal(snapshot.savePath, savePath, 'Test world path changed');
    const owner = snapshot.players[0];
    const dog = owner.nearbyEntities.find(entity => entity.uuid === dogId);
    assert(owner.health > 0, 'Test owner died');
    assert(dog?.health > 0 && dog.tameable.ownedByPlayer && dog.custom.harness, 'Original owned, harnessed dog is missing');
    return { owner, dog, tick: BigInt(snapshot.overworldGameTime) };
  }

  async function eventually(observation, message) {
    for (let deadline = performance.now() + 15000; performance.now() < deadline;) {
      signal.throwIfAborted();
      const result = await observation();
      if (result) return result;
      await wait(300, undefined, { signal });
    }
    throw Error(message);
  }

  async function walkToward(target) {
    const { owner } = await observe();
    const start = owner.positionPrecise;
    const direction = start.z > target ? 180 : 0;
    await command(`rotate ${player} ${direction} 0`);
    const ticks = Math.min(55, Math.max(2, Math.floor(Math.abs(start.z - target) / 0.23)));
    try {
      const input = await driveClientInput(context, { mode: 'walk', ticks, forward: true }, { signal });
      const end = input.after.players[0].positionPrecise;
      assert(Math.abs(end.z - target) < Math.abs(start.z - target), `Walk from ${start.z} to ${end.z} did not approach ${target}`);
      assert(end.z >= z - 4 && end.z <= z + 41 && end.y >= y - 0.1, 'Native walk left the test course');
      return { start, end, ticks };
    } catch (error) {
      error.phase ??= 'input';
      throw error;
    }
  }

  async function feedIfHungry() {
    const { dog } = await observe();
    const before = dog.custom.needs.hunger;
    if (before < FEED_AT_HUNGER) return undefined;
    await eventually(async () => (await observe()).dog.distance < 4, 'Dog did not come within treat reach');
    // The bridge supplies the item through the main hand. Preserve the staged
    // fetch ball if the owner picked it up into that slot.
    const ballInHand = await command(`execute if items entity ${player} weapon.mainhand ${item}`, true) === 1;
    const emptyHand = await command(`execute unless items entity ${player} weapon.mainhand *`, true) === 1;
    assert(ballInHand || emptyHand, 'Select an empty hand for the daycare fixture');
    if (ballInHand) await command(`clear ${player} ${item} 1`);
    try {
      const fed = await request('/use-entity', { type: DOG, radius: 4, item: TREAT, count: 1 });
      assert(fed.target.uuid === dogId && fed.consumed, 'Treat interaction did not reach the original dog');
      const after = fed.target.custom.needs.hunger;
      assert(after < before, 'Treat did not reduce hunger');
      assert.equal(await command(`execute if items entity ${player} weapon.mainhand ${TREAT}`, true), 0,
        'Survival treat remained in the owner’s hand');
      return { before, after, treatsUsed: 1 };
    } finally {
      if (ballInHand && await countBall() === 0) {
        await command(`give ${player} ${item} 1`);
        await eventually(async () => await countBall() === 1, 'Owner could not reclaim the staged ball');
      }
    }
  }

  async function prepare() {
    assert(/^[0-9a-f-]{36}$/i.test(dogId ?? ''), 'Bring a tamed, harnessed Yorkie into the copied world');
    await observe();
    assert.equal(await command(`execute unless items entity ${player} weapon.mainhand *`, true), 1,
      'Select an empty hand in the copied world before starting the daycare fixture');
    await command('tick unfreeze', true);
    await command('gamerule minecraft:spawn_mobs false', true);
    await command('gamerule minecraft:advance_time true', true);
    await command('weather clear');
    await command(`fill ${x - 6} ${y} ${z - 6} ${x + 6} ${y + 8} ${z + 44} minecraft:air`, true);
    await command(`fill ${x - 6} ${y - 1} ${z - 6} ${x + 6} ${y - 1} ${z + 44} minecraft:grass_block`, true);
    await command(`fill ${x - 4} ${y - 1} ${z - 4} ${x + 4} ${y + 4} ${z + 4} minecraft:oak_planks hollow`);
    await command(`fill ${x - 1} ${y} ${z + 4} ${x + 1} ${y + 2} ${z + 4} minecraft:air`);
    for (const edge of [x - 6, x + 6]) await command(`fill ${edge} ${y} ${z - 6} ${edge} ${y + 1} ${z + 44} minecraft:oak_planks`);
    for (const edge of [z - 6, z + 44]) await command(`fill ${x - 5} ${y} ${edge} ${x + 5} ${y + 1} ${edge} minecraft:oak_planks`);
    await command(`setblock ${x + 2} ${y} ${z} mushroom_yorkie:dog_bed`);
    await command(`setblock ${x - 1} ${y + 3} ${z} minecraft:glowstone`);
    await command(`tp ${player} ${x + 0.5} ${y} ${home}`);
    await command(`tp ${dogId} ${x + 1.5} ${y} ${home}`);
    await command('time set 6500');
    await command(`gamemode survival ${player}`);
    if ((await observe()).dog.tameable.orderedToSit) {
      const sit = await request('/use-entity', { type: DOG, radius: 3, emptyHand: true });
      assert(sit.target.uuid === dogId && !sit.target.tameable.orderedToSit, 'Test dog did not start following');
    }
    const initialFeed = await feedIfHungry();
    await command(`give ${player} ${item} 1`);
    await eventually(async () => await countBall() === 1, 'Owner could not receive the single named ball');
    await command('time set 22300');
    return initialFeed;
  }

  async function play(initialFeed, result, save) {
    const start = performance.now();
    const firstTick = (await observe()).tick;
    let lastTick;
    let sleepingNight = false;
    const observations = result.observed = {
      actions: [], walksAndFetches: 0, dawns: 0, treatsUsed: initialFeed?.treatsUsed ?? 0, initialFeed
    };
    function checkpoint(action) {
      observations.actions.push(action);
      save();
      console.error(`Java daycare ${JSON.stringify(action)}`);
    }
    while (performance.now() - start < seconds * 1000) {
      signal.throwIfAborted();
      const now = await observe();
      if (lastTick !== undefined && now.tick <= lastTick) {
        throw Object.assign(new Error('World ticks stopped during play'), { phase: 'observation' });
      }
      lastTick = now.tick;
      const time = await command('time query daytime');
      const phase = phaseAt(time);
      const event = { phase, time, tick: now.tick.toString() };
      observations.inProgress = event;
      save();
      if (phase === 'return' || phase === 'sleep') {
        event.walks = [];
        for (let attempt = 0; attempt < 4 && Math.abs((await observe()).owner.positionPrecise.z - home) > 2; attempt++) {
          event.walks.push(await walkToward(home));
        }
        assert(Math.abs((await observe()).owner.positionPrecise.z - home) <= 2, 'Owner did not reach the shelter');
        if (phase === 'return') event.feed = await feedIfHungry();
        if (phase === 'sleep') {
          const rest = await eventually(async () => {
            const sample = await observe();
            return sample.dog.custom.curledUpSleeping && sample.dog.position;
          }, 'Dog did not settle inside at night');
          event.dogPosition = rest;
          sleepingNight = true;
        }
      } else if (phase === 'walk') {
        if (sleepingNight) {
          await eventually(async () => !(await observe()).dog.custom.curledUpSleeping, 'Dog did not wake at dawn');
          observations.dawns++;
          sleepingNight = false;
        }
        event.walk = await walkToward(z + (now.owner.positionPrecise.z < z + 20 ? 32.5 : 9.5));
        const { owner } = await eventually(async () => {
          const nearby = await observe();
          return nearby.dog.distance < 4 && nearby;
        }, 'Dog did not follow its walking owner');
        event.feed = await feedIfHungry();
        assert.equal(await countBall(), 1, 'Expected one named ball before fetch');
        // Stage the original ball six blocks ahead so only the dog can retrieve it.
        await command(`clear ${player} ${item} 1`);
        await command(`summon minecraft:item ${x + 0.5} ${y} ${owner.positionPrecise.z + 6} {Item:{id:"${BALL}",count:1,components:{"minecraft:custom_name":'${label}'}},PickupDelay:32767}`);
        await eventually(async () => await countBall() === 1, 'Dog did not return its named ball');
        event.ballCount = 1;
        observations.walksAndFetches++;
      }
      observations.treatsUsed += event.feed?.treatsUsed ?? 0;
      delete observations.inProgress;
      checkpoint(event);
      await wait(12000, undefined, { signal });
    }
    const end = await observe();
    assert(observations.dawns > 0 && observations.walksAndFetches > 0, 'Run missed dawn or the daytime fetch');
    observations.elapsedSeconds = (performance.now() - start) / 1000;
    observations.elapsedTicks = Number(end.tick - firstTick);
    observations.inGameDays = observations.elapsedTicks / 24000;
    return observations;
  }

  const profileLog = clientLog || path.resolve(savePath, '../..', 'logs/latest.log');
  let gameVersion;
  try {
    gameVersion = fs.readFileSync(profileLog, 'utf8').match(/Loading Minecraft ([^\s]+) with Fabric Loader/)?.[1];
  } catch { /* The bridge may be connected to a profile without a local startup log. */ }
  return runCases([{
    name: 'java-daycare', inputs: { seconds }, stopOnFailure: true,
    setup: prepare, run: play
  }], {
    reportFile, metadata: { scenario: 'java-daycare', runId, gameVersion, clientLog: profileLog, seed: initial.seed, expectedSave, savePath,
      playerUuid: actor.uuid, dogUuid: dogId, origin: { x, y, z }, provenance: provenance(savePath) },
    capture: scenario => captureMatrixFailure({ ...context, command }, scenario)
  });
}

module.exports = { runDaycare, phaseAt };
