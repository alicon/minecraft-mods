'use strict';

const fs = require('node:fs');
const path = require('node:path');

function parseArgs(argv) {
  const args = { action: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--') && !args.action) {
      args.action = arg;
      continue;
    }
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
    if (next !== undefined && !next.startsWith('--')) {
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
  if (process.env[envName]) {
    return process.env[envName];
  }
  return fallback;
}

function putOptional(body, key, value) {
  if (value !== undefined && value !== null && value !== '') {
    body[key] = value;
  }
}

function optionNumber(args, key, envName, fallback) {
  const value = option(args, key, envName, fallback);
  if (value === undefined || value === null || value === '') {
    return value;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${key} must be a finite number`);
  }
  return parsed;
}

function optionBoolean(args, key, envName, fallback) {
  const value = option(args, key, envName, fallback);
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  if (value === true || value === false) {
    return value;
  }
  const normalized = String(value).toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }
  throw new Error(`${key} must be true or false`);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function writeReportFile(file, result) {
  if (!file) {
    return;
  }
  const resolved = path.resolve(file);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(result, null, 2)}\n`);
}

async function requestJson(baseUrl, path, method = 'GET', body = null) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  let parsed = null;
  if (text) {
    parsed = JSON.parse(text);
  }
  if (!response.ok) {
    throw new Error(`${method} ${path} failed with ${response.status}: ${text}`);
  }
  return parsed;
}

function requireCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function nearestEntity(state, type) {
  const candidates = entitiesOfType(state, type);
  return candidates[0] || null;
}

function itemEntities(state, itemId = '') {
  return entitiesOfType(state, 'minecraft:item').filter((entity) => !itemId || (entity.item && entity.item.id === itemId));
}

function entitiesOfType(state, type) {
  const candidates = new Map();
  for (const player of state.players || []) {
    for (const entity of player.nearbyEntities || []) {
      if (entity.type === type) {
        const previous = candidates.get(entity.id);
        if (!previous || entity.distance < previous.distance) {
          candidates.set(entity.id, entity);
        }
      }
    }
  }
  return Array.from(candidates.values()).sort((left, right) => left.distance - right.distance);
}

function singlePlayerName(state) {
  const players = state.players || [];
  requireCondition(players.length === 1, `Expected exactly one player, saw ${players.length}`);
  return players[0].name;
}

async function waitForEntity(baseUrl, type, timeoutMs = 10000, pollMs = 250) {
  return waitForEntityState(baseUrl, type, () => true, timeoutMs, pollMs);
}

async function waitForEntityState(baseUrl, type, predicate, timeoutMs = 10000, pollMs = 250) {
  const deadline = Date.now() + timeoutMs;
  let lastState = null;
  while (Date.now() < deadline) {
    lastState = await requestJson(baseUrl, '/state');
    const entity = entitiesOfType(lastState, type).find((candidate) => predicate(candidate));
    if (entity && predicate(entity)) {
      return entity;
    }
    await sleep(pollMs);
  }
  throw new Error(`Timed out waiting for ${type}; last state: ${JSON.stringify(lastState)}`);
}

async function waitForEntityCount(baseUrl, type, count, timeoutMs = 10000, pollMs = 250) {
  const deadline = Date.now() + timeoutMs;
  let lastState = null;
  while (Date.now() < deadline) {
    lastState = await requestJson(baseUrl, '/state');
    const entities = entitiesOfType(lastState, type);
    if (entities.length >= count) {
      return entities;
    }
    await sleep(pollMs);
  }
  throw new Error(`Timed out waiting for ${count} ${type} entities; last state: ${JSON.stringify(lastState)}`);
}

async function waitForNoEntities(baseUrl, type, timeoutMs = 10000, pollMs = 250) {
  const deadline = Date.now() + timeoutMs;
  let lastState = null;
  while (Date.now() < deadline) {
    lastState = await requestJson(baseUrl, '/state');
    const entities = entitiesOfType(lastState, type);
    if (entities.length === 0) {
      return { ok: true, type, count: 0 };
    }
    await sleep(pollMs);
  }
  throw new Error(`Timed out waiting for no ${type} entities; last state: ${JSON.stringify(lastState)}`);
}

async function waitForBlock(baseUrl, position, block, timeoutMs = 10000, pollMs = 250) {
  const deadline = Date.now() + timeoutMs;
  let lastBlock = null;
  while (Date.now() < deadline) {
    lastBlock = await requestJson(baseUrl, '/block', 'POST', position);
    if (lastBlock.block === block) {
      return lastBlock;
    }
    await sleep(pollMs);
  }
  throw new Error(`Timed out waiting for block ${block} at ${JSON.stringify(position)}; last block: ${JSON.stringify(lastBlock)}`);
}

async function waitForItemCount(baseUrl, itemId, count, timeoutMs = 10000, pollMs = 250) {
  const deadline = Date.now() + timeoutMs;
  let lastState = null;
  while (Date.now() < deadline) {
    lastState = await requestJson(baseUrl, '/state');
    const items = itemEntities(lastState, itemId);
    if (items.length === count) {
      return items;
    }
    await sleep(pollMs);
  }
  throw new Error(`Timed out waiting for ${count} item entities of ${itemId}; last state: ${JSON.stringify(lastState)}`);
}

async function blockAt(baseUrl, position) {
  return requestJson(baseUrl, '/block', 'POST', position);
}

async function runYorkieSmoke(baseUrl, args) {
  const yorkieType = option(args, 'type', 'YORKIE_ENTITY', 'mushroom_yorkie:mushroom_yorkie');
  const radius = optionNumber(args, 'radius', 'YORKIE_RADIUS', 12);
  const screenshotName = option(
    args,
    'screenshotName',
    'BRIDGE_SCREENSHOT_NAME',
    `mushroom-yorkie-smoke-${Date.now()}.png`
  );
  const steps = [];

  async function step(name, run) {
    const value = await run();
    steps.push({ name, ok: true, value });
    return value;
  }

  async function command(commandText) {
    return requestJson(baseUrl, '/command', 'POST', { command: commandText });
  }

  async function clearEntities(type) {
    return requestJson(baseUrl, '/clear-entities', 'POST', { type });
  }

  async function useYorkie(body) {
    return requestJson(baseUrl, '/use-entity', 'POST', {
      type: yorkieType,
      radius,
      ...body
    });
  }

  async function setBlockNearYorkie(body) {
    return requestJson(baseUrl, '/set-block-near-entity', 'POST', {
      type: yorkieType,
      radius,
      ...body
    });
  }

  async function setAbsoluteBlock(position, block, replace = '') {
    const body = {
      x: position.x,
      y: position.y,
      z: position.z,
      block
    };
    if (replace) {
      body.replace = replace;
    }
    return requestJson(baseUrl, '/set-block', 'POST', body);
  }

  async function mergeYorkieData(nbt) {
    await command(`data merge entity @e[type=${yorkieType},limit=1,sort=nearest] ${nbt}`);
    return waitForEntity(baseUrl, yorkieType);
  }

  async function buildFlatArena(options = {}) {
    const radius = options.radius || 6;
    const yOffset = options.yOffset || 0;
    const state = await requestJson(baseUrl, '/state');
    const player = state.players.find((candidate) => candidate.name === playerName);
    requireCondition(player, `Could not find player state for ${playerName}`);
    const base = {
      x: Math.round(player.position.x),
      y: Math.ceil(player.position.y) + yOffset,
      z: Math.round(player.position.z)
    };
    const min = { x: base.x - radius, y: base.y, z: base.z - radius };
    const max = { x: base.x + radius, y: base.y + 4, z: base.z + radius };
    const floorMin = { x: base.x - radius, y: base.y - 1, z: base.z - radius };
    const floorMax = { x: base.x + radius, y: base.y - 1, z: base.z + radius };
    const clear = await command(
      `fill ${min.x} ${min.y} ${min.z} ${max.x} ${max.y} ${max.z} minecraft:air`
    );
    const floor = await command(
      `fill ${floorMin.x} ${floorMin.y} ${floorMin.z} ${floorMax.x} ${floorMax.y} ${floorMax.z} minecraft:grass_block`
    );
    await command(`tp ${playerName} ${base.x + 0.5} ${base.y} ${base.z + 0.5}`);
    if (options.teleportYorkie) {
      await command(`tp @e[type=${yorkieType},limit=1,sort=nearest] ${base.x + 1.5} ${base.y} ${base.z + 0.5}`);
    }
    const floorBlock = await waitForBlock(
      baseUrl,
      { x: base.x, y: base.y - 1, z: base.z },
      'minecraft:grass_block',
      5000
    );
    return { base, radius, clear, floor, floorBlock };
  }

  const shelterOffsets = [
    { dx: 0, dy: 3, dz: 0 },
    { dx: 2, dy: 0, dz: 0 },
    { dx: 2, dy: 1, dz: 0 },
    { dx: 2, dy: 2, dz: 0 },
    { dx: -2, dy: 0, dz: 0 },
    { dx: -2, dy: 1, dz: 0 },
    { dx: -2, dy: 2, dz: 0 },
    { dx: 0, dy: 0, dz: 2 },
    { dx: 0, dy: 1, dz: 2 },
    { dx: 0, dy: 2, dz: 2 },
    { dx: 0, dy: 0, dz: -2 },
    { dx: 0, dy: 1, dz: -2 },
    { dx: 0, dy: 2, dz: -2 }
  ];

  async function setShelterBlocks(block, replace = '') {
    const placements = [];
    for (const offset of shelterOffsets) {
      const body = { ...offset, block };
      if (replace) {
        body.replace = replace;
      }
      placements.push(await setBlockNearYorkie(body));
    }
    return placements;
  }

  const playerName = singlePlayerName(await requestJson(baseUrl, '/state'));
  let placedShelterBlocks = [];
  await step('prepare world', async () => {
    await command('time set day');
    await command('weather clear');
    await command('gamerule doMobSpawning false');
    await command('gamerule doDaylightCycle false');
    await command('gamerule doMobLoot false');
    await clearEntities('cops_robbers:bank_robber');
    await clearEntities('cops_robbers:police_cruiser');
    await clearEntities(yorkieType);
    const arena = await buildFlatArena({ radius: 6 });
    const cleared = await clearEntities(yorkieType);
    const chat = await requestJson(baseUrl, '/chat', 'POST', { message: 'Mushroom Yorkie runtime smoke starting.' });
    return { arena, cleared, chat };
  });

  await step('duplicate claim guard', async () => {
    const result = {};
    try {
      await command(`execute at ${playerName} run summon ${yorkieType} ^ ^ ^4`);
      await waitForEntity(baseUrl, yorkieType);
      const claimed = await useYorkie({
        item: 'mushroom_yorkie:yorkie_treat',
        count: 2
      });
      requireCondition(
        claimed.target.tameable && claimed.target.tameable.tame,
        'Initial Yorkie in duplicate-claim guard did not become tame'
      );
      await useYorkie({ emptyHand: true });

      await command(`execute at ${playerName} run summon ${yorkieType} ^ ^ ^1`);
      await waitForEntityCount(baseUrl, yorkieType, 2);
      const duplicate = await useYorkie({
        item: 'mushroom_yorkie:yorkie_treat',
        count: 2
      });
      requireCondition(
        duplicate.target.tameable && !duplicate.target.tameable.tame,
        'Second loaded Yorkie became tame despite one-Mushroom-per-player guard'
      );
      result.claimed = claimed.target;
      result.duplicate = duplicate.target;
      return result;
    } finally {
      result.cleared = await clearEntities(yorkieType);
    }
  });

  await step('summon yorkie', async () => {
    await command(`execute at ${playerName} run summon ${yorkieType} ^ ^ ^3`);
    return waitForEntity(baseUrl, yorkieType);
  });

  const tamed = await step('tame with treat', async () => useYorkie({
    item: 'mushroom_yorkie:yorkie_treat',
    count: 2
  }));
  requireCondition(tamed.target.tameable && tamed.target.tameable.tame, 'Yorkie did not become tame after treat interaction');
  requireCondition(tamed.target.tameable.ownedByPlayer, 'Yorkie is tame but not owned by the current player');
  requireCondition(tamed.target.custom && tamed.target.custom.needs, 'Yorkie treat interaction did not expose needs state');
  requireCondition(
    tamed.target.custom.needs.potty === 20 && tamed.target.custom.needs.mood === 98 && tamed.target.custom.needs.energy === 88,
    `Treat effects were not applied exactly once; needs=${JSON.stringify(tamed.target.custom.needs)}`
  );

  const sitting = await step('empty-hand sit toggle', async () => useYorkie({
    emptyHand: true
  }));
  requireCondition(sitting.target.tameable.orderedToSit, 'Yorkie did not switch to ordered sitting');

  const following = await step('empty-hand follow toggle', async () => useYorkie({
    emptyHand: true
  }));
  requireCondition(!following.target.tameable.orderedToSit, 'Yorkie did not switch back to following');

  const harnessed = await step('equip harness', async () => useYorkie({
    item: 'mushroom_yorkie:yorkie_harness',
    count: 1
  }));
  requireCondition(harnessed.target.custom && harnessed.target.custom.harness, 'Yorkie did not report harness equipped');

  const harnessRemoved = await step('remove harness', async () => useYorkie({
    item: 'mushroom_yorkie:yorkie_harness',
    count: 1
  }));
  requireCondition(!harnessRemoved.target.custom.harness, 'Yorkie did not report harness removed');

  const leadBlocked = await step('lead blocked without harness', async () => useYorkie({
    item: 'minecraft:lead',
    count: 1
  }));
  requireCondition(leadBlocked.consumed, 'Lead interaction without harness was not handled');
  requireCondition(!leadBlocked.target.custom.harness, 'Lead interaction unexpectedly equipped a harness');
  requireCondition(!leadBlocked.target.leash || !leadBlocked.target.leash.leashed, 'Lead attached without a harness');

  const reharnessed = await step('re-equip harness', async () => useYorkie({
    item: 'mushroom_yorkie:yorkie_harness',
    count: 1
  }));
  requireCondition(reharnessed.target.custom && reharnessed.target.custom.harness, 'Yorkie did not report harness re-equipped');

  const toy = await step('play with chew toy', async () => useYorkie({
    item: 'mushroom_yorkie:yorkie_chew_toy',
    count: 1
  }));
  requireCondition(toy.consumed, 'Yorkie chew toy interaction was not consumed');
  requireCondition(toy.target.custom && toy.target.custom.needs, 'Yorkie chew toy interaction did not expose needs state');
  requireCondition(
    toy.target.custom.needs.mood === 100 && toy.target.custom.needs.energy === 84,
    `Chew toy effects were not applied exactly once; needs=${JSON.stringify(toy.target.custom.needs)}`
  );

  const food = await step('feed player food', async () => useYorkie({
    item: 'minecraft:apple',
    count: 1
  }));
  requireCondition(food.consumed, 'Yorkie player-food interaction was not consumed');
  requireCondition(food.target.custom && food.target.custom.needs, 'Yorkie player-food interaction did not expose needs state');
  requireCondition(
    food.target.custom.needs.potty === 28 && food.target.custom.needs.mood === 100 && food.target.custom.needs.energy === 88,
    `Player-food effects were not applied exactly once; needs=${JSON.stringify(food.target.custom.needs)}`
  );

  const seatedForSleep = await step('seat for sleep setup', async () => useYorkie({
    emptyHand: true
  }));
  requireCondition(seatedForSleep.target.tameable.orderedToSit, 'Yorkie did not sit for deterministic sleep setup');

  const sleeping = await step('sheltered night sleep', async () => {
    await command(`clear ${playerName}`);
    placedShelterBlocks = await setShelterBlocks('minecraft:oak_planks');
    await command('time set night');
    return waitForEntityState(
      baseUrl,
      yorkieType,
      (entity) => entity.custom && entity.custom.curledUpSleeping,
      15000
    );
  });
  requireCondition(sleeping.custom.curledUpSleeping, 'Yorkie did not curl up sleeping under shelter at night');

  const firstPoke = await step('sleep first poke stays asleep', async () => useYorkie({
    emptyHand: true
  }));
  requireCondition(firstPoke.target.custom.curledUpSleeping, 'First sleep poke woke Yorkie unexpectedly');
  const awake = await step('sleep double-click wakes', async () => useYorkie({
    emptyHand: true
  }));
  requireCondition(!awake.target.custom.curledUpSleeping, 'Yorkie did not wake after sleeping double-click');

  const followingAfterSleep = await step('post-sleep follow toggle', async () => useYorkie({
    emptyHand: true
  }));
  requireCondition(!followingAfterSleep.target.tameable.orderedToSit, 'Yorkie did not switch back to following after sleep');

  await step('restore daylight', async () => command('time set day'));

  await step('cleanup shelter', async () => {
    const placements = [];
    for (const placement of placedShelterBlocks) {
      placements.push(await setAbsoluteBlock(placement.position, 'minecraft:air', 'minecraft:oak_planks'));
    }
    return { placements };
  });

  const domesticCare = await step('domestic bowl care', async () => {
    const placed = [];
    try {
      await mergeYorkieData('{Hunger:90,Potty:20,Mood:60,Energy:50,LastFoodBowlDay:-1L,LastWaterBowlDay:-1L}');
      const hungry = await waitForEntityState(
        baseUrl,
        yorkieType,
        (entity) => entity.custom && entity.custom.needs && entity.custom.needs.hunger >= 90,
        5000
      );
      const foodBowl = await setBlockNearYorkie({ dx: 2, dy: 0, dz: 0, block: 'mushroom_yorkie:dog_food_bowl' });
      const waterBowl = await setBlockNearYorkie({ dx: -2, dy: 0, dz: 0, block: 'mushroom_yorkie:dog_water_bowl' });
      placed.push(foodBowl.position, waterBowl.position);

      const foodEmpty = await waitForBlock(baseUrl, foodBowl.position, 'mushroom_yorkie:dog_bowl', 20000);
      const afterFood = await waitForEntityState(
        baseUrl,
        yorkieType,
        (entity) => entity.custom && entity.custom.needs && entity.custom.needs.hunger <= 35,
        5000
      );
      const waterEmpty = await waitForBlock(baseUrl, waterBowl.position, 'mushroom_yorkie:dog_bowl', 25000);
      const afterWater = await waitForEntityState(
        baseUrl,
        yorkieType,
        (entity) => entity.custom && entity.custom.domestic && entity.custom.domestic.lastWaterBowlDay >= 0,
        5000
      );

      requireCondition(
        afterWater.custom.domestic.lastFoodBowlDay === afterWater.custom.domestic.lastWaterBowlDay,
        'Food and water bowl use did not record the same current day'
      );
      requireCondition(
        afterFood.custom.needs.hunger >= 20 && afterFood.custom.needs.hunger <= 35,
        `Food bowl effects were not applied exactly once; hunger=${afterFood.custom.needs.hunger}`
      );
      requireCondition(
        afterFood.custom.needs.potty >= 40 && afterFood.custom.needs.potty <= 55,
        `Food bowl effects were not applied exactly once; potty=${afterFood.custom.needs.potty}`
      );
      requireCondition(
        afterWater.custom.needs.hunger >= 20 && afterWater.custom.needs.hunger <= 35,
        `Water bowl should not change hunger after one food meal; hunger=${afterWater.custom.needs.hunger}`
      );
      requireCondition(
        afterWater.custom.needs.potty >= 48 && afterWater.custom.needs.potty <= 65,
        `Water bowl effects were not applied exactly once; potty=${afterWater.custom.needs.potty}`
      );

      await mergeYorkieData('{Hunger:90}');
      const refillFood = await setBlockNearYorkie({ dx: 2, dy: 0, dz: 1, block: 'mushroom_yorkie:dog_food_bowl' });
      const refillWater = await setBlockNearYorkie({ dx: -2, dy: 0, dz: -1, block: 'mushroom_yorkie:dog_water_bowl' });
      placed.push(refillFood.position, refillWater.position);
      await sleep(5000);
      const refillFoodBlock = await blockAt(baseUrl, refillFood.position);
      const refillWaterBlock = await blockAt(baseUrl, refillWater.position);
      const afterRefillWait = await waitForEntity(baseUrl, yorkieType);
      requireCondition(
        refillFoodBlock.block === 'mushroom_yorkie:dog_food_bowl',
        `Yorkie reused a food bowl on the same day; block=${JSON.stringify(refillFoodBlock)}`
      );
      requireCondition(
        refillWaterBlock.block === 'mushroom_yorkie:dog_water_bowl',
        `Yorkie reused a water bowl on the same day; block=${JSON.stringify(refillWaterBlock)}`
      );
      requireCondition(
        afterRefillWait.custom.domestic.lastFoodBowlDay === afterWater.custom.domestic.lastFoodBowlDay
          && afterRefillWait.custom.domestic.lastWaterBowlDay === afterWater.custom.domestic.lastWaterBowlDay,
        `Same-day bowl refill changed domestic day markers; domestic=${JSON.stringify(afterRefillWait.custom.domestic)}`
      );
      return {
        hungry,
        foodBowl,
        waterBowl,
        foodEmpty,
        afterFood,
        waterEmpty,
        afterWater,
        refillFood,
        refillWater,
        refillFoodBlock,
        refillWaterBlock,
        afterRefillWait
      };
    } finally {
      for (const position of placed) {
        await setAbsoluteBlock(position, 'minecraft:air');
      }
    }
  });
  requireCondition(domesticCare.afterFood.custom.needs.hunger <= 35, 'Yorkie did not eat from the dog food bowl');

  const outdoorRelief = await step('outdoor potty relief', async () => {
    const platform = await buildFlatArena({ radius: 5, yOffset: 16, teleportYorkie: true });
    await mergeYorkieData('{Potty:90,LastReliefDay:-1L}');
    const needsOutside = await waitForEntityState(
      baseUrl,
      yorkieType,
      (entity) => entity.custom && entity.custom.needs && entity.custom.needs.potty >= 90,
      5000
    );
    const relieved = await waitForEntityState(
      baseUrl,
      yorkieType,
      (entity) => entity.custom && entity.custom.needs && entity.custom.needs.potty <= 10,
      10000
    );
    return { platform, needsOutside, relieved };
  });
  requireCondition(outdoorRelief.relieved.custom.needs.potty <= 10, 'Yorkie did not relieve himself under open sky');

  const screenshot = await step('screenshot', async () => requestJson(baseUrl, '/screenshot', 'POST', {
    name: screenshotName,
    resume: true,
    hideGui: true,
    clearChat: true
  }));

  const leadAttached = await step('lead attaches with harness', async () => useYorkie({
    item: 'minecraft:lead',
    count: 1
  }));
  requireCondition(leadAttached.consumed, 'Lead interaction with harness was not consumed');
  requireCondition(leadAttached.target.leash && leadAttached.target.leash.leashed, 'Lead did not attach with harness equipped');
  requireCondition(
    leadAttached.target.leash.holderName === playerName,
    `Leash holder was ${leadAttached.target.leash.holderName || 'unset'}, expected ${playerName}`
  );

  return {
    ok: true,
    scenario: 'yorkie-smoke',
    entity: yorkieType,
    screenshot: screenshot.file,
    steps
  };
}

