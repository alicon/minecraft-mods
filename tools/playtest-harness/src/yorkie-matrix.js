'use strict';

const { runCases, saveReport } = require('./scenario-runner');
const { OWNER_STATES } = require('./yorkie-inputs');
const { assertTestWorld, assertLivingTestOwner } = require('./yorkie-world');
const { assertInspectionWorld, careForSuccessfulPet, withWorldReset } = require('./yorkie-post-run');
const { settleStagingOwner, assertStagedOwnerAfterReset } = require('./yorkie-owner-staging');
const { randomUUID } = require('node:crypto');
const TYPE = 'mushroom_yorkie:mushroom_yorkie';
const SELECTOR = '@e[type=mushroom_yorkie:mushroom_yorkie,tag=matrix_yorkie,limit=1]';
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function check(value, message) { if (!value) throw new Error(message); }


function matrixInputs() {
  const rows = [];
  for (const time of [1000, 12900, 18000, 23100])
    for (const shelter of ['outside', 'roof', 'inside'])
      for (const hunger of [0, 90])
        for (const sitting of [false, true])
          for (const owner of OWNER_STATES)
            rows.push({ time, shelter, hunger, sitting, ...owner });
  return rows;
}

function selectCases(groups, args) {
  check(!args.group || Object.hasOwn(groups, args.group), `Unknown matrix group: ${args.group}`);
  const grouped = args.group ? groups[args.group] : Object.values(groups).flat();
  const selected = args.case ? grouped.filter((scenario) => scenario.name === args.case || scenario.name === `matrix-${args.case}`) : grouped;
  check(selected.length > 0, 'No matching matrix case');
  return selected;
}

