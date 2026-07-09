'use strict';

const { PlaytestHarness, booleanOption } = require('./harness');
const scenarios = require('./scenarios');

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      continue;
    }

    const [rawKey, inlineValue] = arg.slice(2).split(/=(.*)/s, 2);
    const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (inlineValue !== undefined) {
      args[key] = inlineValue;
      continue;
    }

    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function option(args, key, envName, fallback) {
  if (args[key] !== undefined) {
    return args[key];
  }
  if (process.env[envName] !== undefined && process.env[envName] !== '') {
    return process.env[envName];
  }
  return fallback;
}

function printScenarioList() {
  console.log('Available scenarios:');
  Object.entries(scenarios).forEach(([name, scenario]) => {
    console.log(`  ${name.padEnd(16)} ${scenario.description}`);
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.list) {
    printScenarioList();
    return;
  }

  const scenarioName = option(args, 'scenario', 'SCENARIO', 'companion');
  const scenario = scenarios[scenarioName];
  if (!scenario) {
    printScenarioList();
    throw new Error(`Unknown scenario: ${scenarioName}`);
  }

  const harness = new PlaytestHarness({
    host: option(args, 'host', 'HOST', 'localhost'),
    port: Number(option(args, 'port', 'PORT', '25565')),
    username: option(args, 'username', 'USERNAME', 'CodexBot'),
    auth: option(args, 'auth', 'AUTH', 'offline'),
    version: option(args, 'version', 'MINECRAFT_VERSION', false),
    target: option(args, 'target', 'TARGET', ''),
    viewer: booleanOption(option(args, 'viewer', 'VIEWER', '0')),
    viewerPort: Number(option(args, 'viewerPort', 'VIEWER_PORT', '3007')),
    firstPerson: booleanOption(option(args, 'firstPerson', 'FIRST_PERSON', '1')),
    commandDelayMs: Number(option(args, 'commandDelayMs', 'COMMAND_DELAY_MS', '350')),
    connectTimeoutMs: Number(option(args, 'connectTimeoutMs', 'CONNECT_TIMEOUT_MS', '45000')),
    scenarioTimeoutMs: Number(option(args, 'scenarioTimeoutMs', 'SCENARIO_TIMEOUT_MS', scenario.keepAlive ? '0' : '120000')),
    artifactsDir: option(args, 'artifactsDir', 'ARTIFACTS_DIR', 'artifacts'),
    profilesFolder: option(args, 'profilesFolder', 'PROFILES_FOLDER', '')
  });

  let shuttingDown = false;
  const stop = async () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    console.log('Stopping playtest harness...');
    await harness.end('interrupted');
  };

  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  await harness.connect();
  await harness.snapshot('connected');

  if (harness.options.viewer) {
    harness.startViewer();
  }

  const runScenario = async () => {
    await scenario.run(harness);
  };

  if (harness.options.scenarioTimeoutMs > 0) {
    await harness.withTimeout(runScenario(), harness.options.scenarioTimeoutMs, `${scenarioName} timed out`);
  } else {
    await runScenario();
  }

  if (!scenario.keepAlive) {
    await harness.end('complete');
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