async function runYorkieWaterSmoke(baseUrl, args) {
  const yorkieType = option(args, 'type', 'YORKIE_ENTITY', 'mushroom_yorkie:mushroom_yorkie');
  const radius = optionNumber(args, 'radius', 'YORKIE_RADIUS', 12);
  const fetchItem = option(args, 'item', 'YORKIE_FETCH_ITEM', 'minecraft:bone');
  const screenshotName = option(
    args,
    'screenshotName',
    'BRIDGE_SCREENSHOT_NAME',
    `mushroom-yorkie-water-${Date.now()}.png`
  );
  const steps = [];

  async function step(name, run) {
    const value = await run();
    steps.push({ name, ok: true, value });
    return value;
  }

  async function command(commandText) {
    return requestJson(baseUrl, '/command', 'POST', { command: commandText });
  }

  async function clearEntities(type) {
    return requestJson(baseUrl, '/clear-entities', 'POST', { type });
  }

  async function setAbsoluteBlock(position, block, replace = '') {
    const body = {
      x: position.x,
      y: position.y,
      z: position.z,
      block
    };
    if (replace) {
      body.replace = replace;
    }
    return requestJson(baseUrl, '/set-block', 'POST', body);
  }

  async function useYorkie(body) {
    return requestJson(baseUrl, '/use-entity', 'POST', {
      type: yorkieType,
      radius,
      ...body
    });
  }

  async function playerAbilities(body) {
    return requestJson(baseUrl, '/player-abilities', 'POST', body);
  }

  async function mergeYorkieData(nbt) {
    await command(`data merge entity @e[type=${yorkieType},limit=1,sort=nearest] ${nbt}`);
    return waitForEntity(baseUrl, yorkieType);
  }

  async function buildArena(arenaRadius = 10) {
    const state = await requestJson(baseUrl, '/state');
    const player = state.players.find((candidate) => candidate.name === playerName);
    requireCondition(player, `Could not find player state for ${playerName}`);
    const base = {
      x: Math.round(player.position.x),
      y: Math.ceil(player.position.y),
      z: Math.round(player.position.z)
    };
    await command(
      `fill ${base.x - arenaRadius} ${base.y} ${base.z - arenaRadius} ${base.x + arenaRadius} ${base.y + 5} ${base.z + arenaRadius} minecraft:air`
    );
    await command(
      `fill ${base.x - arenaRadius} ${base.y - 1} ${base.z - arenaRadius} ${base.x + arenaRadius} ${base.y - 1} ${base.z + arenaRadius} minecraft:grass_block`
    );
    await command(`tp ${playerName} ${base.x + 0.5} ${base.y} ${base.z + 0.5}`);
    const floorBlock = await waitForBlock(baseUrl, { x: base.x, y: base.y - 1, z: base.z }, 'minecraft:grass_block', 5000);
    return { base, radius: arenaRadius, floorBlock };
  }

  async function summonItem(position, itemId = fetchItem) {
    await clearEntities('minecraft:item');
    await command(`summon item ${position.x} ${position.y} ${position.z} {Item:{id:"${itemId}",count:1}}`);
    const items = await waitForItemCount(baseUrl, itemId, 1, 5000);
    return items[0];
  }

  async function resetFetchNeeds() {
    return mergeYorkieData('{Hunger:0,Potty:0,Mood:60,Energy:80}');
  }

  async function waitForFetchReturn(label) {
    const beforeNeeds = await resetFetchNeeds();
    await waitForItemCount(baseUrl, fetchItem, 0, 25000);
    const returned = await waitForEntityState(
      baseUrl,
      yorkieType,
      (entity) => entity.custom
        && entity.custom.needs
        && entity.custom.needs.mood >= 74
        && entity.custom.needs.energy <= 76,
      10000
    );
    await sleep(500);
    const settled = await waitForEntity(baseUrl, yorkieType);
    requireCondition(
      settled.custom.needs.mood >= 74 && settled.custom.needs.mood <= 78,
      `${label} fetch return effects were not applied exactly once; needs=${JSON.stringify(settled.custom.needs)}`
    );
    requireCondition(
      settled.custom.needs.energy >= 75 && settled.custom.needs.energy <= 76,
      `${label} fetch return energy was not applied exactly once; needs=${JSON.stringify(settled.custom.needs)}`
    );
    return { label, beforeNeeds, returned, settled };
  }

  async function assertFetchRefused(label) {
    const beforeNeeds = await resetFetchNeeds();
    await sleep(4500);
    const state = await requestJson(baseUrl, '/state');
    const items = itemEntities(state, fetchItem);
    const yorkie = nearestEntity(state, yorkieType);
    requireCondition(items.length === 1, `${label} fetch should leave one ${fetchItem} item, saw ${items.length}`);
    requireCondition(yorkie && yorkie.custom && yorkie.custom.needs, `${label} fetch did not expose Yorkie needs`);
    const before = beforeNeeds.custom.needs;
    const after = yorkie.custom.needs;
    requireCondition(
      after.mood < before.mood + 10 && after.energy > before.energy - 4,
      `${label} fetch applied play reward despite refusal; before=${JSON.stringify(before)} after=${JSON.stringify(after)}`
    );
    return { label, beforeNeeds, item: items[0], yorkie };
  }

  async function waterBlock(position, covered) {
    const water = await setAbsoluteBlock(position, 'minecraft:water');
    const cover = covered ? await setAbsoluteBlock({ x: position.x, y: position.y + 1, z: position.z }, 'minecraft:glass') : null;
    return { water, cover };
  }

  async function coveredWaterCell(position) {
    const wallOffsets = [
      { x: 1, z: 0 },
      { x: -1, z: 0 },
      { x: 0, z: 1 },
      { x: 0, z: -1 }
    ];
    const walls = [];
    for (const offset of wallOffsets) {
      walls.push(await setAbsoluteBlock({ x: position.x + offset.x, y: position.y, z: position.z + offset.z }, 'minecraft:glass'));
    }
    const water = await setAbsoluteBlock(position, 'minecraft:water');
    const cover = await setAbsoluteBlock({ x: position.x, y: position.y + 1, z: position.z }, 'minecraft:glass');
    return { water, cover, walls };
  }

  const playerName = singlePlayerName(await requestJson(baseUrl, '/state'));
  let arenaBase = null;
  await step('prepare water arena', async () => {
    await command('time set day');
    await command('weather clear');
    await command('difficulty peaceful');
    await command(`gamemode survival ${playerName}`);
    await command(`clear ${playerName}`);
    await clearEntities('minecraft:item');
    await clearEntities('cops_robbers:bank_robber');
    await clearEntities('cops_robbers:police_cruiser');
    await clearEntities(yorkieType);
    const arena = await buildArena(10);
    await clearEntities('cops_robbers:bank_robber');
    await clearEntities('cops_robbers:police_cruiser');
    arenaBase = arena.base;
    await clearEntities(yorkieType);
    await requestJson(baseUrl, '/chat', 'POST', { message: 'Mushroom Yorkie water/fetch smoke starting.' });
    return arena;
  });

  await step('summon and tame yorkie', async () => {
    await command(`summon ${yorkieType} ${arenaBase.x + 2.5} ${arenaBase.y} ${arenaBase.z + 0.5}`);
    await waitForEntity(baseUrl, yorkieType);
    const tamed = await useYorkie({
      item: 'mushroom_yorkie:yorkie_treat',
      count: 2
    });
    requireCondition(tamed.target.tameable && tamed.target.tameable.tame, 'Yorkie did not become tame for water/fetch test');
    requireCondition(!tamed.target.tameable.orderedToSit, 'Yorkie started water/fetch test sitting');
    await command(`clear ${playerName}`);
    return tamed;
  });

  await step('dry ground fetch returns', async () => {
    const toy = await summonItem({ x: arenaBase.x + 4.5, y: arenaBase.y + 1.0, z: arenaBase.z + 0.5 });
    const returned = await waitForFetchReturn('dry ground');
    await command(`clear ${playerName} ${fetchItem}`);
    return { toy, returned };
  });

  await step('shallow water fetch returns', async () => {
    const water = await waterBlock({ x: arenaBase.x + 6, y: arenaBase.y - 1, z: arenaBase.z + 4 }, false);
    const toy = await summonItem({ x: arenaBase.x + 6.5, y: arenaBase.y - 0.2, z: arenaBase.z + 4.5 });
    const returned = await waitForFetchReturn('shallow water');
    await command(`clear ${playerName} ${fetchItem}`);
    await setAbsoluteBlock(water.water.position, 'minecraft:grass_block', 'minecraft:water');
    return { water, toy, returned };
  });

  await step('covered water fetch is refused', async () => {
    const water = await coveredWaterCell({ x: arenaBase.x - 6, y: arenaBase.y, z: arenaBase.z + 4 });
    const toy = await summonItem({ x: arenaBase.x - 5.5, y: arenaBase.y + 0.2, z: arenaBase.z + 4.5 });
    const refused = await assertFetchRefused('covered water');
    await clearEntities('minecraft:item');
    await setAbsoluteBlock(water.cover.position, 'minecraft:air', 'minecraft:glass');
    for (const wall of water.walls) {
      await setAbsoluteBlock(wall.position, 'minecraft:air', 'minecraft:glass');
    }
    await setAbsoluteBlock(water.water.position, 'minecraft:air', 'minecraft:water');
    return { water, toy, refused };
  });

  await step('survival cliff drop fetch is refused', async () => {
    const ledge = await setAbsoluteBlock({ x: arenaBase.x - 7, y: arenaBase.y - 6, z: arenaBase.z - 4 }, 'minecraft:grass_block');
    await setAbsoluteBlock({ x: arenaBase.x - 7, y: arenaBase.y - 5, z: arenaBase.z - 4 }, 'minecraft:air');
    const toy = await summonItem({ x: arenaBase.x - 6.5, y: arenaBase.y - 5.0, z: arenaBase.z - 3.5 });
    const refused = await assertFetchRefused('survival cliff drop');
    await clearEntities('minecraft:item');
    await setAbsoluteBlock(ledge.position, 'minecraft:air', 'minecraft:grass_block');
    return { ledge, toy, refused };
  });

  const screenshot = await step('screenshot', async () => requestJson(baseUrl, '/screenshot', 'POST', {
    name: screenshotName,
    resume: true,
    hideGui: true,
    clearChat: true
  }));

  return {
    ok: true,
    scenario: 'yorkie-water-smoke',
    entity: yorkieType,
    item: fetchItem,
    screenshot: screenshot.file,
    steps
  };
}

