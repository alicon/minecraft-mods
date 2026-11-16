'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { promisify } = require('node:util');
const execFile = promisify(require('node:child_process').execFile);
const { provenance } = require('./bridge-provenance');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function assertRestartIdentity(initial, loaded, expectedJars, actualJars) {
  assert.equal(path.resolve(loaded.savePath), path.resolve(initial.savePath), 'Restart changed the profile/save path');
  assert.deepEqual(actualJars, expectedJars, 'Installed jars changed during restart');
}

async function waitForSavedShutdown({ readFreshLog, isAlive, now = Date.now, sleep = delay, timeoutMs = 45000 }) {
  const deadline = now() + timeoutMs;
  do {
    const log = readFreshLog();
    const saved = log.includes('All dimensions are saved');
    const exited = !isAlive();
    if (saved && exited) return { saveCompleted: true, processExited: true,
      saveLogLines: log.split('\n').filter(line => /Stopping server|All dimensions are saved/.test(line)) };
    await sleep(250);
  } while (now() < deadline);
  throw new Error('Saved shutdown not verified; refusing to launch a second client');
}

// A verified disposable-world caller owns the shared mutation lock across this operation.
async function restartSavedClient({ request, state, expectedSave, instanceId, reportFile, report, save }) {
  const initial = await state();
  const profile = path.resolve(initial.savePath, '../..');
  assert.equal(path.resolve(initial.savePath), path.join(profile, 'saves', expectedSave));
  assert(instanceId || path.basename(profile) === 'Dad’s Minecraft', 'Non-default profile requires an instance ID');
  const installed = provenance(initial.savePath);
  assert(!installed.installedJarsUnavailable && installed.installedJarHashes, 'Cannot verify installed restart jars');
  report.restartProvenance = installed;
  const log = path.join(profile, 'logs/latest.log');
  const offset = fs.statSync(log).size;
  report.stage = 'quitting'; save();
  const quit = await request('/quit', { expectedSave });
  assert(Number.isInteger(quit.processId) && quit.processId > 0 && quit.processId !== process.pid, 'Invalid client process ID');
  report.quit = quit; save();
  Object.assign(report, await waitForSavedShutdown({
    readFreshLog: () => fs.readFileSync(log).subarray(offset).toString('utf8'),
    isAlive: () => {
      try { process.kill(quit.processId, 0); return true; }
      catch (error) { if (error.code === 'ESRCH') return false; throw error; }
    }
  }));
  report.stage = 'saved-shutdown'; save();
  const root = path.resolve(__dirname, '../../..');
  const env = { ...process.env, MODRINTH_PROFILE: profile, MODRINTH_INSTANCE_ID: instanceId || 'legacy:Dad’s Minecraft',
    PLAYTEST_WORLD: expectedSave, PLAYTEST_MUTE_SOUND: '0', MODRINTH_STARTUP_RETRY_SECONDS: '0' };
  report.stage = 'relaunching'; save();
  const bootLog = reportFile + '.boot.log';
  try {
    const boot = await execFile(path.join(root, 'scripts/modrinth-playtest-world.sh'), [], { cwd: root, env, timeout: 30000 });
    fs.writeFileSync(bootLog, boot.stdout + boot.stderr);
  } catch (error) {
    fs.writeFileSync(bootLog, (error.stdout || '') + (error.stderr || '')); throw error;
  }
  report.bootstrapLog = bootLog; save();
  const deadline = Date.now() + 120000;
  let lastError;
  do {
    try {
      const loaded = await state();
      assertRestartIdentity(initial, loaded, installed.installedJarHashes, provenance(loaded.savePath).installedJarHashes);
      report.firstAfterRestart = loaded;
      report.startupTicksNotIndividuallyObserved = true;
      report.stage = 'reloaded'; save();
      return loaded;
    } catch (error) { lastError = error; await delay(500); }
  } while (Date.now() < deadline);
  throw new Error(`Saved world did not reconnect within the launch bound: ${lastError?.message}`);
}

module.exports = { waitForSavedShutdown, restartSavedClient, assertRestartIdentity };
