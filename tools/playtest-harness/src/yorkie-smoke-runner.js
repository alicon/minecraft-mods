'use strict';
const assert = require('node:assert/strict');
const { runCases, saveReport } = require('./scenario-runner');
const { careForSuccessfulPet, assertInspectionWorld } = require('./yorkie-post-run');
const { withBridgeLock } = require('./bridge-lock');
const { provenance } = require('./bridge-provenance');
const { checkCommandParsed } = require('./command-result');
const TYPE = 'mushroom_yorkie:mushroom_yorkie';
const SMOKE_TAG = 'runtime_smoke_yorkie';

// Use the arena's axes so the owner can start the smoke from any camera angle.
async function stageSmokeYorkie({ base, radius }, { type, distance, inspectionPet = false }, { state, blockAt, command }) {
  const position = { x: base.x + 0.5, y: base.y, z: base.z + distance + 0.5 };
  const feet = { x: Math.floor(position.x), y: position.y, z: Math.floor(position.z) };
  const evidence = { position };
  try {
    assert(Number.isInteger(distance) && distance > 0 && distance <= radius, 'Smoke spawn is outside the arena');
    assert.match(type, /^[a-z0-9_.-]+:[a-z0-9_./-]+$/);
    evidence.floor = await blockAt({ ...feet, y: feet.y - 1 });
    evidence.feet = await blockAt(feet);
    assert.equal(evidence.floor.block, 'minecraft:grass_block', 'Smoke spawn floor is missing');
    assert.equal(evidence.feet.block, 'minecraft:air', 'Smoke spawn is blocked');
    const candidates = snapshot => snapshot.players[0].nearbyEntities.filter(entity => entity.type === type);
    const previous = new Set(candidates(await state()).map(entity => entity.uuid));
    const tag = inspectionPet ? ` {Tags:["${SMOKE_TAG}"]}` : '';
    evidence.summon = await command(`summon ${type} ${position.x} ${position.y} ${position.z}${tag}`);
    assert.equal(evidence.summon.success, true, 'Minecraft rejected the smoke summon');
    const deadline = Date.now() + 2000;
    do {
      const spawned = candidates(await state()).filter(entity => !previous.has(entity.uuid));
      assert(spawned.length <= 1, 'Smoke summon produced ambiguous entity identity');
      if (spawned.length === 1) {
        const [pet] = spawned;
        assert(pet.uuid && (!evidence.pet || evidence.pet.uuid === pet.uuid), 'Smoke spawn changed identity');
        evidence.pet = pet;
        assert(pet.health > 0 && pet.health === pet.maxHealth, 'Smoke spawn is injured or has no health observation');
        assert(Math.abs(pet.position.y - position.y) <= 0.01
          && Math.floor(pet.position.x) === feet.x && Math.floor(pet.position.z) === feet.z,
        'Smoke summon left its planned floor cell before setup completed');
        if (pet.onGround === true && pet.inWater === false && pet.noGravity === false && !pet.vehicle) {
          return { ...pet, spawnSupport: { position, floor: evidence.floor, feet: evidence.feet } };
        }
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    } while (Date.now() < deadline);
    throw new Error('Smoke summon never showed native ground contact');
  } catch (error) {
    error.phase = 'setup';
    error.observed = evidence;
    throw error;
  }
}

async function stageSmokeShelter({ base, radius }, petUuid, { state, setBlockNearYorkie, setAbsoluteBlock }) {
  const block = 'minecraft:oak_planks';
  const replace = 'minecraft:air';
  const evidence = { placements: [] };
  const ready = pet => pet?.uuid === petUuid && pet.health > 0 && pet.health === pet.maxHealth
    && pet.tameable?.ownedByPlayer && pet.tameable.sittingPose && pet.tameable.orderedToSit
    && pet.onGround && !pet.inWater && !pet.noGravity && !pet.vehicle && pet.position.y === base.y
    && pet.velocity?.x === 0 && pet.velocity?.z === 0;
  const samePosition = (first, second) => first.x === second.x && first.y === second.y && first.z === second.z;
  const originalPet = snapshot => snapshot.players[0].nearbyEntities.find(pet => pet.uuid === petUuid);
  try {
    let previous;
    const deadline = Date.now() + 2000;
    do {
      const snapshot = await state();
      const pet = originalPet(snapshot);
      const gameTime = snapshot.overworldGameTime;
      evidence.pet = pet;
      if (ready(pet) && previous && gameTime && gameTime !== previous.gameTime && samePosition(pet.position, previous.position)) {
        evidence.settled = pet;
        break;
      }
      previous = ready(pet) && gameTime ? { position: pet.position, gameTime } : undefined;
      await new Promise(resolve => setTimeout(resolve, 50));
    } while (Date.now() < deadline);
    assert(evidence.settled, 'Original Yorkie did not settle on the arena floor for the shelter');
    const { x, z } = evidence.settled.position;
    assert(Math.abs(x - base.x - 0.5) <= radius - 2 && Math.abs(z - base.z - 0.5) <= radius - 2,
      'Yorkie settled too close to the arena edge for the shelter');
    // The bridge places the roof from the native block position, which avoids rounding
    // across a block boundary. Derive the walls from that one position.
    const roof = await setBlockNearYorkie({ dx: 0, dy: 3, dz: 0, block, replace });
    evidence.placements.push(roof);
    assert(roof.changed && ready(roof.target) && samePosition(roof.target.position, evidence.settled.position),
      'Smoke roof was blocked or the original Yorkie moved before placement');
    const center = { ...roof.position, y: roof.position.y - 3 };
    const owner = (await state()).players[0].position;
    for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) {
      const x = center.x + dx;
      const z = center.z + dz;
      // Three walls meet the shelter requirement. Leave the owner's column clear.
      if (Math.floor(owner.x) === x && Math.floor(owner.z) === z) continue;
      for (let dy = 0; dy <= 2; dy++) {
        const position = { x, y: center.y + dy, z };
        const wall = await setAbsoluteBlock(position, block, replace);
        evidence.placements.push(wall);
        assert(wall.changed, 'Smoke shelter wall was blocked');
      }
    }
    evidence.pet = originalPet(await state());
    assert(ready(evidence.pet) && samePosition(evidence.pet.position, evidence.settled.position),
      'Original Yorkie moved during shelter setup');
    return evidence.placements;
  } catch (error) {
    error.phase = 'setup';
    error.observed = evidence;
    throw error;
  }
}

