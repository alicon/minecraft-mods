'use strict';

const assert = require('node:assert/strict');
const { advanceWorldTicks } = require('./yorkie-clock');
const { assertInspectionWorld } = require('./yorkie-post-run');

class KnockbackObservation {
  constructor(actor, perched) {
    assert(actor?.uuid && actor.health > 0, 'Missing living hit target');
    assert(['x', 'y', 'z'].every(axis => Number.isFinite(actor.velocity?.[axis])), 'Native velocity observation is unavailable');
    assert(Math.hypot(actor.velocity.x, actor.velocity.z) > 0.1, 'Native hurt did not supply a horizontal impulse');
    this.uuid = actor.uuid; this.hitHealth = actor.health; this.perched = perched;
    this.hitPosition = this.previous = actor.position; this.previousHealth = actor.health;
    this.largestMove = 0; this.largestStep = 0; this.fallObserved = false; this.released = false; this.fallHealthLoss = 0;
  }

  sample(actor, ticksSinceHit) {
    assert(actor?.uuid === this.uuid && actor.health > 0, 'Original hit squirrel died or vanished');
    assert(['x', 'y', 'z'].every(axis => Number.isFinite(actor.position?.[axis])), 'Invalid hit-target position');
    const p = actor.position;
    const step = Math.hypot(p.x - this.previous.x, p.z - this.previous.z);
    this.largestStep = Math.max(this.largestStep, step);
    assert(step <= 1.5 && Math.abs(p.y - this.previous.y) <= 2, 'Hit recovery jumped unexpectedly between native ticks');
    this.previous = p;
    this.largestMove = Math.max(this.largestMove, Math.hypot(p.x - this.hitPosition.x, p.z - this.hitPosition.z));
    this.fallObserved ||= !actor.noGravity && actor.fallDistance > 0.2;
    this.released ||= !actor.noGravity && !actor.custom?.foundTree;
    assert(actor.health <= this.previousHealth, 'Hit recovery gained health');
    if (actor.health < this.previousHealth) {
      assert(this.perched && this.fallObserved && actor.onGround && actor.lastDamageType === 'fall',
        'Hit recovery took damage outside an observed native landing');
      this.fallHealthLoss += this.previousHealth - actor.health;
    }
    this.previousHealth = actor.health;
    if (ticksSinceHit >= 10) this.assertReaction();
  }

  assertReaction() {
    assert(this.largestMove > 0.1, 'Native hurt impulse was cancelled before physical displacement');
    assert(this.released, 'Hurt climbing control did not release');
  }
}

