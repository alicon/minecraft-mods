'use strict';

const assert = require('node:assert/strict');
// Native /time query gametime returns the long game clock modulo Integer.MAX_VALUE.
const GAME_TIME_MODULUS = 2147483647;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function elapsedWorldTicks(before, after) {
  for (const value of [before, after]) assert(Number.isInteger(value) && value >= 0 && value < GAME_TIME_MODULUS, 'Invalid native world clock');
  return (after - before + GAME_TIME_MODULUS) % GAME_TIME_MODULUS;
}

async function readWorldTime(command) {
  const reply = await command('time query gametime');
  assert(reply.success === true && reply.callbackSeen !== false, 'Native world-clock query failed');
  elapsedWorldTicks(reply.result, reply.result);
  return reply.result;
}

async function advanceWorldTicks(command, state, ticks, mode, { timeoutMs = 20000, pollIntervalMs = 25 } = {}) {
  assert(['step', 'sprint'].includes(mode), 'Invalid native tick mode');
  assert(Number.isInteger(ticks) && ticks > 0 && ticks < GAME_TIME_MODULUS, 'Invalid native tick count');
  const before = await readWorldTime(command);
  await command(`tick ${mode} ${ticks}t`);
  const started = Date.now(), deadline = started + timeoutMs;
  do {
    const after = await readWorldTime(command);
    const elapsed = elapsedWorldTicks(before, after);
    if (elapsed >= ticks) {
      const snapshot = await state();
      snapshot.tickAudit = { clock: 'native-gametime', before, after, expectedTicks: ticks, elapsedTicks: elapsed, mode };
      return snapshot;
    }
    await delay(pollIntervalMs);
  } while (Date.now() < deadline);
  throw new Error(`World did not complete ${ticks} native ${mode} ticks`);
}

module.exports = { GAME_TIME_MODULUS, elapsedWorldTicks, readWorldTime, advanceWorldTicks };
