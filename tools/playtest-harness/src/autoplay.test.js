'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { promisify } = require('node:util');
const execFile = promisify(require('node:child_process').execFile);

test('autoplay reaches smoke and screenshot with no optional report path', async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'minecraft-autoplay-'));
  try {
    fs.mkdirSync(path.join(folder, 'saves', 'Fixture'), { recursive: true });
    fs.writeFileSync(path.join(folder, 'saves', 'Fixture', 'level.dat'), 'fixture');
    const bin = path.join(folder, 'bin');
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, 'open'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    fs.writeFileSync(path.join(bin, 'node'), `#!/bin/sh
printf '%s\\n' "$@" >> "$MOCK_NODE_LOG"
case "$2" in
  state) printf '{"players":[{}],"saveName":"Fixture"}\\n' ;;
  *) printf '{"ok":true}\\n' ;;
esac
`, { mode: 0o755 });
    const log = path.join(folder, 'node.log');
    const result = await execFile('/bin/bash', [path.resolve(__dirname, '../../../scripts/modrinth-autoplay-smoke.sh')], {
      timeout: 10000,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, MOCK_NODE_LOG: log,
        MODRINTH_PROFILE: folder, PLAYTEST_WORLD: 'Fixture', BRIDGE_REPORT_FILE: '',
        PLAYTEST_BRIDGE_SCENARIO: 'smoke', MODRINTH_STARTUP_RETRY_SECONDS: '0',
        PLAYTEST_SCREENSHOT_DELAY_SECONDS: '0', PLAYTEST_BOOT_TIMEOUT_SECONDS: '3' }
    });
    assert.match(result.stdout, /Bridge loaded expected world: Fixture/);
    const calls = fs.readFileSync(log, 'utf8');
    assert.match(calls, /\nsmoke\n/);
    assert.match(calls, /\nscreenshot\n/);
  } finally { fs.rmSync(folder, { recursive: true }); }
});

test('autoplay timeout records read-only diagnostics and stays unsuccessful', async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'minecraft-boot-timeout-'));
  try {
    fs.mkdirSync(path.join(folder, 'saves', 'Fixture'), { recursive: true });
    fs.writeFileSync(path.join(folder, 'saves', 'Fixture', 'level.dat'), 'fixture');
    const bin = path.join(folder, 'bin');
    fs.mkdirSync(bin);
    for (const tool of ['open', 'ps']) {
      fs.writeFileSync(path.join(bin, tool), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    }
    await assert.rejects(execFile('/bin/bash', [path.resolve(__dirname, '../../../scripts/modrinth-autoplay-smoke.sh')], {
      timeout: 10000,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`,
        MODRINTH_PROFILE: folder, PLAYTEST_WORLD: 'Fixture', BRIDGE_REPORT_FILE: path.join(folder, 'report.json'),
        MODRINTH_STARTUP_RETRY_SECONDS: '0', PLAYTEST_BOOT_TIMEOUT_SECONDS: '0' }
    }), (error) => error.code === 1 && error.stderr.includes('no_matching_game_process')
      && error.stderr.includes('The game was left running'));
    const report = JSON.parse(fs.readFileSync(path.join(folder, 'report.boot-diagnostics.json'), 'utf8'));
    assert.equal(report.readOnly, true);
    assert.equal(report.expectedSave, 'Fixture');
    assert.deepEqual(report.matchingGameProcesses, []);
  } finally { fs.rmSync(folder, { recursive: true }); }
});