function squirrelKnockbackCases(context) {
  const { prepare, request, command, state, base, check } = context;
  return [false, true].flatMap(perched => [false, true].map(south => {
    const inputs = { time: 1000, shelter: 'outside', hunger: 10, sitting: false, flying: true,
      perched, south, hitInput: 'controlled native player_attack damage command; not a client swing' };
    return {
      name: `squirrel-hurt-${perched ? 'perched' : 'climbing'}-${south ? 'south' : 'north'}`, inspectionPet: false, inputs,
      setup: async () => {
        await prepare(inputs);
        await request('/clear-entities', { type: 'mushroom_yorkie:mushroom_yorkie' });
        await request('/clear-entities', { type: 'mushroom_yorkie:squirrel' });
        await command('tick freeze');
        const initial = await state(); const player = initial.players[0];
        check(/^[A-Za-z0-9_]{1,16}$/.test(player.name), 'Hurt source has an invalid player name');
        const owner = { x: base.x + 2, y: base.y + (perched ? 2 : 0), z: base.z + (south ? 5 : 2) };
        await request('/player-abilities', { player: player.name, flying: true, mayfly: true });
        await command(`tp ${player.name} ${owner.x.toFixed(1)} ${owner.y.toFixed(1)} ${owner.z.toFixed(1)}`);
        await command(`fill ${base.x + 3} ${base.y} ${base.z + 3} ${base.x + 3} ${base.y + 4} ${base.z + 3} minecraft:oak_log`);
        await command(`summon mushroom_yorkie:squirrel ${base.x + 0.5} ${base.y} ${base.z + 3.5} {NoAI:1b,PersistenceRequired:1b}`);
        const snapshot = await state(); const actor = snapshot.players[0].nearbyEntities.find(e => e.type === 'mushroom_yorkie:squirrel');
        check(snapshot.worldFrozen && actor?.health === actor?.maxHealth && actor?.health > 0, 'Fresh healthy hurt fixture is missing');
        check(['x', 'y', 'z'].every(axis => Number.isFinite(actor.velocity?.[axis])), 'Hurt checks require a bridge with native velocity snapshots');
        const clear = await request('/count-blocks', { x1: base.x + 2, x2: base.x + 2, y1: base.y, y2: base.y + 5, z1: base.z + 2, z2: base.z + 5 });
        check(clear.counts['minecraft:air'] === clear.volume, 'Hurt source line of sight is blocked');
        return { uuid: actor.uuid, player: player.name, owner, identity: { expectedSave: snapshot.saveName, playerUuid: player.uuid },
          expectedTree: { x: base.x + 3.5, z: base.z + 3.5 } };
      },
      run: async (fixture, result, save) => {
        const observed = result.observed = { fixture, input: inputs.hitInput, trace: [] };
        async function guardedState() { const s = await state(); assertInspectionWorld(s, fixture.identity); return s; }
        async function guardedCommand(text) {
          if (/^(tick step|damage |data merge)/.test(text)) await guardedState();
          return command(text);
        }
        await guardedCommand(`data merge entity ${fixture.uuid} {NoAI:0b}`);
        let stable = 0, hitAt, observation;
        for (let tick = 1; tick <= 400; tick++) {
          const snapshot = await advanceWorldTicks(guardedCommand, guardedState, 1, 'step');
          const actor = snapshot.players[0].nearbyEntities.find(e => e.uuid === fixture.uuid);
          observed.trace.push({ tick, squirrel: actor, tickAudit: snapshot.tickAudit }); save();
          check(snapshot.worldFrozen && snapshot.tickAudit.elapsedTicks === 1, 'Hurt observation lost exact native ticks');
          check(actor?.health > 0, 'Original hurt fixture died or vanished');
          if (hitAt === undefined) {
            check(actor.health === actor.maxHealth, 'Hurt fixture lost health before the hit');
            const ready = perched ? actor.custom.foundTree && actor.noGravity && actor.position.y >= base.y + 3.8
              : actor.position.y >= base.y + 0.8 && actor.position.y < base.y + 1.3;
            stable = ready ? stable + 1 : 0;
            if (stable < (perched ? 40 : 1)) continue;
            const player = snapshot.players[0], p = actor.position;
            const reach = Math.hypot(p.x - player.position.x, p.y + 0.28 - player.position.y - 1.62, p.z - player.position.z);
            check(reach <= 3 && p.x < base.x + 3 && Math.abs(p.z - base.z - 3.5) < 0.1, 'Hurt fixture missed physical reach or west-face contact');
            observed.beforeHit = actor; observed.hitReach = reach;
            observed.hit = await guardedCommand(`damage ${fixture.uuid} 1 minecraft:player_attack by ${fixture.player}`);
            check(observed.hit.success === true, 'Native hurt command was refused');
            const after = await guardedState();
            observed.afterHit = after.players[0].nearbyEntities.find(e => e.uuid === fixture.uuid); save();
            check(observed.afterHit?.health === actor.health - 1, 'Native hurt did not apply exactly the authored hit');
            observation = new KnockbackObservation(observed.afterHit, perched); observed.reaction = observation;
            hitAt = observed.hitAt = tick; stable = 0; save(); continue;
          }
          observation.sample(actor, tick - hitAt); save();
          const recovered = actor.custom.foundTree && actor.noGravity && actor.position.y >= base.y + 3.8;
          stable = recovered ? stable + 1 : 0;
          if (stable >= 40) {
            observation.assertReaction();
            check(Math.hypot(actor.position.x - fixture.expectedTree.x, actor.position.z - fixture.expectedTree.z) < 1.5, 'Hurt squirrel recovered on an unrelated tree');
            observed.recoveredAt = tick - 39; save(); return observed;
          }
        }
        throw new Error('Hurt squirrel did not complete bounded native displacement and recovery');
      },
      cleanup: () => command('tick unfreeze')
    };
  }));
}

module.exports = { KnockbackObservation, squirrelKnockbackCases };
