const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { cp, mkdir, mkdtemp, readFile, rm, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const test = require('node:test');
const { promisify } = require('node:util');

const run = promisify(execFile);

test('an old launcher does not fail the world after a controller takes over', {
  skip: process.platform === 'win32',
  timeout: 15_000,
}, async () => {
  const root = await mkdtemp(join(tmpdir(), 'expedition-owner-'));
  try {
    const scripts = join(root, 'scripts');
    const launcher = join(scripts, 'run-mushroom-java-survival.sh');
    await mkdir(scripts);
    await cp(resolve(__dirname, '../../../scripts/run-mushroom-java-survival.sh'), launcher);
    const bridge = join(root, 'bridge.jar');
    await writeFile(bridge, '');
    await writeFile(join(root, 'gradlew'), [
      '#!/bin/sh',
      'printf ready > "$MUSHROOM_EXPEDITION_STATUS"',
      'attempt=0',
      'while [ "$attempt" -lt 100 ]; do',
      '  case "$(cat "$MUSHROOM_EXPEDITION_STATUS")" in',
      '    finished) exit 0 ;;',
      '    failed) exit 1 ;;',
      '  esac',
      '  sleep 0.1',
      '  attempt=$((attempt + 1))',
      'done',
      'exit 1',
    ].join('\n'), { mode: 0o755 });
    const oldController = join(root, 'controller');
    await writeFile(oldController, [
      '#!/bin/sh',
      'printf "{}" > "$(dirname "$MUSHROOM_EXPEDITION_STATUS")/controller-checkpoint.json"',
      'printf held > "$MUSHROOM_EXPEDITION_STATUS"',
      '(',
      '  sleep 0.2',
      '  printf replacement > "$(dirname "$MUSHROOM_EXPEDITION_STATUS")/controller-owner"',
      '  printf ready > "$MUSHROOM_EXPEDITION_STATUS"',
      '  sleep 6',
      '  if [ "$(cat "$MUSHROOM_EXPEDITION_STATUS")" = ready ]; then',
      '    printf finished > "$MUSHROOM_EXPEDITION_STATUS"',
      '  fi',
      ') </dev/null >/dev/null 2>&1 &',
      'exit 1',
    ].join('\n'), { mode: 0o755 });
    const { stdout } = await run('sh', [launcher, bridge], {
      cwd: root,
      timeout: 12_000,
      env: {
        ...process.env,
        MUSHROOM_EXPEDITION_NODE: oldController,
        MUSHROOM_EXPEDITION_LIVE: '1',
        MUSHROOM_EXPEDITION_STAGE: 'iron',
      },
    });
    const report = stdout.trim().split('\n')[0];
    assert.equal(await readFile(join(report, 'controller-owner'), 'utf8'), 'replacement');
    assert.equal(await readFile(join(report, 'status'), 'utf8'), 'finished');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