async function runYorkieAdventureSmoke(baseUrl, args) {
  const yorkieType = option(args, 'type', 'YORKIE_ENTITY', 'mushroom_yorkie:mushroom_yorkie');
  const radius = optionNumber(args, 'radius', 'YORKIE_RADIUS', 12);
  const screenshotName = option(
    args,
    'screenshotName',
    'BRIDGE_SCREENSHOT_NAME',
    `mushroom-yorkie-adventure-${Date.now()}.png`
  );
  const steps = [];

  async function step(name, run) {
    const value = await run();
    steps.push({ name, ok: true, value });
    return value;
  }

  async function command(commandText) {
    return requestJson(baseUrl, '/command', 'POST', { command: commandText });
  }

  async function clearEntities(type) {
    return requestJson(baseUrl, '/clear-entities', 'POST', { type });
  }

  async function playerAbilities(body) {
    return requestJson(baseUrl, '/player-abilities', 'POST', body);
  }

  async function useYorkie(body) {
    return requestJson(baseUrl, '/use-entity', 'POST', {
      type: yorkieType,
      radius,
      ...body
    });
  }

  async function setAbsoluteBlock(position, block, replace = '') {
    const body = { ...position, block };
    if (replace) {
      body.replace = replace;
    }
    return requestJson(baseUrl, '/set-block', 'POST', body);
  }

  async function buildArena(arenaRadius = 12) {
    const state = await requestJson(baseUrl, '/state');
    const player = state.players.find((candidate) => candidate.name === playerName);
    requireCondition(player, `Could not find player state for ${playerName}`);
    const base = {
      x: Math.round(player.position.x),
      y: Math.ceil(player.position.y),
      z: Math.round(player.position.z)
    };
    await command(
      `fill ${base.x - arenaRadius} ${base.y} ${base.z - arenaRadius} ${base.x + arenaRadius} ${base.y + 18} ${base.z + arenaRadius} minecraft:air`
    );
    await command(
      `fill ${base.x - arenaRadius} ${base.y - 1} ${base.z - arenaRadius} ${base.x + arenaRadius} ${base.y - 1} ${base.z + arenaRadius} minecraft:grass_block`
    );
    await command(`tp ${playerName} ${base.x + 0.5} ${base.y} ${base.z + 0.5}`);
    const floorBlock = await waitForBlock(baseUrl, { x: base.x, y: base.y - 1, z: base.z }, 'minecraft:grass_block', 5000);
    return { base, radius: arenaRadius, floorBlock };
  }

  async function waterCell(position) {
    const walls = [];
    for (const offset of [
      { x: 1, z: 0 },
      { x: -1, z: 0 },
      { x: 0, z: 1 },
      { x: 0, z: -1 }
    ]) {
      walls.push(await setAbsoluteBlock({ x: position.x + offset.x, y: position.y, z: position.z + offset.z }, 'minecraft:glass'));
    }
    const water = await setAbsoluteBlock(position, 'minecraft:water');
    return { water, walls };
  }

  async function skyPlatform(position, halfSize = 2) {
    await command(
      `fill ${position.x - halfSize} ${position.y - 1} ${position.z - halfSize} ${position.x + halfSize} ${position.y - 1} ${position.z + halfSize} minecraft:smooth_quartz`
    );
    return waitForBlock(baseUrl, { x: position.x, y: position.y - 1, z: position.z }, 'minecraft:smooth_quartz', 5000);
  }

  async function tameYorkie(position) {
    await command(`summon ${yorkieType} ${position.x} ${position.y} ${position.z}`);
    await waitForEntity(baseUrl, yorkieType);
    const tamed = await useYorkie({
      item: 'mushroom_yorkie:yorkie_treat',
      count: 2
    });
    requireCondition(tamed.target.tameable && tamed.target.tameable.tame, 'Yorkie did not become tame for adventure test');
    await command(`clear ${playerName}`);
    return tamed;
  }

  const playerName = singlePlayerName(await requestJson(baseUrl, '/state'));
  let arenaBase = null;

  await step('prepare adventure arena', async () => {
    await command('time set day');
    await command('weather clear');
    await command('difficulty peaceful');
    await command(`gamemode survival ${playerName}`);
    await command(`clear ${playerName}`);
    await clearEntities('minecraft:item');
    await clearEntities('cops_robbers:bank_robber');
    await clearEntities('cops_robbers:police_cruiser');
    await clearEntities(yorkieType);
    const arena = await buildArena(12);
    arenaBase = arena.base;
    await clearEntities('cops_robbers:bank_robber');
    await clearEntities('cops_robbers:police_cruiser');
    await requestJson(baseUrl, '/chat', 'POST', { message: 'Mushroom Yorkie adventure smoke starting.' });
    return arena;
  });

  await step('summon and tame yorkie', async () => tameYorkie({
    x: arenaBase.x + 2.5,
    y: arenaBase.y,
    z: arenaBase.z + 0.5
  }));

  await step('dry sit toggles on', async () => {
    await command(`tp @e[type=${yorkieType},limit=1,sort=nearest] ${arenaBase.x + 1.5} ${arenaBase.y} ${arenaBase.z + 0.5}`);
    const sat = await useYorkie({ emptyHand: true });
    requireCondition(sat.target.tameable && sat.target.tameable.orderedToSit, 'Yorkie did not sit on dry ground');
    return sat;
  });

  await step('water forces follow', async () => {
    const cell = await waterCell({ x: arenaBase.x + 5, y: arenaBase.y, z: arenaBase.z });
    await command(`tp @e[type=${yorkieType},limit=1,sort=nearest] ${arenaBase.x + 5.5} ${arenaBase.y} ${arenaBase.z + 0.5}`);
    const wet = await waitForEntityState(
      baseUrl,
      yorkieType,
      (entity) => entity.inWater && entity.tameable && !entity.tameable.orderedToSit,
      8000
    );
    return { cell, wet };
  });

  await step('creative wet recovery starts', async () => {
    await command(`gamemode creative ${playerName}`);
    await playerAbilities({ flying: false, mayfly: true });
    await command(`tp ${playerName} ${arenaBase.x + 0.5} ${arenaBase.y} ${arenaBase.z + 0.5}`);
    await command(`tp @e[type=${yorkieType},limit=1,sort=nearest] ${arenaBase.x + 5.5} ${arenaBase.y} ${arenaBase.z + 0.5}`);
    const recovery = await waitForEntityState(
      baseUrl,
      yorkieType,
      (entity) => entity.noGravity || entity.distance <= 4.0,
      10000
    );
    requireCondition(recovery.noGravity || recovery.distance <= 4.0, `Yorkie did not begin wet creative recovery; state=${JSON.stringify(recovery)}`);
    return recovery;
  });

  await step('creative flying follow climbs', async () => {
    const platform = { x: arenaBase.x - 5, y: arenaBase.y + 14, z: arenaBase.z - 5 };
    const platformBlock = await skyPlatform(platform, 2);
    await command(`tp ${playerName} ${platform.x + 0.5} ${platform.y + 4} ${platform.z + 0.5}`);
    const abilities = await playerAbilities({ flying: true, mayfly: true });
    requireCondition(abilities.abilities && abilities.abilities.flying, 'Bridge did not put player into creative flying state');
    await command(`tp @e[type=${yorkieType},limit=1,sort=nearest] ${arenaBase.x + 4.5} ${arenaBase.y} ${arenaBase.z + 4.5}`);
    const flyingState = await waitForEntityState(
      baseUrl,
      yorkieType,
      (entity) => entity.noGravity && entity.position.y >= arenaBase.y + 2,
      16000
    );
    const closeState = await waitForEntityState(
      baseUrl,
      yorkieType,
      (entity) => entity.noGravity && entity.distance <= 7.0,
      30000
    );
    const state = await requestJson(baseUrl, '/state');
    const player = state.players.find((candidate) => candidate.name === playerName);
    requireCondition(player && player.abilities && player.abilities.creative && player.abilities.flying, 'Player was not in creative flying state');
    return { platform: platformBlock, abilities, player, flyingState, closeState };
  });

  const screenshot = await step('screenshot', async () => requestJson(baseUrl, '/screenshot', 'POST', {
    name: screenshotName,
    resume: true,
    hideGui: true,
    clearChat: true
  }));

  return {
    ok: true,
    scenario: 'yorkie-adventure-smoke',
    entity: yorkieType,
    screenshot: screenshot.file,
    steps
  };
}

