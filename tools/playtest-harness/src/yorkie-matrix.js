'use strict';

const { runCases } = require('./scenario-runner');
const TYPE = 'mushroom_yorkie:mushroom_yorkie';
const SELECTOR = '@e[type=mushroom_yorkie:mushroom_yorkie,tag=matrix_yorkie,limit=1]';
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function check(value, message) { if (!value) throw new Error(message); }

function assertTestWorld(state, expectedSave) {
  check(expectedSave && state.saveName === expectedSave, 'Exact --expected-save is required and must match the loaded save');
  check(/^(Mushroom Abel Noelle |Codex |Mushroom Matrix )/.test(expectedSave), 'Refusing a save without a disposable-test prefix');
  check(state.singleplayer && state.players.length === 1, 'Matrix requires a single-player local test world');
}

function matrixInputs() {
  const rows = [];
  for (const time of [1000, 12900, 18000, 23100])
    for (const shelter of ['outside', 'roof', 'inside'])
      for (const hunger of [0, 90])
        for (const sitting of [false, true])
          for (const owner of [{ ownerMode: 'survival', flying: false }, { ownerMode: 'creative', flying: false }, { ownerMode: 'creative', flying: true }])
            rows.push({ time, shelter, hunger, sitting, ...owner });
  return rows;
}

async function executeMatrix(baseUrl, args) {
  check(/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(baseUrl), 'Matrix requires a loopback bridge');
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
  await request('/screenshot', { name: 'yorkie-matrix-start.png', resume: true });
  const player = initial.players[0].name;
  const base = { x: Math.floor(initial.players[0].position.x), y: 220, z: Math.floor(initial.players[0].position.z) };
  const command = (text) => request('/command', { command: text }, /^(fill|setblock) /.test(text));
  const state = () => request('/state');
  const entity = (snapshot) => snapshot.players[0].nearbyEntities.find((candidate) => candidate.type === TYPE);
  const merge = (nbt) => command(`data merge entity ${SELECTOR} ${nbt}`);
  const use = (body) => request('/use-entity', { type: TYPE, radius: 24, ...body });
  async function advance(ticks = 100) {
    const before = (await state()).tickCount;
    await command(`tick sprint ${ticks}t`);
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      const snapshot = await state();
      if (snapshot.tickCount >= before + ticks) return snapshot;
      await delay(100);
    }
    throw new Error(`Server failed to advance ${ticks} ticks`);
  }
  async function prepare(inputs) {
    const ownerMode = inputs.ownerMode || (inputs.flying ? 'creative' : 'survival');
    check(['survival', 'creative'].includes(ownerMode) && (!inputs.flying || ownerMode === 'creative'), 'Invalid owner mode/flight fixture');
    // Check identity before each destructive fixture reset, not only at startup.
    assertTestWorld(await state(), args.expectedSave);
    await command('tick sprint stop');
    await command(`gamemode creative ${player}`);
    await request('/player-abilities', { player, flying: false, mayfly: true });
    await command(`tp ${player} ${base.x} ${base.y + 1} ${base.z}`);
    // Clear the baseline pet in this disposable save so ownership guards do not block taming.
    await request('/clear-entities', { type: TYPE });
    await request('/clear-entities', { type: 'mushroom_yorkie:squirrel' });
    await request('/clear-entities', { type: 'minecraft:item' });
    await command(`fill ${base.x - 7} ${base.y - 1} ${base.z - 7} ${base.x + 7} ${base.y + 7} ${base.z + 7} minecraft:air`);
    await command(`fill ${base.x - 7} ${base.y - 1} ${base.z - 7} ${base.x + 7} ${base.y - 1} ${base.z + 7} minecraft:grass_block`);
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
    const snapshot = await state();
    check(entity(snapshot), 'Fresh fixture is not observable');
    check(snapshot.players[0].abilities.creative === (ownerMode === 'creative')
      && snapshot.players[0].abilities.flying === Boolean(inputs.flying), 'Owner mode/flight fixture did not take effect');
    return snapshot;
  }
  await command('gamerule minecraft:spawn_mobs false');
  await command('gamerule minecraft:advance_time false');
  await command('weather clear');
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
        return { tickCount: snapshot.tickCount, pet, afterDawnAndLanding: settled };
      }
    };
  });
  cases.push(...require('./yorkie-transitions').transitionCases({ prepare, command, request, state, entity, advance, base, player, selector: SELECTOR, check }));
  const selected = args.case ? cases.filter((scenario) => scenario.name === args.case || scenario.name === `matrix-${args.case}`) : cases;
  check(selected.length > 0, 'No matching matrix case');
  const reportFile = args.reportFile || 'build/playtest-reports/yorkie-matrix.json';
  try {
    return await runCases(selected, {
      reportFile, metadata: { scenario: 'yorkie-matrix', saveName: initial.saveName, base, expectedSave: args.expectedSave },
      capture: async (scenario) => {
        const snapshot = await state();
        const screenshot = await request('/screenshot', { name: `yorkie-${scenario.name}-failure.png`, resume: true, hideGui: false });
        return { state: snapshot, screenshot: screenshot.file };
      },
      onResult: (result) => console.error(`${result.name}: ${result.status}${result.error ? `: ${result.error}` : ''}`)
    });
  } finally {
    await command('tick sprint stop');
    await command('time set day');
    await command(`gamemode creative ${player}`);
    await request('/player-abilities', { player, flying: false, mayfly: true });
  }
}

async function runMatrix(baseUrl, args) {
  return require('./bridge-lock').withBridgeLock(baseUrl, () => executeMatrix(baseUrl, args));
}

module.exports = { runMatrix, matrixInputs, assertTestWorld };