// One legacy smoke remains a single scenario; its original step observations are checkpointed during the run.
async function runSmokeWithCare({ runSmoke, state, request, expectedSave, reportFile, metadata = {} }) {
  const initial = await state();
  const context = { state, request, expectedSave, playerUuid: initial.players?.[0]?.uuid, fixtureTag: SMOKE_TAG };
  const guard = async () => { const snapshot = await state(); assertInspectionWorld(snapshot, context); return snapshot; };
  let petUuid;
  const report = await runCases([{
    name: 'yorkie-runtime-smoke',
    setup: async () => { assertInspectionWorld(initial, context); return initial; },
    run: async (fixture, result, checkpoint) => {
      const gameplay = await runSmoke({
        beforeStep: guard,
        onStep: steps => {
          result.observed = { scenario: 'yorkie-smoke', entity: TYPE, steps: structuredClone(steps) };
          checkpoint();
        }
      });
      result.observed = structuredClone(gameplay);
      assert.equal(gameplay.ok, true, 'Runtime smoke did not report successful gameplay');
      petUuid = gameplay.inspectionPetUuid;
      return result.observed;
    }
  }], {
    reportFile, metadata: { ...metadata, scenario: 'yorkie-smoke', saveName: initial.saveName },
    capture: guard,
    afterSuccess: () => careForSuccessfulPet({ ...context, petUuid })
  });
  // Keep legacy flat steps/screenshot fields. The runner's overall verdict always wins over gameplay.ok.
  const compatible = { ...report.cases[0]?.observed, ...report };
  saveReport(reportFile, compatible);
  return compatible;
}

async function runRuntimeSmoke(baseUrl, args, runSmoke) {
  assert(/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(baseUrl), 'Runtime smoke requires a loopback bridge');
  return withBridgeLock(baseUrl, async () => {
    async function request(route, body, allowNoChange = false) {
      const response = await fetch(baseUrl + route, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
      const result = await response.json();
      checkCommandParsed(result);
      assert(response.ok && result.ok !== false && (result.success !== false || allowNoChange && result.result === 0), `${route}: ${JSON.stringify(result)}`);
      return result;
    }
    const state = () => request('/state');
    const initial = await state();
    return runSmokeWithCare({ runSmoke, state, request,
      expectedSave: args.expectedSave || process.env.PLAYTEST_WORLD,
      reportFile: args.reportFile || process.env.BRIDGE_REPORT_FILE || 'build/playtest-reports/yorkie-smoke.json',
      metadata: { provenance: provenance(initial.savePath) }
    });
  });
}

module.exports = { runSmokeWithCare, runRuntimeSmoke, stageSmokeYorkie, stageSmokeShelter };