async function runYorkieVisualSweep(baseUrl, args) {
  const yorkieType = option(args, 'type', 'YORKIE_ENTITY', 'mushroom_yorkie:mushroom_yorkie');
  const requestedName = option(args, 'screenshotName', 'BRIDGE_SCREENSHOT_NAME', '');
  const screenshotPrefix = (requestedName || `mushroom-yorkie-gallery-${Date.now()}`)
    .replace(/\.png$/i, '')
    .replace(/[^A-Za-z0-9._-]/g, '-');
  const visualX = Math.round(optionNumber(args, 'visualX', 'YORKIE_VISUAL_X', 0));
  const visualY = Math.round(optionNumber(args, 'visualY', 'YORKIE_VISUAL_Y', 178));
  const visualZ = Math.round(optionNumber(args, 'visualZ', 'YORKIE_VISUAL_Z', 0));
  const radius = optionNumber(args, 'radius', 'YORKIE_RADIUS', 18);
  const steps = [];

  async function step(name, run) {
    const value = await run();
    steps.push({ name, ok: true, value });
    return value;
  }

  async function command(commandText) {
    return requestJson(baseUrl, '/command', 'POST', { command: commandText });
  }

  async function checkedCommand(commandText) {
    const result = await command(commandText);
    requireCondition(result.success !== false, `Command failed: ${commandText}`);
    return result;
  }

  async function clearEntities(type) {
    return requestJson(baseUrl, '/clear-entities', 'POST', { type });
  }

  async function setAbsoluteBlock(position, block, replace = '') {
    const body = { ...position, block };
    if (replace) {
      body.replace = replace;
    }
    return requestJson(baseUrl, '/set-block', 'POST', body);
  }

  async function useBlock(body) {
    return requestJson(baseUrl, '/use-block', 'POST', body);
  }

  async function useYorkie(body) {
    return requestJson(baseUrl, '/use-entity', 'POST', {
      type: yorkieType,
      radius,
      ...body
    });
  }

  async function playerAbilities(body) {
    return requestJson(baseUrl, '/player-abilities', 'POST', body);
  }

  async function mergeYorkieData(nbt) {
    await command(`data merge entity @e[type=${yorkieType},limit=1,sort=nearest] ${nbt}`);
    return waitForEntity(baseUrl, yorkieType);
  }

  async function freezeEntity(type) {
    await command(`data merge entity @e[type=${type},limit=1,sort=nearest] {NoAI:1b}`);
    return waitForEntity(baseUrl, type);
  }

  async function screenshot(suffix, options = {}) {
    const shot = await requestJson(baseUrl, '/screenshot', 'POST', {
      name: `${screenshotPrefix}-${suffix}.png`,
      resume: true,
      hideGui: options.hideGui !== false,
      clearChat: options.clearChat !== false
    });
    return shot.file;
  }

  async function cameraShot(suffix, camera, target, options = {}) {
    await checkedCommand(`gamemode spectator ${playerName}`);
    await checkedCommand(`tp ${playerName} ${camera.x} ${camera.y} ${camera.z} facing ${target.x} ${target.y} ${target.z}`);
    await sleep(options.delayMillis || 650);
    return screenshot(suffix, options);
  }

  function point(dx, dy = 0, dz = 0) {
    return { x: visualX + dx, y: visualY + dy, z: visualZ + dz };
  }

  function horizontalDistanceSqr(first, second) {
    const dx = first.position.x - second.position.x;
    const dz = first.position.z - second.position.z;
    return dx * dx + dz * dz;
  }

  async function waitForEntityPair(targetType, predicate, timeoutMillis, failureMessage) {
    const deadline = Date.now() + timeoutMillis;
    let last;
    while (Date.now() <= deadline) {
      const yorkie = await waitForEntity(baseUrl, yorkieType, 1000);
      const target = await waitForEntity(baseUrl, targetType, 1000);
      last = { yorkie, target };
      if (predicate(yorkie, target)) {
        return last;
      }
      await sleep(250);
    }
    throw new Error(`${failureMessage}: ${JSON.stringify(last)}`);
  }

  async function waitForYorkieAndItem(itemId, predicate, timeoutMillis, failureMessage) {
    const deadline = Date.now() + timeoutMillis;
    let last;
    while (Date.now() <= deadline) {
      const yorkie = await waitForEntity(baseUrl, yorkieType, 1000);
      const items = await waitForItemCount(baseUrl, itemId, 1, 500).catch(() => []);
      const item = items[0] || null;
      last = { yorkie, item };
      if (item && predicate(yorkie, item)) {
        return last;
      }
      await sleep(200);
    }
    throw new Error(`${failureMessage}: ${JSON.stringify(last)}`);
  }

  function tiledRanges(min, max, size) {
    const ranges = [];
    for (let start = min; start <= max; start += size) {
      ranges.push([start, Math.min(start + size - 1, max)]);
    }
    return ranges;
  }

  async function fillBox(min, max, block, checked = false) {
    const run = checked ? checkedCommand : command;
    return run(`fill ${min.x} ${min.y} ${min.z} ${max.x} ${max.y} ${max.z} ${block}`);
  }

  async function setBlocks(block, positions) {
    const placements = [];
    for (const position of positions) {
      placements.push(await setAbsoluteBlock(position, block));
    }
    return placements;
  }

  async function buildCherryTree(position, height = 4) {
    const dx = position.x - visualX;
    const dz = position.z - visualZ;
    const rel = (x, y, z) => point(dx + x, y, dz + z);
    const leaves = 'minecraft:cherry_leaves[persistent=true]';

    await fillBox(rel(0, 0, 0), rel(0, height - 1, 0), 'minecraft:cherry_log');
    await setBlocks('minecraft:cherry_log[axis=x]', [rel(-1, height - 1, 0), rel(1, height - 1, 0)]);
    await setBlocks('minecraft:cherry_log[axis=z]', [rel(0, height - 1, -1), rel(0, height - 1, 1)]);
    await fillBox(rel(-2, height - 1, -1), rel(2, height - 1, 1), leaves);
    await fillBox(rel(-1, height - 1, -2), rel(1, height - 1, 2), leaves);
    await fillBox(rel(-3, height, -2), rel(3, height, 2), leaves);
    await fillBox(rel(-2, height, -3), rel(2, height, 3), leaves);
    await fillBox(rel(-2, height + 1, -2), rel(2, height + 1, 2), leaves);
    await fillBox(rel(-1, height + 2, -1), rel(1, height + 2, 1), leaves);
    await setBlocks('minecraft:air', [
      rel(-3, height, -2),
      rel(-3, height, 2),
      rel(3, height, -2),
      rel(3, height, 2),
      rel(-2, height, -3),
      rel(-2, height, 3),
      rel(2, height, -3),
      rel(2, height, 3),
      rel(-2, height + 1, -2),
      rel(-2, height + 1, 2),
      rel(2, height + 1, -2),
      rel(2, height + 1, 2)
    ]);
    await setBlocks(leaves, [
      rel(-3, height - 1, 0),
      rel(3, height - 1, 0),
      rel(0, height - 1, -3),
      rel(0, height - 1, 3),
      rel(-2, height - 2, 1),
      rel(2, height - 2, -1)
    ]);
    await setBlocks('minecraft:pink_petals', [
      rel(-2, 0, -1),
      rel(2, 0, 1),
      rel(-1, 0, 2),
      rel(1, 0, -2)
    ]);
  }

  async function buildBaseStage() {
    const xRanges = tiledRanges(visualX - 48, visualX + 48, 16);
    const zRanges = tiledRanges(visualZ - 42, visualZ + 42, 16);
    const yRanges = tiledRanges(visualY, visualY + 30, 10);
    for (const [minX, maxX] of xRanges) {
      for (const [minZ, maxZ] of zRanges) {
        for (const [minY, maxY] of yRanges) {
          await fillBox({ x: minX, y: minY, z: minZ }, { x: maxX, y: maxY, z: maxZ }, 'minecraft:air');
        }
      }
    }
    await fillBox(point(-48, -1, -42), point(48, -1, 42), 'minecraft:grass_block');
    await fillBox(point(-48, -2, -42), point(48, -2, 42), 'minecraft:dirt');
    await fillBox(point(-1, -1, -16), point(1, -1, 18), 'minecraft:dirt_path');
    await fillBox(point(-22, -1, -4), point(-7, -1, 18), 'minecraft:moss_block');
    await fillBox(point(8, -1, -2), point(22, -1, 14), 'minecraft:sand');
    await fillBox(point(12, 0, 2), point(19, 0, 10), 'minecraft:water');
    await command(`fillbiome ${visualX - 48} ${visualY - 2} ${visualZ - 42} ${visualX + 48} ${visualY + 18} ${visualZ + 42} minecraft:cherry_grove`);
    await command(`fillbiome ${visualX + 8} ${visualY - 2} ${visualZ - 2} ${visualX + 24} ${visualY + 18} ${visualZ + 16} minecraft:river`);
    await command(`fillbiome ${visualX - 24} ${visualY - 2} ${visualZ - 6} ${visualX - 7} ${visualY + 18} ${visualZ + 20} minecraft:lush_caves`);
    await command(`kill @e[type=!minecraft:player,x=${visualX - 50},y=${visualY - 4},z=${visualZ - 44},dx=100,dy=38,dz=88]`);
    await sleep(500);
    await command(`kill @e[type=minecraft:item,x=${visualX - 50},y=${visualY - 4},z=${visualZ - 44},dx=100,dy=38,dz=88]`);
    await command(`kill @e[type=minecraft:leash_knot,x=${visualX - 50},y=${visualY - 4},z=${visualZ - 44},dx=100,dy=38,dz=88]`);
  }

  async function decorateMeadow() {
    await buildCherryTree(point(-7, 0, 5), 4);
    await buildCherryTree(point(7, 0, 6), 4);
    await buildCherryTree(point(-13, 0, 14), 5);
    await buildCherryTree(point(14, 0, 17), 4);
    await fillBox(point(-20, 0, 0), point(-18, 0, 2), 'minecraft:azalea_leaves');
    await fillBox(point(-16, 0, 7), point(-14, 0, 9), 'minecraft:flowering_azalea_leaves');
    await setBlocks('minecraft:mossy_cobblestone', [point(-4, 0, 6), point(5, 0, 8), point(10, 0, -5), point(-9, 0, -3)]);
    await setBlocks('minecraft:poppy', [point(-12, 0, -5), point(-9, 0, 7), point(10, 0, -6), point(14, 0, 5)]);
    await setBlocks('minecraft:dandelion', [point(-14, 0, 3), point(-7, 0, -8), point(8, 0, 8), point(12, 0, -2)]);
    await setBlocks('minecraft:cornflower', [point(-4, 0, 8), point(5, 0, -7), point(16, 0, 2)]);
    await setBlocks('minecraft:pink_petals', [
      point(-5, 0, 2),
      point(3, 0, 4),
      point(6, 0, 11),
      point(-8, 0, 12),
      point(-3, 0, -2),
      point(3, 0, -1),
      point(-4, 0, 0),
      point(4, 0, 1)
    ]);
  }

  async function buildCozyRoom(options = {}) {
    await fillBox(point(-5, -1, -2), point(5, -1, 6), 'minecraft:cherry_planks', true);
    await fillBox(point(-5, 0, 6), point(5, 3, 6), 'minecraft:cherry_planks');
    await fillBox(point(-5, 0, -2), point(-5, 3, 6), 'minecraft:cherry_planks');
    await fillBox(point(5, 0, -2), point(5, 3, 6), 'minecraft:cherry_planks');
    await fillBox(point(-5, 3, -2), point(5, 3, 6), 'minecraft:stripped_cherry_log');
    await fillBox(point(-4, 1, -2), point(4, 2, -2), 'minecraft:glass_pane');
    await fillBox(point(-2, 1, 6), point(2, 2, 6), 'minecraft:glass_pane');
    await setBlocks('minecraft:bookshelf', [
      point(-4, 0, 4),
      point(-4, 1, 4),
      point(4, 0, 4),
      point(4, 1, 4)
    ]);
    await setBlocks('minecraft:red_carpet', [
      point(-1, 0, 0),
      point(0, 0, 0),
      point(1, 0, 0),
      point(-1, 0, 1),
      point(0, 0, 1),
      point(1, 0, 1)
    ]);
    await setBlocks('minecraft:lantern[hanging=true]', [point(-3, 2, 1), point(3, 2, 3)]);
    await setBlocks('minecraft:potted_cherry_sapling', [point(-4, 1, -1), point(4, 1, -1)]);
    if (options.backDoor) {
      await fillBox(point(-4, 0, 6), point(-3, 2, 6), 'minecraft:air');
      await setBlocks('minecraft:cherry_door[facing=south,half=lower,hinge=left,open=true]', [point(-4, 0, 6)]);
      await setBlocks('minecraft:cherry_door[facing=south,half=upper,hinge=left,open=true]', [point(-4, 1, 6)]);
      await fillBox(point(-5, -1, 7), point(1, -1, 11), 'minecraft:grass_block');
      await setBlocks('minecraft:pink_petals', [point(-4, 0, 7), point(-2, 0, 8), point(0, 0, 10)]);
    }
  }

  async function prepScene(name, options = {}) {
    await step(`prepare ${name}`, async () => {
      await command('time set noon');
      await command('weather clear');
      await command('gamerule doMobSpawning false');
      await command('gamerule doDaylightCycle false');
      await command('gamerule doMobLoot false');
      await command('gamerule sendCommandFeedback false');
      await checkedCommand(`gamemode creative ${playerName}`);
      await playerAbilities({ flying: false, mayfly: true });
      await command(`clear ${playerName}`);
      for (const type of [
        yorkieType,
        'minecraft:item',
        'minecraft:cow',
        'minecraft:sheep',
        'minecraft:pig',
        'minecraft:chicken',
        'minecraft:zombie',
        'minecraft:skeleton',
        'minecraft:spider',
        'minecraft:creeper'
      ]) {
        await clearEntities(type);
      }
      await buildBaseStage();
      if (options.meadow !== false) {
        await decorateMeadow();
      }
      await checkedCommand(`tp ${playerName} ${visualX + 0.5} ${visualY + 1.0} ${visualZ - 8.5} 0 0`);
      return { base: point(0, 0, 0) };
    });
  }

  async function summonYorkie(position, options = {}) {
    const yaw = options.yaw === undefined ? 180 : options.yaw;
    const nbtParts = [`Rotation:[${yaw.toFixed(1)}f,0.0f]`, 'PersistenceRequired:1b'];
    if (options.noAi) {
      nbtParts.push('NoAI:1b');
    }
    if (options.noGravity) {
      nbtParts.push('NoGravity:1b');
    }
    await checkedCommand(`summon ${yorkieType} ${position.x} ${position.y} ${position.z} {${nbtParts.join(',')}}`);
    await waitForEntity(baseUrl, yorkieType, 5000);
    if (options.tame !== false) {
      await checkedCommand(`gamemode creative ${playerName}`);
      await checkedCommand(`tp ${playerName} ${position.x} ${position.y} ${position.z + 2.2} facing ${position.x} ${position.y + 0.4} ${position.z}`);
      const tamed = await useYorkie({ item: 'mushroom_yorkie:yorkie_treat', count: 2 });
      requireCondition(tamed.target.tameable && tamed.target.tameable.tame, 'Yorkie did not become tame for visual scene');
    }
    if (options.needs) {
      await mergeYorkieData(options.needs);
    }
    if (options.harness) {
      const harnessed = await useYorkie({ item: 'mushroom_yorkie:yorkie_harness', count: 1 });
      requireCondition(harnessed.target.custom && harnessed.target.custom.harness, 'Yorkie harness did not equip for visual scene');
    }
    if (options.sit) {
      const sat = await useYorkie({ emptyHand: true });
      requireCondition(sat.target.tameable && sat.target.tameable.orderedToSit, 'Yorkie did not sit for visual scene');
    }
    return waitForEntity(baseUrl, yorkieType, 5000);
  }

  const playerName = singlePlayerName(await requestJson(baseUrl, '/state'));
  const screenshots = {};

  await prepScene('portrait sitting');
  screenshots.sitting = await step('capture sitting no leash', async () => {
    const yorkie = await summonYorkie(point(0.5, 0, 0.5), { sit: true, yaw: 180 });
    await setAbsoluteBlock(point(-2, 0, 1), 'mushroom_yorkie:dog_bed');
    return {
      yorkie,
      file: await cameraShot('sitting-no-leash', point(0.5, 0.95, -3.1), point(0.5, 0.35, 0.5))
    };
  });

  await prepScene('leashed walk');
  screenshots.leashed = await step('capture leashed walk', async () => {
    const yorkie = await summonYorkie(point(-0.5, 0, 0.5), { harness: true, yaw: 165 });
    await setBlocks('minecraft:oak_fence', [point(2, 0, 1), point(3, 0, 1)]);
    await checkedCommand(`gamemode creative ${playerName}`);
    await checkedCommand(`tp ${playerName} ${visualX + 1.9} ${visualY} ${visualZ - 0.8} facing ${visualX - 0.5} ${visualY + 0.3} ${visualZ + 0.5}`);
    const lead = await useYorkie({ item: 'minecraft:lead', count: 1 });
    requireCondition(lead.target.leash && lead.target.leash.leashed, 'Leash did not attach for visual scene');
    const tied = await useBlock({
      item: 'minecraft:lead',
      count: 1,
      x: visualX + 2,
      y: visualY,
      z: visualZ + 1,
      face: 'up'
    });
    await sleep(350);
    return {
      yorkie,
      lead,
      tied,
      tiedYorkie: await waitForEntity(baseUrl, yorkieType, 5000),
      file: await cameraShot('leashed-walk', point(1.2, 1.05, -3.0), point(0.1, 0.35, 0.8))
    };
  });

  await prepScene('sleeping indoors', { meadow: false });
  screenshots.sleeping = await step('capture sleeping indoors', async () => {
    await buildCozyRoom();
    await setAbsoluteBlock(point(0, 0, 1), 'mushroom_yorkie:dog_bed');
    await command('time set night');
    await playerAbilities({ flying: false, mayfly: true });
    await summonYorkie(point(0.5, 0, 1.5), { yaw: 180 });
    const sleeping = await waitForEntityState(
      baseUrl,
      yorkieType,
      (entity) => entity.custom && entity.custom.curledUpSleeping,
      15000
    );
    return {
      sleeping,
      file: await cameraShot('sleeping-indoors', point(0.5, 1.05, -3.4), point(0.5, 0.35, 1.5))
    };
  });

  await prepScene('water paddle');
  screenshots.water = await step('capture in water', async () => {
    await fillBox(point(-5, -1, -1), point(5, -1, 5), 'minecraft:sand');
    await fillBox(point(-4, 0, 0), point(4, 0, 4), 'minecraft:water');
    const yorkie = await summonYorkie(point(0.5, 0.05, 2.5), { yaw: 180, needs: '{Hunger:10,Potty:10,Mood:90,Energy:80}' });
    await sleep(900);
    return {
      yorkie,
      file: await cameraShot('in-water', point(0.5, 1.1, -3.0), point(0.5, 0.35, 2.5))
    };
  });

  await prepScene('fetching ball');
  screenshots.fetching = await step('capture fetching ball', async () => {
    await summonYorkie(point(-3.0, 0, 0.5), { yaw: 95, needs: '{Hunger:0,Potty:0,Mood:65,Energy:85}' });
    await checkedCommand(`clear ${playerName}`);
    await command(`summon item ${visualX + 2.4} ${visualY + 0.4} ${visualZ + 0.5} {Item:{id:"mushroom_yorkie:yorkie_ball",count:1}}`);
    const approach = await waitForYorkieAndItem(
      'mushroom_yorkie:yorkie_ball',
      (entity, item) => entity.position.x > visualX - 2.15 && horizontalDistanceSqr(entity, item) > 4.0,
      5000,
      'Yorkie did not start fetching the gallery ball'
    );
    await freezeEntity(yorkieType);
    return {
      approach,
      item: await waitForItemCount(baseUrl, 'mushroom_yorkie:yorkie_ball', 1, 5000).catch(() => []),
      yorkie: await waitForEntity(baseUrl, yorkieType, 5000),
      file: await cameraShot('fetching-ball', point(0.0, 1.1, -3.4), point(0.0, 0.35, 0.5))
    };
  });

  await prepScene('flying');
  screenshots.flying = await step('capture flying', async () => {
    await fillBox(point(-5, -1, 4), point(5, -1, 10), 'minecraft:smooth_quartz');
    const yorkie = await summonYorkie(point(0.5, 5.0, 1.5), {
      noAi: true,
      noGravity: true,
      yaw: 180,
      needs: '{Hunger:0,Potty:0,Mood:100,Energy:90}'
    });
    return {
      yorkie,
      file: await cameraShot('flying', point(0.5, 5.9, -3.0), point(0.5, 5.05, 1.5))
    };
  });

  await prepScene('eating');
  screenshots.eating = await step('capture eating', async () => {
    await setAbsoluteBlock(point(0, 0, 0), 'mushroom_yorkie:dog_food_bowl');
    await summonYorkie(point(0, 0, 1.35), {
      noAi: true,
      yaw: 180,
      needs: '{Hunger:90,Potty:20,Mood:70,Energy:70,LastFoodBowlDay:-1L}'
    });
    await checkedCommand(`tp @e[type=${yorkieType},limit=1,sort=nearest] ${visualX} ${visualY} ${visualZ + 1.35} facing ${visualX} ${visualY + 0.2} ${visualZ}`);
    return {
      yorkie: await waitForEntity(baseUrl, yorkieType, 5000),
      file: await cameraShot('eating-food-bowl', point(0, 0.95, -3.2), point(0.0, 0.35, 0.8))
    };
  });

  await prepScene('drinking');
  screenshots.drinking = await step('capture drinking', async () => {
    await setAbsoluteBlock(point(0, 0, 0), 'mushroom_yorkie:dog_water_bowl');
    await summonYorkie(point(0, 0, 1.35), {
      noAi: true,
      yaw: 180,
      needs: '{Hunger:20,Potty:20,Mood:70,Energy:70,LastWaterBowlDay:-1L}'
    });
    await checkedCommand(`tp @e[type=${yorkieType},limit=1,sort=nearest] ${visualX} ${visualY} ${visualZ + 1.35} facing ${visualX} ${visualY + 0.2} ${visualZ}`);
    return {
      yorkie: await waitForEntity(baseUrl, yorkieType, 5000),
      file: await cameraShot('drinking-water-bowl', point(0, 0.95, -3.2), point(0.0, 0.35, 0.8))
    };
  });

  await prepScene('potty message', { meadow: false });
  screenshots.potty = await step('capture wants outside message', async () => {
    await buildCozyRoom({ backDoor: true });
    await summonYorkie(point(-2.8, 0, 4.8), {
      yaw: 25,
      needs: '{Hunger:20,Potty:95,Mood:70,Energy:80,LastReliefDay:-1L}'
    });
    await sleep(1600);
    await mergeYorkieData('{NoAI:1b}');
    await command(`title ${playerName} actionbar {"text":"Mushroom wants outside.","color":"gold"}`);
    return {
      yorkie: await waitForEntity(baseUrl, yorkieType, 5000),
      file: await cameraShot('wants-outside-message', point(0.0, 1.2, -4.2), point(-2.1, 0.45, 4.8), {
        hideGui: false,
        clearChat: true,
        delayMillis: 450
      })
    };
  });

  await prepScene('chasing passive mob');
  screenshots.passiveChase = await step('capture chasing passive mob', async () => {
    await summonYorkie(point(-3.0, 0, 0.5), { yaw: 90, needs: '{Hunger:10,Potty:10,Mood:80,Energy:80}' });
    await checkedCommand(`clear ${playerName}`);
    await checkedCommand(`gamemode survival ${playerName}`);
    await checkedCommand(`tp ${playerName} ${visualX} ${visualY} ${visualZ - 3.0} facing ${visualX + 0.5} ${visualY + 0.3} ${visualZ + 0.5}`);
    await checkedCommand(`summon minecraft:sheep ${visualX + 2.5} ${visualY} ${visualZ + 0.5} {PersistenceRequired:1b,Rotation:[270.0f,0.0f]}`);
    const chase = await waitForEntityPair(
      'minecraft:sheep',
      (entity, sheep) => entity.position.x > visualX - 2.0 && horizontalDistanceSqr(entity, sheep) < 18.0,
      8000,
      'Yorkie did not chase the passive mob for the gallery scene'
    );
    await freezeEntity(yorkieType);
    await freezeEntity('minecraft:sheep');
    return {
      chase,
      yorkie: await waitForEntity(baseUrl, yorkieType, 5000),
      sheep: await waitForEntity(baseUrl, 'minecraft:sheep', 5000),
      file: await cameraShot('chasing-sheep', point(0.3, 1.25, -5.2), point(0.8, 0.45, 0.2))
    };
  });

  await prepScene('attacking hostile mob');
  screenshots.hostileAttack = await step('capture attacking hostile mob', async () => {
    await command('difficulty easy');
    await summonYorkie(point(-2.5, 0, 0.5), { yaw: 90, needs: '{Hunger:10,Potty:10,Mood:85,Energy:85}' });
    await checkedCommand(`clear ${playerName}`);
    await checkedCommand(`gamemode survival ${playerName}`);
    await checkedCommand(`tp ${playerName} ${visualX} ${visualY} ${visualZ - 3.0} facing ${visualX + 0.5} ${visualY + 0.3} ${visualZ + 0.5}`);
    await checkedCommand(`summon minecraft:spider ${visualX + 2.0} ${visualY} ${visualZ + 0.5} {NoAI:1b,PersistenceRequired:1b,Rotation:[270.0f,0.0f]}`);
    const attack = await waitForEntityPair(
      'minecraft:spider',
      (_entity, spider) => spider.health < spider.maxHealth,
      10000,
      'Yorkie did not damage the hostile mob for the gallery scene'
    );
    await clearEntities('minecraft:spider');
    await checkedCommand(`summon minecraft:spider ${visualX + 1.45} ${visualY} ${visualZ + 0.45} {NoAI:1b,PersistenceRequired:1b,Health:15.0f,Rotation:[270.0f,0.0f]}`);
    await checkedCommand(`tp @e[type=${yorkieType},limit=1,sort=nearest] ${visualX - 0.85} ${visualY} ${visualZ + 0.25} facing ${visualX + 1.45} ${visualY + 0.35} ${visualZ + 0.45}`);
    await freezeEntity(yorkieType);
    const stagedSpider = await freezeEntity('minecraft:spider');
    return {
      attack,
      yorkie: await waitForEntity(baseUrl, yorkieType, 5000),
      spider: stagedSpider,
      file: await cameraShot('attacking-spider', point(0.0, 1.0, -4.1), point(0.35, 0.35, 0.35))
    };
  });

  return {
    ok: true,
    scenario: 'yorkie-visual-sweep',
    screenshots,
    steps
  };
}

