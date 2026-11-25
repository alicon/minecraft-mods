'use strict';

const assert = require('node:assert/strict');
// Native /time query gametime returns the long game clock modulo Integer.MAX_VALUE.
const GAME_TIME_MODULUS = 2147483647;
const CLIENT_PAUSED = 'MINECRAFT_CLIENT_PAUSED';
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
  const tickCommand = `tick ${mode} ${ticks}t`;
  const evidence = { command: tickCommand, mode, expectedTicks: ticks, before, dispatch: 'unknown' };
  let requested;
  try {
    requested = await command(tickCommand);
  } catch (error) {
    error.tickInterruption = evidence;
    throw error;
  }
  assert(requested.success === true, 'Native tick request failed');
  evidence.dispatch = 'accepted';
  evidence.receipt = requested;
  const started = Date.now(), deadline = started + timeoutMs;
  let lastWorldClock = before;
  do {
    try {
      lastWorldClock = await readWorldTime(command);
    } catch (error) {
      error.tickInterruption = { ...evidence, lastWorldClock };
      throw error;
    }
    const elapsed = elapsedWorldTicks(before, lastWorldClock);
    if (elapsed >= ticks) {
      const snapshot = await state();
      snapshot.tickAudit = { clock: 'native-gametime', before, after: lastWorldClock, expectedTicks: ticks, elapsedTicks: elapsed, mode };
      return snapshot;
    }
    await delay(pollIntervalMs);
  } while (Date.now() < deadline);
  const error = new Error(`World did not complete ${ticks} native ${mode} ticks`);
  error.tickInterruption = { ...evidence, lastWorldClock };
  try {
    const snapshot = await state();
    const { integratedServerPaused, overworldGameTime, tickCount, worldFrozen, frozenTicksRemaining, worldSprinting } = snapshot;
    error.tickInterruption.observation = { integratedServerPaused, overworldGameTime, tickCount, worldFrozen, frozenTicksRemaining, worldSprinting };
    if (typeof overworldGameTime === 'string' && /^\d+$/.test(overworldGameTime)) {
      const after = Number(BigInt(overworldGameTime) % BigInt(GAME_TIME_MODULUS));
      const elapsed = elapsedWorldTicks(before, after);
      if (elapsed >= ticks) {
        snapshot.tickAudit = { clock: 'native-gametime', before, after, expectedTicks: ticks, elapsedTicks: elapsed, mode };
        return snapshot;
      }
      if (integratedServerPaused === true) {
        error.code = CLIENT_PAUSED;
        error.message = `Minecraft client paused with ${elapsed}/${ticks} native ${mode} ticks observed`;
      }
    }
  } catch (observationError) {
    error.tickInterruption.observationError = observationError.message;
  }
  throw error;
}

module.exports = { CLIENT_PAUSED, GAME_TIME_MODULUS, elapsedWorldTicks, readWorldTime, advanceWorldTicks };