async function executeMatrix(baseUrl, args) {
  check(/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(baseUrl), 'Matrix requires a loopback bridge');
  const { investigationEnabled, investigateCases, retainInterruptedInvestigation } = require('./yorkie-investigation');
  const investigate = investigationEnabled(args.investigate);
  async function request(route, body, allowNoChange = false) {
    const response = await fetch(baseUrl + route, {
      method: body ? 'POST' : 'GET', headers: body ? { 'content-type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000)
    });
    const result = await response.json();
    require('./command-result').checkCommandParsed(result);
    check(response.ok && result.ok !== false && (result.success !== false || allowNoChange && result.result === 0), `${route}: ${JSON.stringify(result)}`);
    return result;
  }
  const initial = await request('/state');
  assertTestWorld(initial, args.expectedSave);
  assertLivingTestOwner(initial, args.expectedSave);
  check(initial.players[0].dimension.includes('minecraft:overworld'), 'Matrix arena requires the Overworld');
  const runId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const startScreenshot = await request('/screenshot', { name: `yorkie-matrix-${runId}-start.png`, resume: true });
  const provenance = require('./bridge-provenance').provenance(initial.savePath);
  const player = initial.players[0].name;
  const ownerIdentity = { expectedSave: args.expectedSave, playerUuid: initial.players[0].uuid };
  const base = { x: Math.floor(initial.players[0].position.x), y: 220, z: Math.floor(initial.players[0].position.z) };
  const command = (text) => request('/command', { command: text }, /^(fill|setblock) /.test(text));
  const state = () => request('/state');
  const entity = (snapshot) => snapshot.players[0].nearbyEntities.find((candidate) => candidate.type === TYPE);
  const merge = (nbt) => command(`data merge entity ${SELECTOR} ${nbt}`);
  const use = (body) => request('/use-entity', { type: TYPE, radius: 24, ...body });
  const advance = (ticks = 100) => require('./yorkie-clock').advanceWorldTicks(command, state, ticks, 'sprint');
  let lastFixtureUuid;
  async function prepare(inputs) {
    const ownerMode = inputs.ownerMode || (inputs.flying ? 'creative' : 'survival');
    check(['survival', 'creative'].includes(ownerMode) && (!inputs.flying || ownerMode === 'creative'), 'Invalid owner mode/flight fixture');
    // Check identity before each destructive fixture reset, not only at startup.
    const current = await state();
    assertTestWorld(current, args.expectedSave);
    assertLivingTestOwner(current, args.expectedSave);
    check(current.players[0].uuid === ownerIdentity.playerUuid, 'Matrix fixture owner changed');
    check(current.players[0].dimension.includes('minecraft:overworld'), 'Matrix arena requires the Overworld');
    await command('tick sprint stop');
    await command('tick unfreeze');
    await command(`gamemode creative ${player}`);
    await request('/player-abilities', { player, flying: false, mayfly: true });
    // A fresh high-altitude arena has no support. Build and verify the floor
    // before parking the owner there for the builder-focus sprint.
    await command(`fill ${base.x - 7} ${base.y - 1} ${base.z - 7} ${base.x + 7} 319 ${base.z + 7} minecraft:air`);
    await command(`fill ${base.x - 7} ${base.y - 1} ${base.z - 7} ${base.x + 7} ${base.y - 1} ${base.z + 7} minecraft:grass_block`);
    const stagingFloor = await request('/block', { x: base.x, y: base.y - 1, z: base.z });
    check(stagingFloor.block === 'minecraft:grass_block', 'Matrix owner staging floor is missing');
    const target = { x: base.x + 0.5, y: base.y, z: base.z + 0.5 };
    await command(`tp ${player} ${target.x} ${target.y} ${target.z} 0 0`);
    // Clear the baseline pet in this disposable save so ownership guards do not block taming.
    await request('/clear-entities', { type: TYPE });
    // A boat left by an interrupted vehicle run must not board the next fresh pet,
    // including when that next run selects a different group.
    for (const type of require('./yorkie-vehicles').VEHICLES) await request('/clear-entities', { type });
    await request('/clear-entities', { type: 'mushroom_yorkie:squirrel' });
    await request('/clear-entities', { type: 'minecraft:item' });
    const ownerStaging = await settleStagingOwner(state, ownerIdentity, target);
    // CreativeBuildActivity belongs to the owner, not the replaced pet. Let its 1800-tick
    // focus expire before creating a fixture, so earlier real building cannot induce a nap.
    const { position, onGround, health } = assertStagedOwnerAfterReset(await advance(1801), ownerIdentity, ownerStaging);
    if (inputs.shelter === 'inside') {
      await command(`fill ${base.x - 4} ${base.y - 1} ${base.z - 4} ${base.x + 4} ${base.y + 4} ${base.z + 4} minecraft:oak_planks hollow`);
      await command(`setblock ${base.x} ${base.y + 4} ${base.z} minecraft:glowstone`);
    } else if (inputs.shelter === 'roof') {
      await command(`fill ${base.x - 4} ${base.y + 4} ${base.z - 4} ${base.x + 4} ${base.y + 4} ${base.z + 4} minecraft:glowstone`);
    }
    for (const [position, block] of [
      [{ x: base.x, y: base.y - 1, z: base.z }, inputs.shelter === 'inside' ? 'minecraft:oak_planks' : 'minecraft:grass_block'],
      [{ x: base.x, y: base.y + 4, z: base.z }, inputs.shelter === 'outside' ? 'minecraft:air' : 'minecraft:glowstone']
    ]) {
      const observed = await request('/block', position);
      check(observed.block === block, `Fixture block mismatch: expected ${block}, got ${observed.block}`);
    }
    await command(`time set ${inputs.time}`);
    await command(`tp ${player} ${base.x - 1.5} ${base.y} ${base.z + 0.5}`);
    await command(`summon ${TYPE} ${base.x + 0.5} ${base.y} ${base.z + 0.5} {Tags:["matrix_yorkie"],PersistenceRequired:1b}`);
    const tamed = await use({ item: 'mushroom_yorkie:yorkie_treat', count: 2 });
    check(tamed.target.tameable.ownedByPlayer, 'Fresh fixture did not tame to the test player');
    await merge(`{Hunger:${inputs.hunger},Potty:10,Mood:80,Energy:80,Health:12.0f,NightWakeTicks:0,Sitting:${inputs.sitting ? '1b' : '0b'}}`);
    await command(`item replace entity ${player} weapon.mainhand with minecraft:air`);
    if (inputs.flying) {
      await request('/player-abilities', { player, flying: true, mayfly: true });
      await command(`tp ${player} ${base.x - 1.5} ${base.y + 1.5} ${base.z + 0.5}`);
    } else if (ownerMode === 'survival') {
      await command(`gamemode survival ${player}`);
    }
    const sky = await request('/count-blocks', { x1: base.x - 7, y1: base.y + 5, z1: base.z - 7, x2: base.x + 7, y2: 319, z2: base.z + 7 });
    check(sky.counts['minecraft:air'] === sky.volume, 'Old overhead blocks invalidate the shelter fixture');
    const snapshot = await state();
    assertLivingTestOwner(snapshot, args.expectedSave);
    const yaw = (await command(`data get entity ${player} Rotation[0]`)).result;
    const pitch = (await command(`data get entity ${player} Rotation[1]`)).result;
    check(yaw === 0 && pitch === 0, 'Fixture owner view was not reset after earlier camera movement');
    snapshot.fixtureAudit = { upperAirVolume: sky, ownerMode, flying: Boolean(inputs.flying), ownerView: { yaw, pitch },
      buildFocusResetTicks: 1801, buildFocusResetOwner: { position, onGround, health } };
    check(entity(snapshot), 'Fresh fixture is not observable');
    lastFixtureUuid = entity(snapshot).uuid;
    check(snapshot.players[0].abilities.creative === (ownerMode === 'creative')
      && snapshot.players[0].abilities.flying === Boolean(inputs.flying), 'Owner mode/flight fixture did not take effect');
    return snapshot;
  }
  const inputs = matrixInputs();
  const cases = inputs.map((row) => {
    const number = inputs.indexOf(row) + 1;
    return {
      name: `matrix-${number}`, inputs: row, setup: () => prepare(row),
      run: async (fixture, result) => {
        const snapshot = await advance();
        const pet = entity(snapshot);
        result.observed = { fixture, snapshot };
        const clock = await command('time query daytime');
        check(clock.result === row.time, `Fixture time drifted: expected ${row.time}, got ${clock.result}`);
        check(pet, 'Mushroom disappeared during the scenario');
        const sleeping = row.time >= 13000 && row.time <= 23000 && row.shelter === 'inside' && !row.flying;
        check(pet.custom.curledUpSleeping === sleeping, `Expected sleeping=${sleeping}, observed ${pet.custom.curledUpSleeping}`);
        check(pet.tameable.orderedToSit === row.sitting, 'Explicit sit/follow order changed unexpectedly');
        check(pet.noGravity === (row.flying && !row.sitting), `Unexpected flight gravity state: ${pet.noGravity}`);
        check(pet.health > 0, 'Healthy or hungry (not starving) pet died');
        for (const [need, value] of Object.entries(pet.custom.needs)) check(Number.isFinite(value) && value >= 0 && value <= 100, `Invalid need ${need}=${value}`);
        if (row.sitting) check(Math.hypot(pet.position.x - base.x - 0.5, pet.position.z - base.z - 0.5) < 1, 'Ordered sitting pet wandered away');
        // Verify an actual transition, not just a freshly spawned state.
        await command('time set day');
        await request('/player-abilities', { player, flying: false, mayfly: true });
        await command(`tp ${player} ${base.x - 1.5} ${base.y} ${base.z + 0.5}`);
        const settled = entity(await advance());
        check(settled && !settled.custom.curledUpSleeping, 'Pet did not wake at dawn');
        check(!settled.noGravity, 'Pet retained flight after the owner landed nearby');
        return { fixture, snapshot, tickCount: snapshot.tickCount, pet, afterDawnAndLanding: settled };
      }
    };
  });
  const context = { prepare, command, request, state, entity, advance, base, player, expectedSave: args.expectedSave, playerUuid: initial.players[0].uuid, selector: SELECTOR, check };
  const groups = { base: cases, transitions: [...require('./yorkie-transitions').transitionCases(context), ...require('./yorkie-flight-transitions').flightTransitionCases(context)], terrain: require('./yorkie-terrain').terrainCases(context), outdoors: require('./yorkie-outdoor').outdoorCases(context), water: require('./yorkie-water-rest').waterRestCases(context), rest: require('./yorkie-sleep-spots').sleepSpotCases(context), vehicles: require('./yorkie-vehicles').vehicleCases(context), 'native-shore': require('./yorkie-native-shore').nativeShoreCases(context), journeys: require('./yorkie-vehicle-journeys').journeyCases(context) };
  const investigation = investigateCases(selectCases(groups, args), investigate);
  const selected = investigation.cases;
  await command('gamerule minecraft:spawn_mobs false');
  await command('gamerule minecraft:advance_time false');
  await command('weather clear');
  const reportFile = args.reportFile || process.env.BRIDGE_REPORT_FILE || 'build/playtest-reports/yorkie-matrix.json';
  const careContext = { state, request, expectedSave: args.expectedSave, playerUuid: initial.players[0].uuid };
  let interruptedInvestigation = false;
  async function resetWorld(report) {
    if (report?.cases.some(result => result.interruption === 'client_paused')) {
      report.worldReset = { status: 'skipped', reason: 'client_paused_tick_request_retained' };
      saveReport(reportFile, report);
      return;
    }
    if (interruptedInvestigation || report?.cases.some(result => result.status !== 'passed' && selected.find(c => c.name === result.name)?.stopOnFailure)) {
      assertInspectionWorld(await state(), careContext);
      await command('tick freeze');
      const frozen = await state();assertInspectionWorld(frozen, careContext);
      check(frozen.worldFrozen, 'Investigative failure did not retain a frozen world');
      const retained = { status: 'skipped', reason: 'investigative_failure_fixture_retained', worldFrozen: true };
      if (report) { report.worldReset = retained;saveReport(reportFile, report); }
      return retained;
    }
    for (const body of [
      { command: 'tick sprint stop' }, { command: 'time set day' }, { command: `gamemode creative ${player}` }
    ]) {
      assertInspectionWorld(await state(), careContext);
      await request('/command', body);
    }
    assertInspectionWorld(await state(), careContext);
    await request('/player-abilities', { player, flying: false, mayfly: true });
  }
  return withWorldReset({
    reportFile, reset: resetWorld,
    run: (resetOnce) => retainInterruptedInvestigation(() => runCases(selected, {
      afterSuccess: async () => {
        await resetOnce();
        if (selected.at(-1).inspectionPet === false) return { skipped: true, reason: 'final_fixture_disables_inspection_care' };
        return careForSuccessfulPet({ ...careContext, petUuid: lastFixtureUuid });
      },
      reportFile, metadata: { scenario: 'yorkie-matrix', runId, group: args.group || 'all', provenance, startScreenshot: startScreenshot.file, saveName: initial.saveName, base, expectedSave: args.expectedSave, ...investigation.metadata },
      capture: (scenario, error) => require('./yorkie-failure-capture').captureMatrixFailure(
        { ...careContext, command, runId }, scenario, { clientPaused: error.code === require('./yorkie-clock').CLIENT_PAUSED }),
      onResult: (result) => console.error(`${result.name}: ${result.status}${result.error ? `: ${result.error}` : ''}`)
    }), () => { interruptedInvestigation = true;return resetOnce(); }, investigate)
  });
}

async function runMatrix(baseUrl, args) {
  return runMatrixWithContinuation(baseUrl, args, result => result);
}

// Saved-restart callers consume the verified fixture without releasing its mutation lease.
async function runMatrixWithContinuation(baseUrl, args, consume) {
  return require('./bridge-lock').withBridgeLock(baseUrl, async () => consume(await executeMatrix(baseUrl, args)));
}

module.exports = { runMatrix, runMatrixWithContinuation, matrixInputs, assertTestWorld, selectCases };