function seededRandom(seedInput) {
  let state = 2166136261;
  for (const char of String(seedInput)) {
    state ^= char.charCodeAt(0);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function sortedCounts(counts) {
  return Object.entries(counts || {})
    .sort((left, right) => right[1] - left[1])
    .map(([name, count]) => ({ name, count }));
}

function terrainScoutScore(scan) {
  const water = scan.waterRatio || 0;
  const heightRange = scan.heightRange || 0;
  const trees = Math.max(scan.leafRatio || 0, scan.logRatio || 0);
  const openSky = scan.openSkyRatio || 0;
  const biomeNames = sortedCounts(scan.biomes).map((biome) => biome.name);
  const voidRatio = ((scan.topBlocks || {})['minecraft:void_air'] || 0) / Math.max(1, scan.samples || 1);
  const cherryBiome = biomeNames.some((name) => name.includes('cherry_grove'));
  const meadowBiome = biomeNames.some((name) => name.includes('meadow'));
  const scenicBiome = biomeNames.some((name) => (
    name.includes('cherry_grove')
    || name.includes('meadow')
    || name.includes('grove')
    || name.includes('forest')
    || name.includes('river')
    || name.includes('jagged_peaks')
    || name.includes('stony_peaks')
    || name.includes('frozen_peaks')
    || name.includes('snowy_slopes')
  ));
  const flatPenalty = heightRange < 7 ? 26 : 0;
  const extremePenalty = Math.max(0, heightRange - 85) * 0.5;
  const oceanPenalty = water > 0.65 ? (water - 0.65) * 80 : 0;
  const voidPenalty = voidRatio * 80;
  const openValley = Math.max(0, 36 - Math.abs(heightRange - 26)) + openSky * 18 + trees * 14 - water * 10;
  const lake = (water > 0.06 && water < 0.48 ? 44 : -18) + Math.max(0, 24 - Math.abs(heightRange - 18)) + trees * 10;
  const mountain = Math.min(heightRange, 70) * 0.35 + openSky * 8 + trees * 6 - Math.max(0, water - 0.25) * 22;
  let total = Math.max(openValley, lake, mountain)
    + (scenicBiome ? 12 : 0)
    + (cherryBiome ? 30 : 0)
    + (meadowBiome ? 18 : 0)
    - flatPenalty
    - extremePenalty
    - oceanPenalty
    - voidPenalty;
  const tags = [];
  if (water > 0.06 && water < 0.55) {
    tags.push('lake');
  }
  if (heightRange >= 12 && heightRange <= 55 && openSky > 0.35) {
    tags.push('valley');
  }
  if (heightRange > 40) {
    tags.push('hills');
  }
  if (trees > 0.05) {
    tags.push('trees');
  }
  if (scenicBiome) {
    tags.push('scenic-biome');
  }
  if (cherryBiome) {
    tags.push('cherry');
  }
  if (meadowBiome) {
    tags.push('meadow');
  }
  if (heightRange < 7) {
    tags.push('too-flat');
  }
  if (water > 0.65) {
    tags.push('too-much-water');
  }
  if (voidRatio > 0) {
    tags.push('void-sample');
  }
  total = Math.round(total * 10) / 10;
  return {
    total,
    tags,
    components: {
      openValley: Math.round(openValley * 10) / 10,
      lake: Math.round(lake * 10) / 10,
      mountain: Math.round(mountain * 10) / 10,
      flatPenalty,
      extremePenalty: Math.round(extremePenalty * 10) / 10,
      oceanPenalty: Math.round(oceanPenalty * 10) / 10,
      voidPenalty: Math.round(voidPenalty * 10) / 10
    }
  };
}

async function runYorkieBiomeScout(baseUrl, args) {
  const requestedName = option(args, 'screenshotName', 'BRIDGE_SCREENSHOT_NAME', '');
  const screenshotPrefix = (requestedName || `mushroom-yorkie-biome-scout-${Date.now()}`)
    .replace(/\.png$/i, '')
    .replace(/[^A-Za-z0-9._-]/g, '-');
  const samples = Math.round(optionNumber(args, 'samples', 'YORKIE_SCOUT_SAMPLES', 24));
  const captures = Math.round(optionNumber(args, 'captures', 'YORKIE_SCOUT_CAPTURES', 6));
  const range = Math.round(optionNumber(args, 'range', 'YORKIE_SCOUT_RANGE', 12000));
  const radius = Math.round(optionNumber(args, 'radius', 'YORKIE_SCOUT_RADIUS', 40));
  const step = Math.round(optionNumber(args, 'step', 'YORKIE_SCOUT_STEP', 16));
  const scoutSeed = option(args, 'scoutSeed', 'YORKIE_SCOUT_SEED', `${Date.now()}`);
  const random = seededRandom(scoutSeed);
  const steps = [];

  async function stepResult(name, run) {
    const value = await run();
    steps.push({ name, ok: true, value });
    return value;
  }

  async function command(commandText) {
    return requestJson(baseUrl, '/command', 'POST', { command: commandText });
  }

  async function checkedCommand(commandText) {
    const result = await command(commandText);
    requireCondition(result.success !== false, `Command failed: ${commandText}`);
    return result;
  }

  async function terrainScan(x, z) {
    return requestJson(baseUrl, '/terrain-scan', 'POST', {
      player: playerName,
      x,
      z,
      radius,
      step
    });
  }

  async function cleanScreenshot(name) {
    const shot = await requestJson(baseUrl, '/screenshot', 'POST', {
      name,
      resume: true,
      hideGui: true,
      clearChat: true
    });
    return shot.file;
  }

  function randomCoordinate() {
    return Math.round(((random() * 2 - 1) * range) / 16) * 16;
  }

  function candidateSummary(scan, index) {
    const score = terrainScoutScore(scan);
    return {
      index,
      score,
      seed: scan.seed,
      center: scan.center,
      centerBiome: scan.centerBiome,
      centerTopBlock: scan.centerTopBlock,
      heightRange: scan.heightRange,
      averageY: Math.round((scan.averageY || 0) * 10) / 10,
      waterRatio: Math.round((scan.waterRatio || 0) * 1000) / 1000,
      leafRatio: Math.round((scan.leafRatio || 0) * 1000) / 1000,
      logRatio: Math.round((scan.logRatio || 0) * 1000) / 1000,
      openSkyRatio: Math.round((scan.openSkyRatio || 0) * 1000) / 1000,
      topBiomes: sortedCounts(scan.biomes).slice(0, 4),
      topBlocks: sortedCounts(scan.topBlocks).slice(0, 6)
    };
  }

  const initialState = await requestJson(baseUrl, '/state');
  const playerName = singlePlayerName(initialState);
  await stepResult('prepare biome scout', async () => {
    await command('time set noon');
    await command('weather clear');
    await command('gamerule doDaylightCycle false');
    await checkedCommand(`gamemode spectator ${playerName}`);
    return {
      saveName: initialState.saveName,
      savePath: initialState.savePath,
      seed: initialState.seed,
      scoutSeed,
      samples,
      captures,
      range,
      radius,
      step
    };
  });

  const candidates = await stepResult('scan random terrain candidates', async () => {
    const scanned = [];
    for (let index = 0; index < samples; index += 1) {
      const x = randomCoordinate();
      const z = randomCoordinate();
      try {
        await checkedCommand(`tp ${playerName} ${x + 0.5} 220 ${z + 0.5}`);
        await sleep(1200);
        const scan = await terrainScan(x, z);
        scanned.push(candidateSummary(scan, index + 1));
      } catch (error) {
        scanned.push({
          index: index + 1,
          error: error.message,
          center: { x, z },
          score: { total: -999, tags: ['scan-failed'], components: {} }
        });
      }
    }
    return scanned.sort((left, right) => right.score.total - left.score.total);
  });

  const selected = candidates.slice(0, Math.max(0, captures));
  const screenshots = await stepResult('capture top scout candidates', async () => {
    const captured = [];
    for (let index = 0; index < selected.length; index += 1) {
      const candidate = selected[index];
      const center = candidate.center;
      const cameraDistance = Math.max(34, radius * 0.72);
      const cameraY = Math.min(220, Math.max(center.y + 16, center.y + Math.min(candidate.heightRange, 36)));
      await checkedCommand(`tp ${playerName} ${center.x + 0.5} ${cameraY} ${center.z - cameraDistance} facing ${center.x + 0.5} ${center.y + 3} ${center.z + 0.5}`);
      await sleep(2600);
      const wide = await cleanScreenshot(`${screenshotPrefix}-candidate-${String(index + 1).padStart(2, '0')}-wide.png`);
      await checkedCommand(`tp ${playerName} ${center.x - 22.5} ${Math.min(300, center.y + 10)} ${center.z - 24.5} facing ${center.x + 0.5} ${center.y + 2.5} ${center.z + 0.5}`);
      await sleep(1600);
      const low = await cleanScreenshot(`${screenshotPrefix}-candidate-${String(index + 1).padStart(2, '0')}-low.png`);
      captured.push({ ...candidate, screenshots: { wide, low } });
    }
    return captured;
  });

  return {
    ok: true,
    scenario: 'yorkie-biome-scout',
    saveName: initialState.saveName,
    savePath: initialState.savePath,
    seed: initialState.seed,
    scoutSeed,
    candidates,
    screenshots,
    steps
  };
}

async function runYorkieNaturalGallery(baseUrl, args) {
  const yorkieType = option(args, 'type', 'YORKIE_ENTITY', 'mushroom_yorkie:mushroom_yorkie');
  const requestedName = option(args, 'screenshotName', 'BRIDGE_SCREENSHOT_NAME', '');
  const screenshotPrefix = (requestedName || `mushroom-yorkie-natural-gallery-${Date.now()}`)
    .replace(/\.png$/i, '')
    .replace(/[^A-Za-z0-9._-]/g, '-');
  const radius = optionNumber(args, 'radius', 'YORKIE_RADIUS', 18);
  const steps = [];
  const locations = {
    valley: { x: -80, z: 7216 },
    lake: { x: 4448, z: 4000 },
    jungleWater: { x: 3760, z: -304 },
    taigaRiver: { x: -13520, z: 2112 },
    highlands: { x: -4848, z: 2128 },
    cherry: { x: -2624, z: 7664 }
  };
  const surfaceCache = new Map();

  async function step(name, run) {
    const value = await run();
    steps.push({ name, ok: true, value });
    return value;
  }

  async function command(commandText) {
    return requestJson(baseUrl, '/command', 'POST', { command: commandText });
  }

  async function checkedCommand(commandText) {
    const result = await command(commandText);
    requireCondition(result.success !== false, `Command failed: ${commandText}`);
    return result;
  }

  async function clearEntities(type) {
    return requestJson(baseUrl, '/clear-entities', 'POST', { type });
  }

  async function setAbsoluteBlock(position, block, replace = '') {
    const body = { ...position, block };
    if (replace) {
      body.replace = replace;
    }
    return requestJson(baseUrl, '/set-block', 'POST', body);
  }

  async function useBlock(body) {
    return requestJson(baseUrl, '/use-block', 'POST', body);
  }

  async function useYorkie(body) {
    return requestJson(baseUrl, '/use-entity', 'POST', {
      type: yorkieType,
      radius,
      ...body
    });
  }

  async function playerAbilities(body) {
    return requestJson(baseUrl, '/player-abilities', 'POST', body);
  }

  async function mergeYorkieData(nbt) {
    await command(`data merge entity @e[type=${yorkieType},limit=1,sort=nearest] ${nbt}`);
    return waitForEntity(baseUrl, yorkieType);
  }

  async function freezeEntity(type) {
    await command(`data merge entity @e[type=${type},limit=1,sort=nearest] {NoAI:1b}`);
    return waitForEntity(baseUrl, type);
  }

  async function terrainScan(x, z, scanRadius = 4, stepSize = 4) {
    return requestJson(baseUrl, '/terrain-scan', 'POST', {
      player: playerName,
      x: Math.round(x),
      z: Math.round(z),
      radius: scanRadius,
      step: stepSize
    });
  }

  async function surfaceAt(x, z) {
    const key = `${Math.round(x)},${Math.round(z)}`;
    if (!surfaceCache.has(key)) {
      const scan = await terrainScan(x, z);
      surfaceCache.set(key, {
        x: scan.center.x,
        y: scan.center.y,
        z: scan.center.z,
        biome: scan.centerBiome,
        topBlock: scan.centerTopBlock,
        scan
      });
    }
    return surfaceCache.get(key);
  }

  function offsetGrid(maxDistance = 10) {
    const offsets = [{ dx: 0, dz: 0 }];
    for (let distance = 1; distance <= maxDistance; distance += 1) {
      offsets.push(
        { dx: distance, dz: 0 },
        { dx: -distance, dz: 0 },
        { dx: 0, dz: distance },
        { dx: 0, dz: -distance },
        { dx: distance, dz: distance },
        { dx: -distance, dz: distance },
        { dx: distance, dz: -distance },
        { dx: -distance, dz: -distance }
      );
    }
    return offsets;
  }

  const landBlocks = new Set([
    'minecraft:grass_block',
    'minecraft:podzol',
    'minecraft:coarse_dirt',
    'minecraft:dirt',
    'minecraft:moss_block',
    'minecraft:sand',
    'minecraft:gravel',
    'minecraft:stone',
    'minecraft:mud',
    'minecraft:clay',
    'minecraft:red_sand'
  ]);
  const foliageBlocks = [
    'minecraft:short_grass',
    'minecraft:grass',
    'minecraft:tall_grass',
    'minecraft:fern',
    'minecraft:large_fern',
    'minecraft:bush',
    'minecraft:dead_bush',
    'minecraft:sweet_berry_bush',
    'minecraft:wildflowers',
    'minecraft:seagrass',
    'minecraft:tall_seagrass'
  ];

  function isWater(surface) {
    return surface.topBlock === 'minecraft:water';
  }

  function isLand(surface) {
    return landBlocks.has(surface.topBlock);
  }

  async function findSurfaceNear(base, predicate, maxDistance = 12) {
    for (const offset of offsetGrid(maxDistance)) {
      const surface = await surfaceAt(base.x + offset.dx, base.z + offset.dz);
      if (predicate(surface)) {
        return surface;
      }
    }
    throw new Error(`No matching surface near ${JSON.stringify(base)}`);
  }

  async function cleanArea(center, horizontal = 36) {
    const minX = Math.round(center.x - horizontal);
    const minZ = Math.round(center.z - horizontal);
    const size = horizontal * 2;
    await command(`kill @e[type=!minecraft:player,x=${minX},y=-64,z=${minZ},dx=${size},dy=384,dz=${size}]`);
    await sleep(300);
  }

  async function clearFoliage(position, horizontal = 3, vertical = 3) {
    const x1 = Math.floor(position.x - horizontal);
    const y1 = Math.floor(position.y);
    const z1 = Math.floor(position.z - horizontal);
    const x2 = Math.floor(position.x + horizontal);
    const y2 = Math.floor(position.y + vertical);
    const z2 = Math.floor(position.z + horizontal);
    for (const block of foliageBlocks) {
      await command(`fill ${x1} ${y1} ${z1} ${x2} ${y2} ${z2} minecraft:air replace ${block}`);
    }
  }

  async function prepScene(name, location) {
    return step(`prepare ${name}`, async () => {
      await command('time set noon');
      await command('weather clear');
      await command('gamerule doMobSpawning false');
      await command('gamerule doDaylightCycle false');
      await command('gamerule doMobLoot false');
      await command('gamerule sendCommandFeedback false');
      await checkedCommand(`gamemode spectator ${playerName}`);
      await checkedCommand(`tp ${playerName} ${location.x + 0.5} 180 ${location.z + 0.5}`);
      await sleep(2400);
      const center = await surfaceAt(location.x, location.z);
      await checkedCommand(`gamemode creative ${playerName}`);
      await playerAbilities({ flying: false, mayfly: true });
      await command(`clear ${playerName}`);
      for (const type of [
        yorkieType,
        'minecraft:item',
        'minecraft:cow',
        'minecraft:sheep',
        'minecraft:pig',
        'minecraft:chicken',
        'minecraft:zombie',
        'minecraft:skeleton',
        'minecraft:spider',
        'minecraft:creeper'
      ]) {
        await clearEntities(type);
      }
      await cleanArea(center);
      return center;
    });
  }

  async function screenshot(suffix, options = {}) {
    const shot = await requestJson(baseUrl, '/screenshot', 'POST', {
      name: `${screenshotPrefix}-${suffix}.png`,
      resume: true,
      hideGui: options.hideGui !== false,
      clearChat: options.clearChat !== false
    });
    return shot.file;
  }

  async function cameraShot(suffix, camera, target, options = {}) {
    await checkedCommand(`gamemode spectator ${playerName}`);
    await checkedCommand(`tp ${playerName} ${camera.x} ${camera.y} ${camera.z} facing ${target.x} ${target.y} ${target.z}`);
    await sleep(options.delayMillis || 1200);
    return screenshot(suffix, options);
  }

  async function summonYorkie(position, options = {}) {
    const yaw = options.yaw === undefined ? 180 : options.yaw;
    const nbtParts = [`Rotation:[${yaw.toFixed(1)}f,0.0f]`, 'PersistenceRequired:1b'];
    if (options.noAi) {
      nbtParts.push('NoAI:1b');
    }
    if (options.noGravity) {
      nbtParts.push('NoGravity:1b');
    }
    await checkedCommand(`gamemode creative ${playerName}`);
    await playerAbilities({ flying: false, mayfly: true });
    await checkedCommand(`tp ${playerName} ${position.x} ${position.y} ${position.z + 2.8} facing ${position.x} ${position.y + 0.4} ${position.z}`);
    await sleep(250);
    await checkedCommand(`summon ${yorkieType} ${position.x} ${position.y} ${position.z} {${nbtParts.join(',')}}`);
    await waitForEntity(baseUrl, yorkieType, 5000);
    if (options.tame !== false) {
      await checkedCommand(`gamemode creative ${playerName}`);
      await checkedCommand(`tp ${playerName} ${position.x} ${position.y} ${position.z + 2.2} facing ${position.x} ${position.y + 0.4} ${position.z}`);
      const tamed = await useYorkie({ item: 'mushroom_yorkie:yorkie_treat', count: 2 });
      requireCondition(tamed.target.tameable && tamed.target.tameable.tame, 'Yorkie did not become tame for natural gallery scene');
    }
    if (options.needs) {
      await mergeYorkieData(options.needs);
    }
    if (options.harness) {
      const harnessed = await useYorkie({ item: 'mushroom_yorkie:yorkie_harness', count: 1 });
      requireCondition(harnessed.target.custom && harnessed.target.custom.harness, 'Yorkie harness did not equip for natural gallery scene');
    }
    if (options.sit) {
      const sat = await useYorkie({ emptyHand: true });
      requireCondition(sat.target.tameable && sat.target.tameable.orderedToSit, 'Yorkie did not sit for natural gallery scene');
    }
    return waitForEntity(baseUrl, yorkieType, 5000);
  }

  async function poseYorkie(position, target, options = {}) {
    await checkedCommand(`tp @e[type=${yorkieType},limit=1,sort=nearest] ${position.x} ${position.y} ${position.z} facing ${target.x} ${target.y} ${target.z}`);
    if (options.freeze !== false) {
      await freezeEntity(yorkieType);
    }
    return waitForEntity(baseUrl, yorkieType, 5000);
  }

  async function placeBlockOn(surface, dx, dz, block) {
    const target = await surfaceAt(surface.x + dx, surface.z + dz);
    return setAbsoluteBlock({ x: target.x, y: target.y, z: target.z }, block);
  }

  const initialState = await requestJson(baseUrl, '/state');
  const playerName = singlePlayerName(initialState);
  const screenshots = {};

  let center = await prepScene('natural sitting portrait', locations.cherry);
  screenshots.sitting = await step('capture natural sitting no leash', async () => {
    const land = await findSurfaceNear(center, isLand, 12);
    await clearFoliage(land, 5, 4);
    const camera = { x: land.x - 2.6, y: land.y + 0.95, z: land.z - 3.6 };
    await clearFoliage({ x: camera.x, y: land.y, z: camera.z }, 2, 4);
    await placeBlockOn(land, -2, 1, 'mushroom_yorkie:dog_bed');
    await summonYorkie({ x: land.x + 0.5, y: land.y, z: land.z + 0.5 }, { noAi: true, sit: true, yaw: 200 });
    const yorkie = await poseYorkie(
      { x: land.x + 0.5, y: land.y, z: land.z + 0.5 },
      { x: camera.x, y: camera.y, z: camera.z }
    );
    return {
      land,
      yorkie,
      file: await cameraShot(
        'sitting-no-leash',
        camera,
        { x: land.x + 0.5, y: land.y + 0.35, z: land.z + 0.5 }
      )
    };
  });

  center = await prepScene('natural leashed walk', locations.lake);
  screenshots.leashed = await step('capture natural leashed walk', async () => {
    const land = await findSurfaceNear(center, isLand, 14);
    await clearFoliage(land, 5, 4);
    const camera = { x: land.x - 2.3, y: land.y + 0.95, z: land.z - 3.4 };
    await clearFoliage({ x: camera.x, y: land.y, z: camera.z }, 2, 4);
    const fence = { x: land.x + 1, y: land.y, z: land.z + 1 };
    const fenceNeighbor = { x: land.x + 1, y: land.y, z: land.z + 2 };
    await setAbsoluteBlock(fence, 'minecraft:oak_fence');
    await setAbsoluteBlock(fenceNeighbor, 'minecraft:oak_fence');
    const yorkie = await summonYorkie({ x: land.x + 0.3, y: land.y, z: land.z + 0.65 }, { noAi: true, harness: true, yaw: 160 });
    await checkedCommand(`gamemode creative ${playerName}`);
    await checkedCommand(`tp ${playerName} ${land.x + 1.9} ${land.y} ${land.z - 0.8} facing ${land.x - 0.5} ${land.y + 0.3} ${land.z + 0.5}`);
    const lead = await useYorkie({ item: 'minecraft:lead', count: 1 });
    requireCondition(lead.target.leash && lead.target.leash.leashed, 'Leash did not attach for natural gallery scene');
    const tied = await useBlock({
      item: 'minecraft:lead',
      count: 1,
      x: fence.x,
      y: fence.y,
      z: fence.z,
      face: 'up'
    });
    await sleep(350);
    return {
      land,
      yorkie,
      lead,
      tied,
      file: await cameraShot(
        'leashed-walk',
        camera,
        { x: land.x + 0.75, y: land.y + 0.35, z: land.z + 0.75 }
      )
    };
  });

  center = await prepScene('natural water paddle', locations.lake);
  screenshots.water = await step('capture natural water', async () => {
    const water = await findSurfaceNear(center, isWater, 16);
    const camera = { x: water.x - 2.4, y: water.y + 0.85, z: water.z - 3.7 };
    const yorkie = await summonYorkie({ x: water.x + 0.5, y: water.y + 0.05, z: water.z + 0.5 }, {
      yaw: 185,
      needs: '{Hunger:10,Potty:10,Mood:90,Energy:80}'
    });
    await sleep(900);
    return {
      water,
      yorkie,
      file: await cameraShot(
        'in-water',
        camera,
        { x: water.x + 0.5, y: water.y + 0.35, z: water.z + 0.5 },
        { delayMillis: 1500 }
      )
    };
  });

  center = await prepScene('natural fetching ball', locations.jungleWater);
  screenshots.fetching = await step('capture natural fetching', async () => {
    const land = await findSurfaceNear(center, isLand, 12);
    await clearFoliage(land, 5, 4);
    const camera = { x: land.x - 2.4, y: land.y + 0.95, z: land.z - 3.6 };
    await clearFoliage({ x: camera.x, y: land.y, z: camera.z }, 2, 4);
    await summonYorkie({ x: land.x - 3.0, y: land.y, z: land.z + 0.5 }, {
      noAi: true,
      yaw: 95,
      needs: '{Hunger:0,Potty:0,Mood:65,Energy:85}'
    });
    await command(`summon item ${land.x + 2.4} ${land.y + 0.4} ${land.z + 0.5} {Item:{id:"mushroom_yorkie:yorkie_ball",count:1}}`);
    await sleep(1200);
    await checkedCommand(`tp @e[type=${yorkieType},limit=1,sort=nearest] ${land.x - 0.85} ${land.y} ${land.z + 0.45} facing ${land.x + 2.4} ${land.y + 0.35} ${land.z + 0.5}`);
    await freezeEntity(yorkieType);
    return {
      land,
      item: await waitForItemCount(baseUrl, 'mushroom_yorkie:yorkie_ball', 1, 5000).catch(() => []),
      yorkie: await waitForEntity(baseUrl, yorkieType, 5000),
      file: await cameraShot(
        'fetching-ball',
        camera,
        { x: land.x + 0.4, y: land.y + 0.35, z: land.z + 0.4 }
      )
    };
  });

  center = await prepScene('natural flying', locations.highlands);
  screenshots.flying = await step('capture natural flying', async () => {
    const land = await findSurfaceNear(center, isLand, 10);
    const camera = { x: land.x - 3.0, y: land.y + 6.45, z: land.z - 4.4 };
    const yorkie = await summonYorkie({ x: land.x + 0.5, y: land.y + 5.5, z: land.z + 0.5 }, {
      noAi: true,
      noGravity: true,
      yaw: 190,
      needs: '{Hunger:0,Potty:0,Mood:100,Energy:90}'
    });
    return {
      land,
      yorkie,
      file: await cameraShot(
        'flying',
        camera,
        { x: land.x + 0.5, y: land.y + 5.65, z: land.z + 0.5 },
        { delayMillis: 1700 }
      )
    };
  });

  center = await prepScene('natural eating', locations.jungleWater);
  screenshots.eating = await step('capture natural eating', async () => {
    const land = await findSurfaceNear(center, isLand, 10);
    await clearFoliage(land, 5, 4);
    const camera = { x: land.x - 2.1, y: land.y + 0.85, z: land.z - 3.2 };
    await clearFoliage({ x: camera.x, y: land.y, z: camera.z }, 2, 4);
    await placeBlockOn(land, 0, 0, 'mushroom_yorkie:dog_food_bowl');
    await summonYorkie({ x: land.x, y: land.y, z: land.z + 1.35 }, {
      noAi: true,
      yaw: 180,
      needs: '{Hunger:90,Potty:20,Mood:70,Energy:70,LastFoodBowlDay:-1L}'
    });
    await checkedCommand(`tp @e[type=${yorkieType},limit=1,sort=nearest] ${land.x} ${land.y} ${land.z + 1.35} facing ${land.x} ${land.y + 0.2} ${land.z}`);
    return {
      land,
      yorkie: await waitForEntity(baseUrl, yorkieType, 5000),
      file: await cameraShot(
        'eating-food-bowl',
        camera,
        { x: land.x, y: land.y + 0.35, z: land.z + 0.7 }
      )
    };
  });

  center = await prepScene('natural drinking', locations.lake);
  screenshots.drinking = await step('capture natural drinking', async () => {
    const land = await findSurfaceNear(center, isLand, 14);
    await clearFoliage(land, 5, 4);
    const camera = { x: land.x - 2.1, y: land.y + 0.85, z: land.z - 3.2 };
    await clearFoliage({ x: camera.x, y: land.y, z: camera.z }, 2, 4);
    await placeBlockOn(land, 0, 0, 'mushroom_yorkie:dog_water_bowl');
    await summonYorkie({ x: land.x, y: land.y, z: land.z + 1.35 }, {
      noAi: true,
      yaw: 180,
      needs: '{Hunger:20,Potty:20,Mood:70,Energy:70,LastWaterBowlDay:-1L}'
    });
    await checkedCommand(`tp @e[type=${yorkieType},limit=1,sort=nearest] ${land.x} ${land.y} ${land.z + 1.35} facing ${land.x} ${land.y + 0.2} ${land.z}`);
    return {
      land,
      yorkie: await waitForEntity(baseUrl, yorkieType, 5000),
      file: await cameraShot(
        'drinking-water-bowl',
        camera,
        { x: land.x, y: land.y + 0.35, z: land.z + 0.7 }
      )
    };
  });

  center = await prepScene('natural sheep chase', locations.taigaRiver);
  screenshots.passiveChase = await step('capture natural sheep chase', async () => {
    const land = await findSurfaceNear(center, isLand, 10);
    await clearFoliage(land, 5, 4);
    const camera = { x: land.x - 2.9, y: land.y + 0.95, z: land.z - 4.2 };
    await clearFoliage({ x: camera.x, y: land.y, z: camera.z }, 2, 4);
    await summonYorkie({ x: land.x - 2.2, y: land.y, z: land.z + 0.5 }, {
      noAi: true,
      yaw: 90,
      needs: '{Hunger:10,Potty:10,Mood:80,Energy:80}'
    });
    await checkedCommand(`summon minecraft:sheep ${land.x + 1.8} ${land.y} ${land.z + 0.45} {NoAI:1b,PersistenceRequired:1b,Rotation:[270.0f,0.0f]}`);
    await checkedCommand(`tp @e[type=${yorkieType},limit=1,sort=nearest] ${land.x - 0.5} ${land.y} ${land.z + 0.35} facing ${land.x + 1.8} ${land.y + 0.35} ${land.z + 0.45}`);
    await freezeEntity(yorkieType);
    const sheep = await freezeEntity('minecraft:sheep');
    return {
      land,
      sheep,
      yorkie: await waitForEntity(baseUrl, yorkieType, 5000),
      file: await cameraShot(
        'chasing-sheep',
        camera,
        { x: land.x + 0.4, y: land.y + 0.45, z: land.z + 0.3 }
      )
    };
  });

  center = await prepScene('natural spider defense', locations.taigaRiver);
  screenshots.hostileAttack = await step('capture natural spider defense', async () => {
    const land = await findSurfaceNear(center, isLand, 10);
    await clearFoliage(land, 5, 4);
    const camera = { x: land.x - 2.7, y: land.y + 0.85, z: land.z - 3.7 };
    await clearFoliage({ x: camera.x, y: land.y, z: camera.z }, 2, 4);
    await command('difficulty easy');
    await summonYorkie({ x: land.x - 1.2, y: land.y, z: land.z + 0.35 }, {
      noAi: true,
      yaw: 90,
      needs: '{Hunger:10,Potty:10,Mood:85,Energy:85}'
    });
    await checkedCommand(`summon minecraft:spider ${land.x + 1.35} ${land.y} ${land.z + 0.45} {NoAI:1b,PersistenceRequired:1b,Health:15.0f,Rotation:[270.0f,0.0f]}`);
    await checkedCommand(`tp @e[type=${yorkieType},limit=1,sort=nearest] ${land.x - 0.7} ${land.y} ${land.z + 0.25} facing ${land.x + 1.35} ${land.y + 0.35} ${land.z + 0.45}`);
    await freezeEntity(yorkieType);
    const spider = await freezeEntity('minecraft:spider');
    return {
      land,
      spider,
      yorkie: await waitForEntity(baseUrl, yorkieType, 5000),
      file: await cameraShot(
        'attacking-spider',
        camera,
        { x: land.x + 0.25, y: land.y + 0.35, z: land.z + 0.35 }
      )
    };
  });

  return {
    ok: true,
    scenario: 'yorkie-natural-gallery',
    saveName: initialState.saveName,
    savePath: initialState.savePath,
    seed: initialState.seed,
    locations,
    screenshots,
    steps
  };
}

async function runCopsSmoke(baseUrl, args) {
  const cruiserType = option(args, 'type', 'COPS_CRUISER_ENTITY', 'cops_robbers:police_cruiser');
  const robberType = option(args, 'robberType', 'COPS_ROBBER_ENTITY', 'cops_robbers:bank_robber');
  const copType = option(args, 'copType', 'COPS_COP_ENTITY', 'cops_robbers:cop');
  const fireTruckType = option(args, 'fireTruckType', 'COPS_FIRE_TRUCK_ENTITY', 'cops_robbers:fire_truck');
  const firemanType = option(args, 'firemanType', 'COPS_FIREMAN_ENTITY', 'cops_robbers:fireman');
  const tellerType = option(args, 'tellerType', 'COPS_TELLER_ENTITY', 'cops_robbers:teller');
  const radius = optionNumber(args, 'radius', 'COPS_RADIUS', 16);
  const screenshotName = option(
    args,
    'screenshotName',
    'BRIDGE_SCREENSHOT_NAME',
    `cops-and-robbers-smoke-${Date.now()}.png`
  );
  const steps = [];

  async function step(name, run) {
    const value = await run();
    steps.push({ name, ok: true, value });
    return value;
  }

  async function command(commandText) {
    return requestJson(baseUrl, '/command', 'POST', { command: commandText });
  }

  async function checkedCommand(commandText) {
    const result = await command(commandText);
    requireCondition(result.success !== false, `Command failed: ${commandText}`);
    return result;
  }

  async function inventoryCount(item) {
    const result = await command(`clear ${playerName} ${item} 0`);
    return result.result || 0;
  }

  async function clearEntities(type) {
    return requestJson(baseUrl, '/clear-entities', 'POST', { type });
  }

  async function useEntity(type, body = {}) {
    return requestJson(baseUrl, '/use-entity', 'POST', {
      type,
      radius,
      ...body
    });
  }

  async function setAbsoluteBlock(position, block, replace = '') {
    const body = { ...position, block };
    if (replace) {
      body.replace = replace;
    }
    return requestJson(baseUrl, '/set-block', 'POST', body);
  }

  async function buildArena(arenaRadius = 14) {
    const state = await requestJson(baseUrl, '/state');
    const player = state.players.find((candidate) => candidate.name === playerName);
    requireCondition(player, `Could not find player state for ${playerName}`);
    const base = {
      x: Math.round(player.position.x),
      y: Math.ceil(player.position.y),
      z: Math.round(player.position.z)
    };
    await command(
      `fill ${base.x - arenaRadius} ${base.y} ${base.z - arenaRadius} ${base.x + arenaRadius} ${base.y + 8} ${base.z + arenaRadius} minecraft:air`
    );
    await command(
      `fill ${base.x - arenaRadius} ${base.y - 1} ${base.z - arenaRadius} ${base.x + arenaRadius} ${base.y - 1} ${base.z + arenaRadius} minecraft:smooth_stone`
    );
    await command(`tp ${playerName} ${base.x + 0.5} ${base.y} ${base.z + 0.5}`);
    const floorBlock = await waitForBlock(baseUrl, { x: base.x, y: base.y - 1, z: base.z }, 'minecraft:smooth_stone', 5000);
    return { base, radius: arenaRadius, floorBlock };
  }

  async function placeMinimalJail(base, cruiserBlock) {
    const cell = {
      x: cruiserBlock.x + 5,
      y: base.y,
      z: cruiserBlock.z + 5
    };
    const dropoff = {
      x: cruiserBlock.x,
      y: base.y - 1,
      z: cruiserBlock.z
    };
    const door = {
      x: cruiserBlock.x + 2,
      y: base.y,
      z: cruiserBlock.z + 2
    };
    const placements = [];

    async function set(position, block, replace = '') {
      const placed = await setAbsoluteBlock(position, block, replace);
      placements.push(placed);
      return placed;
    }

    await set(dropoff, 'minecraft:yellow_concrete');
    await set(door, 'minecraft:iron_door');
    await set({ x: cell.x, y: cell.y - 1, z: cell.z }, 'minecraft:smooth_stone');
    await set(cell, 'minecraft:air');
    await set({ x: cell.x, y: cell.y + 1, z: cell.z }, 'minecraft:air');

    const barOffsets = [
      { x: -2, z: 0 },
      { x: 2, z: 0 },
      { x: 0, z: -2 },
      { x: 0, z: 2 }
    ];
    for (const offset of barOffsets) {
      await set({ x: cell.x + offset.x, y: cell.y, z: cell.z + offset.z }, 'minecraft:iron_bars');
      await set({ x: cell.x + offset.x, y: cell.y + 1, z: cell.z + offset.z }, 'minecraft:iron_bars');
    }

    return { cell, dropoff, door, placements };
  }

  const playerName = singlePlayerName(await requestJson(baseUrl, '/state'));
  let arenaBase = null;
  const cruiserBlock = {};

  await step('prepare patrol arena', async () => {
    await command('time set day');
    await command('weather clear');
    await command('difficulty easy');
    await command('gamerule doMobSpawning false');
    await command('gamerule doDaylightCycle false');
    await command(`gamemode creative ${playerName}`);
    await command(`clear ${playerName}`);
    await clearEntities(robberType);
    await clearEntities(cruiserType);
    await clearEntities(fireTruckType);
    await clearEntities(copType);
    await clearEntities(firemanType);
    await clearEntities(tellerType);
    const arena = await buildArena(14);
    arenaBase = arena.base;
    cruiserBlock.x = arenaBase.x + 2;
    cruiserBlock.y = arenaBase.y;
    cruiserBlock.z = arenaBase.z;
    await requestJson(baseUrl, '/chat', 'POST', { message: 'Cops and Robbers runtime smoke starting.' });
    return arena;
  });

  await step('registered items are giveable', async () => {
    const items = [
      'cops_robbers:police_cruiser_spawn_egg',
      'cops_robbers:fire_truck_spawn_egg',
      'cops_robbers:bank_robber_spawn_egg',
      'cops_robbers:teller_spawn_egg',
      'cops_robbers:cop_spawn_egg',
      'cops_robbers:fireman_spawn_egg',
      'cops_robbers:bank_kit',
      'cops_robbers:police_station_kit',
      'cops_robbers:fire_station_kit'
    ];
    const commands = [];
    for (const item of items) {
      commands.push(await checkedCommand(`give ${playerName} ${item} 1`));
    }
    await command(`clear ${playerName}`);
    return { items, commands };
  });

  await step('summon support cast', async () => {
    await checkedCommand(`summon ${fireTruckType} ${arenaBase.x - 4.5} ${arenaBase.y} ${arenaBase.z + 2.5}`);
    await checkedCommand(`summon ${copType} ${arenaBase.x - 2.5} ${arenaBase.y} ${arenaBase.z + 5.5}`);
    await checkedCommand(`summon ${firemanType} ${arenaBase.x - 4.5} ${arenaBase.y} ${arenaBase.z + 5.5}`);
    await checkedCommand(`summon ${tellerType} ${arenaBase.x - 6.5} ${arenaBase.y} ${arenaBase.z + 5.5}`);
    const fireTruck = await waitForEntity(baseUrl, fireTruckType);
    const cop = await waitForEntity(baseUrl, copType);
    const fireman = await waitForEntity(baseUrl, firemanType);
    const teller = await waitForEntity(baseUrl, tellerType);
    return { fireTruck, cop, fireman, teller };
  });

  const mounted = await step('summon and mount cruiser', async () => {
    await checkedCommand(`summon ${cruiserType} ${cruiserBlock.x + 0.5} ${cruiserBlock.y} ${cruiserBlock.z + 0.5}`);
    const cruiser = await waitForEntityState(
      baseUrl,
      cruiserType,
      (entity) => entity.custom && entity.custom.lightsEnabled === true && entity.custom.capturedRobbers === 0,
      5000
    );
    const interaction = await useEntity(cruiserType, { emptyHand: true });
    requireCondition(interaction.consumed, 'Cruiser interaction was not consumed');
    const mountedState = await requestJson(baseUrl, '/state');
    const player = mountedState.players.find((candidate) => candidate.name === playerName);
    const mountedCruiser = nearestEntity(mountedState, cruiserType);
    requireCondition(player && player.vehicle && player.vehicle.type === cruiserType, 'Player did not mount the police cruiser');
    requireCondition(
      mountedCruiser && mountedCruiser.passengers && mountedCruiser.passengers.some((passenger) => passenger.name === playerName),
      'Police cruiser state did not report the player passenger'
    );
    return { cruiser, interaction, player, mountedCruiser };
  });
  requireCondition(mounted.player.vehicle.type === cruiserType, 'Mounted cruiser verification was not retained');

  const capture = await step('capture nearby robber carrying stolen gold', async () => {
    await command(`clear ${playerName} minecraft:gold_ingot`);
    const beforeGold = await inventoryCount('minecraft:gold_ingot');
    await checkedCommand(`summon ${robberType} ${cruiserBlock.x + 1.5} ${arenaBase.y} ${cruiserBlock.z + 0.5} {stolen_gold:1b}`);
    const captured = await waitForEntityState(
      baseUrl,
      cruiserType,
      (entity) => entity.custom && entity.custom.capturedRobbers >= 1,
      10000
    );
    const cleared = await waitForNoEntities(baseUrl, robberType, 5000);
    const afterGold = await inventoryCount('minecraft:gold_ingot');
    requireCondition(captured.custom.capturedRobbers === 1, `Expected one captured robber, saw ${captured.custom.capturedRobbers}`);
    requireCondition(afterGold === beforeGold + 1, `Expected recovered gold count ${beforeGold + 1}, saw ${afterGold}`);
    return { captured, cleared, beforeGold, afterGold };
  });
  requireCondition(capture.captured.custom.capturedRobbers === 1, 'Capture count did not reach one');

  const jail = await step('drop captured robber into jail', async () => {
    const jailBuild = await placeMinimalJail(arenaBase, cruiserBlock);
    const released = await waitForEntityState(
      baseUrl,
      cruiserType,
      (entity) => entity.custom && entity.custom.capturedRobbers === 0,
      25000,
      500
    );
    const prisoner = await waitForEntityState(
      baseUrl,
      robberType,
      (entity) => entity.custom && entity.custom.jailed === true,
      10000
    );
    return { jailBuild, released, prisoner };
  });
  requireCondition(jail.prisoner.custom.jailed, 'Dropped-off robber did not report jailed state');

  const screenshot = await step('screenshot', async () => requestJson(baseUrl, '/screenshot', 'POST', {
    name: screenshotName,
    resume: true,
    hideGui: true,
    clearChat: true
  }));

  return {
    ok: true,
    scenario: 'cops-smoke',
    cruiser: cruiserType,
    robber: robberType,
    screenshot: screenshot.file,
    steps
  };
}

async function runCopsStructuresSmoke(baseUrl, args) {
  const robberType = option(args, 'robberType', 'COPS_ROBBER_ENTITY', 'cops_robbers:bank_robber');
  const fireTruckType = option(args, 'fireTruckType', 'COPS_FIRE_TRUCK_ENTITY', 'cops_robbers:fire_truck');
  const firemanType = option(args, 'firemanType', 'COPS_FIREMAN_ENTITY', 'cops_robbers:fireman');
  const tellerType = option(args, 'tellerType', 'COPS_TELLER_ENTITY', 'cops_robbers:teller');
  const screenshotName = option(
    args,
    'screenshotName',
    'BRIDGE_SCREENSHOT_NAME',
    `cops-and-robbers-structures-${Date.now()}.png`
  );
  const steps = [];

  async function step(name, run) {
    const value = await run();
    steps.push({ name, ok: true, value });
    return value;
  }

  async function command(commandText) {
    return requestJson(baseUrl, '/command', 'POST', { command: commandText });
  }

  async function checkedCommand(commandText) {
    const result = await command(commandText);
    requireCondition(result.success !== false, `Command failed: ${commandText}`);
    return result;
  }

  async function clearEntities(type) {
    return requestJson(baseUrl, '/clear-entities', 'POST', { type });
  }

  async function setAbsoluteBlock(position, block, replace = '') {
    const body = { ...position, block };
    if (replace) {
      body.replace = replace;
    }
    return requestJson(baseUrl, '/set-block', 'POST', body);
  }

  async function useEntity(type, body = {}) {
    return requestJson(baseUrl, '/use-entity', 'POST', {
      type,
      radius: 24,
      ...body
    });
  }

  async function useBlock(body) {
    return requestJson(baseUrl, '/use-block', 'POST', body);
  }

  async function countBlocks(box) {
    return requestJson(baseUrl, '/count-blocks', 'POST', box);
  }

  function blockCount(scan, block) {
    return (scan.counts && scan.counts[block]) || 0;
  }

  async function buildLargeArena(arenaRadius = 34) {
    const state = await requestJson(baseUrl, '/state');
    const player = state.players.find((candidate) => candidate.name === playerName);
    requireCondition(player, `Could not find player state for ${playerName}`);
    const base = {
      x: Math.round(player.position.x),
      y: Math.ceil(player.position.y),
      z: Math.round(player.position.z)
    };
    const ranges = [
      [base.x - arenaRadius, base.x],
      [base.x + 1, base.x + arenaRadius]
    ];
    for (const [minX, maxX] of ranges) {
      await command(
        `fill ${minX} ${base.y} ${base.z - arenaRadius} ${maxX} ${base.y + 8} ${base.z + arenaRadius} minecraft:air`
      );
    }
    await command(
      `fill ${base.x - arenaRadius} ${base.y - 1} ${base.z - arenaRadius} ${base.x + arenaRadius} ${base.y - 1} ${base.z + arenaRadius} minecraft:smooth_stone`
    );
    await command(`tp ${playerName} ${base.x + 0.5} ${base.y} ${base.z + 0.5} 0 0`);
    const floorBlock = await waitForBlock(baseUrl, { x: base.x, y: base.y - 1, z: base.z }, 'minecraft:smooth_stone', 5000);
    return { base, radius: arenaRadius, floorBlock };
  }

  async function placeKit(item, origin) {
    await command(`tp ${playerName} ${origin.x + 0.5} ${origin.y} ${origin.z + 2.5} 0 0`);
    const used = await useBlock({
      x: origin.x,
      y: origin.y - 1,
      z: origin.z,
      item,
      count: 1,
      face: 'up'
    });
    requireCondition(used.consumed, `${item} use on block was not consumed`);
    return used;
  }

  const playerName = singlePlayerName(await requestJson(baseUrl, '/state'));
  let arenaBase = null;
  let stationOrigin = null;
  let fireStationOrigin = null;
  let bankOrigin = null;

  await step('prepare structure arena', async () => {
    await command('time set day');
    await command('weather clear');
    await command('difficulty easy');
    await command('gamerule doMobSpawning false');
    await command('gamerule doDaylightCycle false');
    await command(`gamemode creative ${playerName}`);
    await command(`clear ${playerName}`);
    await clearEntities(robberType);
    await clearEntities('cops_robbers:police_cruiser');
    await clearEntities(fireTruckType);
    await clearEntities('cops_robbers:cop');
    await clearEntities(firemanType);
    await clearEntities(tellerType);
    const arena = await buildLargeArena(34);
    arenaBase = arena.base;
    stationOrigin = { x: arenaBase.x - 22, y: arenaBase.y, z: arenaBase.z + 2 };
    fireStationOrigin = { x: arenaBase.x, y: arenaBase.y, z: arenaBase.z + 2 };
    bankOrigin = { x: arenaBase.x + 22, y: arenaBase.y, z: arenaBase.z + 2 };
    await requestJson(baseUrl, '/chat', 'POST', { message: 'Cops and Robbers structures smoke starting.' });
    return arena;
  });

  const station = await step('place police station kit', async () => {
    const used = await placeKit('cops_robbers:police_station_kit', stationOrigin);
    const scan = await countBlocks({
      x1: stationOrigin.x - 10,
      y1: stationOrigin.y,
      z1: stationOrigin.z - 23,
      x2: stationOrigin.x + 10,
      y2: stationOrigin.y + 6,
      z2: stationOrigin.z + 8
    });
    requireCondition(blockCount(scan, 'minecraft:iron_bars') >= 70, `Police station has too few iron bars: ${blockCount(scan, 'minecraft:iron_bars')}`);
    requireCondition(blockCount(scan, 'minecraft:iron_door') >= 6, `Police station has too few iron door blocks: ${blockCount(scan, 'minecraft:iron_door')}`);
    requireCondition(blockCount(scan, 'minecraft:quartz_block') >= 100, `Police station has too few quartz blocks: ${blockCount(scan, 'minecraft:quartz_block')}`);
    return { used, scan };
  });
  requireCondition(blockCount(station.scan, 'minecraft:iron_bars') >= 70, 'Police station block count did not persist');

  const fireStation = await step('place fire station kit', async () => {
    const used = await placeKit('cops_robbers:fire_station_kit', fireStationOrigin);
    const scan = await countBlocks({
      x1: fireStationOrigin.x - 10,
      y1: fireStationOrigin.y,
      z1: fireStationOrigin.z - 14,
      x2: fireStationOrigin.x + 10,
      y2: fireStationOrigin.y + 7,
      z2: fireStationOrigin.z + 9
    });
    requireCondition(blockCount(scan, 'minecraft:red_concrete') >= 140, `Fire station has too little red concrete: ${blockCount(scan, 'minecraft:red_concrete')}`);
    requireCondition(blockCount(scan, 'minecraft:smooth_stone') >= 250, `Fire station has too little smooth stone: ${blockCount(scan, 'minecraft:smooth_stone')}`);
    requireCondition(blockCount(scan, 'minecraft:white_wool') >= 50, `Fire station has too little white wool: ${blockCount(scan, 'minecraft:white_wool')}`);
    return { used, scan };
  });
  requireCondition(blockCount(fireStation.scan, 'minecraft:red_concrete') >= 140, 'Fire station block count did not persist');

  await step('fire station kit spawned crew', async () => {
    const firemen = await waitForEntityCount(baseUrl, firemanType, 3, 10000);
    const trucks = await waitForEntityCount(baseUrl, fireTruckType, 1, 10000);
    requireCondition(firemen.length >= 3, `Expected at least 3 firefighters, saw ${firemen.length}`);
    requireCondition(trucks.length >= 1, `Expected at least 1 fire truck, saw ${trucks.length}`);
    return { firemen, trucks };
  });

  const bank = await step('place bank kit', async () => {
    const used = await placeKit('cops_robbers:bank_kit', bankOrigin);
    const scan = await countBlocks({
      x1: bankOrigin.x - 10,
      y1: bankOrigin.y,
      z1: bankOrigin.z - 14,
      x2: bankOrigin.x + 10,
      y2: bankOrigin.y + 6,
      z2: bankOrigin.z + 7
    });
    requireCondition(blockCount(scan, 'minecraft:chest') >= 7, `Bank has too few vault chests: ${blockCount(scan, 'minecraft:chest')}`);
    requireCondition(blockCount(scan, 'minecraft:gold_block') >= 2, `Bank has too few gold blocks: ${blockCount(scan, 'minecraft:gold_block')}`);
    requireCondition(blockCount(scan, 'minecraft:white_wool') >= 100, `Bank has too little white wool: ${blockCount(scan, 'minecraft:white_wool')}`);
    return { used, scan };
  });
  requireCondition(blockCount(bank.scan, 'minecraft:chest') >= 7, 'Bank chest count did not persist');

  await step('bank kit spawned tellers', async () => {
    const tellers = await waitForEntityCount(baseUrl, tellerType, 3, 10000);
    requireCondition(tellers.length >= 3, `Expected at least 3 tellers, saw ${tellers.length}`);
    return { tellers };
  });

  await step('robber steals from placed vault', async () => {
    const vaultChest = await blockAt(baseUrl, { x: bankOrigin.x, y: bankOrigin.y + 1, z: bankOrigin.z - 8 });
    requireCondition(vaultChest.block === 'minecraft:chest', `Expected bank vault chest at scripted vault point, saw ${vaultChest.block}`);
    await checkedCommand(`summon ${robberType} ${bankOrigin.x + 0.5} ${bankOrigin.y + 1} ${bankOrigin.z - 7.5}`);
    const robber = await waitForEntityState(
      baseUrl,
      robberType,
      (entity) => entity.custom && entity.custom.stolenGold === true,
      12000
    );
    await checkedCommand(`tp @e[type=${robberType},limit=1,sort=nearest] ${bankOrigin.x + 8.5} ${bankOrigin.y + 1} ${bankOrigin.z - 4.5}`);
    const arsonist = await waitForEntityState(
      baseUrl,
      robberType,
      (entity) => entity.custom && entity.custom.litBankFire === true,
      15000
    );
    return { vaultChest, robber, arsonist };
  });

  await step('firefighter extinguishes nearby fire', async () => {
    const fireBase = { x: arenaBase.x, y: arenaBase.y - 1, z: arenaBase.z + 24 };
    const fire = { x: fireBase.x + 1, y: arenaBase.y, z: fireBase.z };
    await setAbsoluteBlock(fireBase, 'minecraft:oak_planks');
    await setAbsoluteBlock(fire, 'minecraft:fire');
    await checkedCommand(`summon ${firemanType} ${fireBase.x + 0.5} ${arenaBase.y} ${fireBase.z + 0.5}`);
    const extinguished = await waitForBlock(baseUrl, fire, 'minecraft:air', 10000);
    return { fireBase, fire, extinguished };
  });

  await step('fire truck water cannon extinguishes fire', async () => {
    await clearEntities(firemanType);
    await clearEntities(fireTruckType);
    const truck = { x: arenaBase.x + 8, y: arenaBase.y, z: arenaBase.z + 22 };
    const fireBase = { x: truck.x, y: arenaBase.y - 1, z: truck.z + 4 };
    const fire = { x: fireBase.x, y: arenaBase.y, z: fireBase.z };
    await setAbsoluteBlock(fireBase, 'minecraft:oak_planks');
    await setAbsoluteBlock(fire, 'minecraft:fire');
    await checkedCommand(`summon ${fireTruckType} ${truck.x + 0.5} ${truck.y} ${truck.z + 0.5}`);
    await checkedCommand(`tp @e[type=${fireTruckType},limit=1,sort=nearest] ${truck.x + 0.5} ${truck.y} ${truck.z + 0.5} 0 0`);
    const mounted = await useEntity(fireTruckType, { emptyHand: true });
    requireCondition(mounted.consumed, 'Fire truck interaction was not consumed');
    const extinguished = await waitForBlock(baseUrl, fire, 'minecraft:air', 10000);
    return { truck, fireBase, fire, mounted, extinguished };
  });

  const screenshot = await step('screenshot', async () => requestJson(baseUrl, '/screenshot', 'POST', {
    name: screenshotName,
    resume: true,
    hideGui: true,
    clearChat: true
  }));

  return {
    ok: true,
    scenario: 'cops-structures-smoke',
    screenshot: screenshot.file,
    steps
  };
}

async function runCopsVisualSweep(baseUrl, args) {
  const robberType = option(args, 'robberType', 'COPS_ROBBER_ENTITY', 'cops_robbers:bank_robber');
  const cruiserType = option(args, 'cruiserType', 'COPS_CRUISER_ENTITY', 'cops_robbers:police_cruiser');
  const fireTruckType = option(args, 'fireTruckType', 'COPS_FIRE_TRUCK_ENTITY', 'cops_robbers:fire_truck');
  const copType = option(args, 'copType', 'COPS_COP_ENTITY', 'cops_robbers:cop');
  const firemanType = option(args, 'firemanType', 'COPS_FIREMAN_ENTITY', 'cops_robbers:fireman');
  const tellerType = option(args, 'tellerType', 'COPS_TELLER_ENTITY', 'cops_robbers:teller');
  const visualX = Math.round(optionNumber(args, 'visualX', 'COPS_VISUAL_X', 0));
  const visualY = Math.round(optionNumber(args, 'visualY', 'COPS_VISUAL_Y', 120));
  const visualZ = Math.round(optionNumber(args, 'visualZ', 'COPS_VISUAL_Z', 0));
  const requestedName = option(args, 'screenshotName', 'BRIDGE_SCREENSHOT_NAME', '');
  const screenshotPrefix = (requestedName || `cops-visual-${Date.now()}`)
    .replace(/\.png$/i, '')
    .replace(/[^A-Za-z0-9._-]/g, '-');
  const steps = [];

  async function step(name, run) {
    const value = await run();
    steps.push({ name, ok: true, value });
    return value;
  }

  async function command(commandText) {
    return requestJson(baseUrl, '/command', 'POST', { command: commandText });
  }

  async function checkedCommand(commandText) {
    const result = await command(commandText);
    requireCondition(result.success !== false, `Command failed: ${commandText}`);
    return result;
  }

  async function clearEntities(type) {
    return requestJson(baseUrl, '/clear-entities', 'POST', { type });
  }

  async function useBlock(body) {
    return requestJson(baseUrl, '/use-block', 'POST', body);
  }

  async function cleanScreenshot(suffix) {
    const shot = await requestJson(baseUrl, '/screenshot', 'POST', {
      name: `${screenshotPrefix}-${suffix}.png`,
      resume: true,
      hideGui: true,
      clearChat: true
    });
    return shot.file;
  }

  async function cameraShot(suffix, camera, target) {
    await checkedCommand(`gamemode spectator ${playerName}`);
    await checkedCommand(`tp ${playerName} ${camera.x} ${camera.y} ${camera.z} facing ${target.x} ${target.y} ${target.z}`);
    await sleep(650);
    return cleanScreenshot(suffix);
  }

  async function buildVisualStage(radius = 44) {
    const base = {
      x: visualX,
      y: visualY,
      z: visualZ
    };
    function tiledRanges(min, max, size) {
      const ranges = [];
      for (let start = min; start <= max; start += size) {
        ranges.push([start, Math.min(start + size - 1, max)]);
      }
      return ranges;
    }
    const xRanges = tiledRanges(base.x - radius, base.x + radius, 16);
    const zRanges = tiledRanges(base.z - radius, base.z + radius, 16);
    const yRanges = [
      [base.y, base.y + 9],
      [base.y + 10, base.y + 19],
      [base.y + 20, base.y + 29],
      [base.y + 30, base.y + 39],
      [base.y + 40, base.y + 49],
      [base.y + 50, base.y + 59]
    ];
    for (const [minX, maxX] of xRanges) {
      for (const [minZ, maxZ] of zRanges) {
        for (const [minY, maxY] of yRanges) {
          await command(`fill ${minX} ${minY} ${minZ} ${maxX} ${maxY} ${maxZ} minecraft:air`);
        }
      }
    }
    await command(`fill ${base.x - radius} ${base.y - 1} ${base.z - radius} ${base.x + radius} ${base.y - 1} ${base.z + radius} minecraft:smooth_stone`);
    return { base, radius };
  }

  async function placeKit(item, origin) {
    await checkedCommand(`gamemode creative ${playerName}`);
    await checkedCommand(`tp ${playerName} ${origin.x + 0.5} ${origin.y} ${origin.z + 2.5} 0 0`);
    const used = await useBlock({
      x: origin.x,
      y: origin.y - 1,
      z: origin.z,
      item,
      count: 1,
      face: 'up'
    });
    requireCondition(used.consumed, `${item} use on block was not consumed`);
    return used;
  }

  const playerName = singlePlayerName(await requestJson(baseUrl, '/state'));
  let arenaBase = null;
  let stationOrigin = null;
  let fireStationOrigin = null;
  let bankOrigin = null;
  const screenshots = {};

  await step('prepare visual stage', async () => {
    await command('time set noon');
    await command('weather clear');
    await command('gamerule doMobSpawning false');
    await command('gamerule doDaylightCycle false');
    await checkedCommand(`gamemode creative ${playerName}`);
    await command(`clear ${playerName}`);
    for (const type of [robberType, cruiserType, fireTruckType, copType, firemanType, tellerType]) {
      await clearEntities(type);
    }
    const arena = await buildVisualStage(54);
    arenaBase = arena.base;
    stationOrigin = { x: arenaBase.x - 32, y: arenaBase.y, z: arenaBase.z + 24 };
    fireStationOrigin = { x: arenaBase.x, y: arenaBase.y, z: arenaBase.z + 24 };
    bankOrigin = { x: arenaBase.x + 32, y: arenaBase.y, z: arenaBase.z + 24 };
    await command(`kill @e[type=!minecraft:player,x=${arenaBase.x - arena.radius},y=${arenaBase.y - 4},z=${arenaBase.z - arena.radius},dx=${arena.radius * 2},dy=70,dz=${arena.radius * 2}]`);
    await sleep(1500);
    await command(`kill @e[type=minecraft:item,x=${arenaBase.x - arena.radius},y=${arenaBase.y - 4},z=${arenaBase.z - arena.radius},dx=${arena.radius * 2},dy=70,dz=${arena.radius * 2}]`);
    await checkedCommand(`tp ${playerName} ${arenaBase.x + 0.5} ${arenaBase.y + 2.0} ${arenaBase.z - 8.5} 0 0`);
    return arena;
  });

  await step('summon visual lineup', async () => {
    const lineup = [
      { type: robberType, x: arenaBase.x - 8, z: arenaBase.z, nbt: '{NoAI:1b,PersistenceRequired:1b,Rotation:[180.0f,0.0f]}' },
      { type: robberType, x: arenaBase.x - 5, z: arenaBase.z, nbt: '{NoAI:1b,PersistenceRequired:1b,stolen_gold:1b,Rotation:[180.0f,0.0f]}' },
      { type: copType, x: arenaBase.x - 2, z: arenaBase.z, nbt: '{NoAI:1b,PersistenceRequired:1b,Rotation:[180.0f,0.0f]}' },
      { type: tellerType, x: arenaBase.x + 1, z: arenaBase.z, nbt: '{NoAI:1b,PersistenceRequired:1b,Rotation:[180.0f,0.0f]}' },
      { type: firemanType, x: arenaBase.x + 4, z: arenaBase.z, nbt: '{NoAI:1b,PersistenceRequired:1b,Rotation:[180.0f,0.0f]}' }
    ];
    for (const mob of lineup) {
      await checkedCommand(`summon ${mob.type} ${mob.x + 0.5} ${arenaBase.y} ${mob.z + 0.5} ${mob.nbt}`);
    }
    await checkedCommand(`summon ${cruiserType} ${arenaBase.x - 5.5} ${arenaBase.y} ${arenaBase.z + 7.5}`);
    await checkedCommand(`tp @e[type=${cruiserType},limit=1,sort=nearest] ${arenaBase.x - 5.5} ${arenaBase.y} ${arenaBase.z + 7.5} 180 0`);
    await checkedCommand(`summon ${fireTruckType} ${arenaBase.x + 5.5} ${arenaBase.y} ${arenaBase.z + 7.5}`);
    await checkedCommand(`tp @e[type=${fireTruckType},limit=1,sort=nearest] ${arenaBase.x + 5.5} ${arenaBase.y} ${arenaBase.z + 7.5} 180 0`);
    const robberWithGold = await waitForEntityState(baseUrl, robberType, (entity) => entity.custom && entity.custom.stolenGold === true, 5000);
    const cruiser = await waitForEntity(baseUrl, cruiserType, 5000);
    const fireTruck = await waitForEntity(baseUrl, fireTruckType, 5000);
    return { lineup, robberWithGold, cruiser, fireTruck };
  });

  screenshots.lineup = await step('capture mob and vehicle lineup', async () => cameraShot(
    'lineup',
    { x: arenaBase.x + 0.5, y: arenaBase.y + 2.4, z: arenaBase.z - 13.5 },
    { x: arenaBase.x + 0.5, y: arenaBase.y + 1.1, z: arenaBase.z + 2.5 }
  ));

  screenshots.mobs = await step('capture mob skins closeup', async () => cameraShot(
    'mobs-close',
    { x: arenaBase.x - 2.0, y: arenaBase.y + 2.1, z: arenaBase.z - 8.5 },
    { x: arenaBase.x - 2.0, y: arenaBase.y + 1.0, z: arenaBase.z + 0.5 }
  ));

  screenshots.vehicles = await step('capture vehicles closeup', async () => cameraShot(
    'vehicles-close',
    { x: arenaBase.x + 0.5, y: arenaBase.y + 3.0, z: arenaBase.z + 0.5 },
    { x: arenaBase.x + 0.5, y: arenaBase.y + 1.1, z: arenaBase.z + 7.5 }
  ));

  await step('place visual structures', async () => {
    const station = await placeKit('cops_robbers:police_station_kit', stationOrigin);
    const fireStation = await placeKit('cops_robbers:fire_station_kit', fireStationOrigin);
    const bank = await placeKit('cops_robbers:bank_kit', bankOrigin);
    await waitForEntityCount(baseUrl, tellerType, 3, 10000);
    await waitForEntityCount(baseUrl, firemanType, 3, 10000);
    await waitForEntityCount(baseUrl, fireTruckType, 1, 10000);
    return { station, fireStation, bank, stationOrigin, fireStationOrigin, bankOrigin };
  });

  screenshots.station = await step('capture police station front', async () => cameraShot(
    'station-front',
    { x: stationOrigin.x + 0.5, y: stationOrigin.y + 4.5, z: stationOrigin.z + 21.5 },
    { x: stationOrigin.x + 0.5, y: stationOrigin.y + 2.2, z: stationOrigin.z + 3.0 }
  ));

  screenshots.fireStation = await step('capture fire station front', async () => cameraShot(
    'fire-station-front',
    { x: fireStationOrigin.x + 0.5, y: fireStationOrigin.y + 4.5, z: fireStationOrigin.z + 19.5 },
    { x: fireStationOrigin.x + 0.5, y: fireStationOrigin.y + 2.2, z: fireStationOrigin.z + 3.0 }
  ));

  screenshots.bank = await step('capture bank front', async () => cameraShot(
    'bank-front',
    { x: bankOrigin.x + 0.5, y: bankOrigin.y + 4.5, z: bankOrigin.z + 19.5 },
    { x: bankOrigin.x + 0.5, y: bankOrigin.y + 2.2, z: bankOrigin.z + 3.0 }
  ));

  screenshots.overview = await step('capture visual overview', async () => cameraShot(
    'overview',
    { x: arenaBase.x + 0.5, y: arenaBase.y + 22.0, z: arenaBase.z - 34.5 },
    { x: arenaBase.x + 0.5, y: arenaBase.y + 2.0, z: arenaBase.z + 18.0 }
  ));

  return {
    ok: true,
    scenario: 'cops-visual-sweep',
    screenshots,
    steps
  };
}

function printBridgeUsage() {
  console.log(`Usage: node src/bridge-cli.js [action] [options]

Actions:
  health, state, smoke, chat, command, look, give, summon, teleport
	  player-abilities, use-entity, clear-entities
	  set-block-near-entity, set-block, block, use-block, count-blocks, terrain-scan
	  yorkie-smoke, yorkie-water-smoke, yorkie-adventure-smoke, yorkie-visual-sweep, yorkie-biome-scout, yorkie-natural-gallery
	  cops-smoke, cops-structures-smoke, cops-visual-sweep, screenshot

Common options:
  --host <host>        Bridge host. Default: 127.0.0.1
  --port <port>        Bridge port. Default: 57321
  --player <name>      Target player when multiple players are online
  --x/--y/--z <n>      Absolute block or teleport coordinates
  --item <id>          Namespaced item id for give/use-block/use-entity
  --block <id>         Namespaced block id or block state for set-block actions
  --report-file <path> Write the full JSON result to a file
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const action = args.action || 'health';
  if (args.help || action === 'help') {
    printBridgeUsage();
    return;
  }
  const host = option(args, 'host', 'BRIDGE_HOST', '127.0.0.1');
  const port = option(args, 'port', 'BRIDGE_PORT', '57321');
  const baseUrl = `http://${host}:${port}`;

  let result;
  if (action === 'health') {
    result = await requestJson(baseUrl, '/health');
  } else if (action === 'state') {
    result = await requestJson(baseUrl, '/state');
  } else if (action === 'smoke') {
    const player = option(args, 'player', 'BRIDGE_PLAYER', '');
    const distance = optionNumber(args, 'distance', 'BRIDGE_DISTANCE', 8);
    const message = option(args, 'message', 'BRIDGE_MESSAGE', 'Codex bridge smoke passed.');
    const lookBody = {};
    putOptional(lookBody, 'player', player);
    putOptional(lookBody, 'distance', distance);
    result = {
      health: await requestJson(baseUrl, '/health'),
      state: await requestJson(baseUrl, '/state'),
      look: await requestJson(baseUrl, '/look', 'POST', lookBody),
      chat: await requestJson(baseUrl, '/chat', 'POST', { message })
    };
  } else if (action === 'chat') {
    const message = option(args, 'message', 'BRIDGE_MESSAGE', 'Codex bridge connected.');
    result = await requestJson(baseUrl, '/chat', 'POST', { message });
  } else if (action === 'command') {
    const command = option(args, 'command', 'BRIDGE_COMMAND', 'say Playtest bridge command received.');
    result = await requestJson(baseUrl, '/command', 'POST', { command });
  } else if (action === 'look') {
    const body = {};
    putOptional(body, 'player', option(args, 'player', 'BRIDGE_PLAYER', ''));
    putOptional(body, 'distance', optionNumber(args, 'distance', 'BRIDGE_DISTANCE', 8));
    result = await requestJson(baseUrl, '/look', 'POST', body);
  } else if (action === 'give') {
    const body = {
      item: option(args, 'item', 'BRIDGE_ITEM', 'minecraft:apple'),
      count: optionNumber(args, 'count', 'BRIDGE_COUNT', 1)
    };
    putOptional(body, 'player', option(args, 'player', 'BRIDGE_PLAYER', ''));
    result = await requestJson(baseUrl, '/give', 'POST', body);
  } else if (action === 'summon') {
    const body = {
      entity: option(args, 'entity', 'BRIDGE_ENTITY', 'minecraft:pig'),
      count: optionNumber(args, 'count', 'BRIDGE_COUNT', 1)
    };
    putOptional(body, 'player', option(args, 'player', 'BRIDGE_PLAYER', ''));
    result = await requestJson(baseUrl, '/summon', 'POST', body);
  } else if (action === 'teleport') {
    const body = {
      x: optionNumber(args, 'x', 'BRIDGE_X', undefined),
      y: optionNumber(args, 'y', 'BRIDGE_Y', undefined),
      z: optionNumber(args, 'z', 'BRIDGE_Z', undefined)
    };
    putOptional(body, 'player', option(args, 'player', 'BRIDGE_PLAYER', ''));
    result = await requestJson(baseUrl, '/teleport', 'POST', body);
  } else if (action === 'player-abilities') {
    const body = {};
    putOptional(body, 'player', option(args, 'player', 'BRIDGE_PLAYER', ''));
    putOptional(body, 'flying', optionBoolean(args, 'flying', 'BRIDGE_PLAYER_FLYING', undefined));
    putOptional(body, 'mayfly', optionBoolean(args, 'mayfly', 'BRIDGE_PLAYER_MAYFLY', undefined));
    result = await requestJson(baseUrl, '/player-abilities', 'POST', body);
  } else if (action === 'use-entity') {
    const body = {
      type: option(args, 'type', 'BRIDGE_ENTITY', 'minecraft:pig'),
      radius: optionNumber(args, 'radius', 'BRIDGE_RADIUS', 6)
    };
    putOptional(body, 'player', option(args, 'player', 'BRIDGE_PLAYER', ''));
    putOptional(body, 'item', option(args, 'item', 'BRIDGE_ITEM', ''));
    putOptional(body, 'count', optionNumber(args, 'count', 'BRIDGE_COUNT', 1));
    putOptional(body, 'emptyHand', optionBoolean(args, 'emptyHand', 'BRIDGE_EMPTY_HAND', false));
    result = await requestJson(baseUrl, '/use-entity', 'POST', body);
  } else if (action === 'clear-entities') {
    result = await requestJson(baseUrl, '/clear-entities', 'POST', {
      type: option(args, 'type', 'BRIDGE_ENTITY', 'minecraft:pig')
    });
  } else if (action === 'set-block-near-entity') {
    const body = {
      type: option(args, 'type', 'BRIDGE_ENTITY', 'minecraft:pig'),
      radius: optionNumber(args, 'radius', 'BRIDGE_RADIUS', 6),
      block: option(args, 'block', 'BRIDGE_BLOCK', 'minecraft:stone')
    };
    putOptional(body, 'player', option(args, 'player', 'BRIDGE_PLAYER', ''));
    putOptional(body, 'dx', optionNumber(args, 'dx', 'BRIDGE_DX', 0));
    putOptional(body, 'dy', optionNumber(args, 'dy', 'BRIDGE_DY', 0));
    putOptional(body, 'dz', optionNumber(args, 'dz', 'BRIDGE_DZ', 0));
    putOptional(body, 'replace', option(args, 'replace', 'BRIDGE_REPLACE_BLOCK', ''));
    result = await requestJson(baseUrl, '/set-block-near-entity', 'POST', body);
  } else if (action === 'set-block') {
    const body = {
      x: optionNumber(args, 'x', 'BRIDGE_X', undefined),
      y: optionNumber(args, 'y', 'BRIDGE_Y', undefined),
      z: optionNumber(args, 'z', 'BRIDGE_Z', undefined),
      block: option(args, 'block', 'BRIDGE_BLOCK', 'minecraft:stone')
    };
    putOptional(body, 'player', option(args, 'player', 'BRIDGE_PLAYER', ''));
    putOptional(body, 'replace', option(args, 'replace', 'BRIDGE_REPLACE_BLOCK', ''));
    result = await requestJson(baseUrl, '/set-block', 'POST', body);
  } else if (action === 'block') {
    const body = {
      x: optionNumber(args, 'x', 'BRIDGE_X', undefined),
      y: optionNumber(args, 'y', 'BRIDGE_Y', undefined),
      z: optionNumber(args, 'z', 'BRIDGE_Z', undefined)
    };
    putOptional(body, 'player', option(args, 'player', 'BRIDGE_PLAYER', ''));
    result = await requestJson(baseUrl, '/block', 'POST', body);
  } else if (action === 'use-block') {
    const body = {
      x: optionNumber(args, 'x', 'BRIDGE_X', undefined),
      y: optionNumber(args, 'y', 'BRIDGE_Y', undefined),
      z: optionNumber(args, 'z', 'BRIDGE_Z', undefined),
      item: option(args, 'item', 'BRIDGE_ITEM', 'minecraft:apple'),
      count: optionNumber(args, 'count', 'BRIDGE_COUNT', 1)
    };
    putOptional(body, 'player', option(args, 'player', 'BRIDGE_PLAYER', ''));
    putOptional(body, 'face', option(args, 'face', 'BRIDGE_FACE', 'up'));
    putOptional(body, 'hitX', optionNumber(args, 'hitX', 'BRIDGE_HIT_X', 0.5));
    putOptional(body, 'hitY', optionNumber(args, 'hitY', 'BRIDGE_HIT_Y', 1.0));
    putOptional(body, 'hitZ', optionNumber(args, 'hitZ', 'BRIDGE_HIT_Z', 0.5));
    result = await requestJson(baseUrl, '/use-block', 'POST', body);
  } else if (action === 'count-blocks') {
    const body = {
      x1: optionNumber(args, 'x1', 'BRIDGE_X1', undefined),
      y1: optionNumber(args, 'y1', 'BRIDGE_Y1', undefined),
      z1: optionNumber(args, 'z1', 'BRIDGE_Z1', undefined),
      x2: optionNumber(args, 'x2', 'BRIDGE_X2', undefined),
      y2: optionNumber(args, 'y2', 'BRIDGE_Y2', undefined),
      z2: optionNumber(args, 'z2', 'BRIDGE_Z2', undefined)
    };
    putOptional(body, 'player', option(args, 'player', 'BRIDGE_PLAYER', ''));
    result = await requestJson(baseUrl, '/count-blocks', 'POST', body);
  } else if (action === 'terrain-scan') {
    const body = {};
    putOptional(body, 'player', option(args, 'player', 'BRIDGE_PLAYER', ''));
    putOptional(body, 'x', optionNumber(args, 'x', 'BRIDGE_X', ''));
    putOptional(body, 'z', optionNumber(args, 'z', 'BRIDGE_Z', ''));
    putOptional(body, 'radius', optionNumber(args, 'radius', 'BRIDGE_RADIUS', 48));
    putOptional(body, 'step', optionNumber(args, 'step', 'BRIDGE_STEP', 8));
    result = await requestJson(baseUrl, '/terrain-scan', 'POST', body);
  } else if (action === 'yorkie-smoke') {
    result = await runYorkieSmoke(baseUrl, args);
  } else if (action === 'yorkie-water-smoke') {
    result = await runYorkieWaterSmoke(baseUrl, args);
  } else if (action === 'yorkie-adventure-smoke') {
    result = await runYorkieAdventureSmoke(baseUrl, args);
  } else if (action === 'yorkie-visual-sweep') {
    result = await runYorkieVisualSweep(baseUrl, args);
  } else if (action === 'yorkie-biome-scout') {
    result = await runYorkieBiomeScout(baseUrl, args);
  } else if (action === 'yorkie-natural-gallery') {
    result = await runYorkieNaturalGallery(baseUrl, args);
  } else if (action === 'cops-smoke') {
    result = await runCopsSmoke(baseUrl, args);
  } else if (action === 'cops-structures-smoke') {
    result = await runCopsStructuresSmoke(baseUrl, args);
  } else if (action === 'cops-visual-sweep') {
    result = await runCopsVisualSweep(baseUrl, args);
  } else if (action === 'screenshot') {
    const body = {};
    putOptional(body, 'name', option(args, 'name', 'BRIDGE_SCREENSHOT_NAME', ''));
    const keepScreen = optionBoolean(args, 'keepScreen', 'BRIDGE_SCREENSHOT_KEEP_SCREEN', false);
    body.resume = keepScreen ? false : optionBoolean(args, 'resume', 'BRIDGE_SCREENSHOT_RESUME', true);
    body.hideGui = optionBoolean(args, 'hideGui', 'BRIDGE_SCREENSHOT_HIDE_GUI', false);
    body.clearChat = optionBoolean(args, 'clearChat', 'BRIDGE_SCREENSHOT_CLEAR_CHAT', false);
    result = await requestJson(baseUrl, '/screenshot', 'POST', body);
  } else {
    throw new Error(`Unknown bridge action: ${action}`);
  }

  writeReportFile(option(args, 'reportFile', 'BRIDGE_REPORT_FILE', ''), result);
  console.log(JSON.stringify(result, null, 2));
}

function describeError(error) {
  const code = error && error.cause && error.cause.code;
  if (code === 'ECONNREFUSED' || (error && error.message === 'fetch failed')) {
    return 'Could not reach the playtest bridge. Start or restart Minecraft with playtest-bridge installed, then load a world.';
  }
  return error.stack || error.message;
}

main().catch((error) => {
  console.error(describeError(error));
  process.exitCode = 1;
});
