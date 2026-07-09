'use strict';

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
    const entity = nearestEntity(lastState, type);
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
    resume: true
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
    resume: true
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
    resume: true
  }));

  return {
    ok: true,
    scenario: 'yorkie-adventure-smoke',
    entity: yorkieType,
    screenshot: screenshot.file,
    steps
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const action = args.action || 'health';
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
  } else if (action === 'yorkie-smoke') {
    result = await runYorkieSmoke(baseUrl, args);
  } else if (action === 'yorkie-water-smoke') {
    result = await runYorkieWaterSmoke(baseUrl, args);
  } else if (action === 'yorkie-adventure-smoke') {
    result = await runYorkieAdventureSmoke(baseUrl, args);
  } else if (action === 'screenshot') {
    const body = {};
    putOptional(body, 'name', option(args, 'name', 'BRIDGE_SCREENSHOT_NAME', ''));
    const keepScreen = optionBoolean(args, 'keepScreen', 'BRIDGE_SCREENSHOT_KEEP_SCREEN', false);
    body.resume = keepScreen ? false : optionBoolean(args, 'resume', 'BRIDGE_SCREENSHOT_RESUME', true);
    result = await requestJson(baseUrl, '/screenshot', 'POST', body);
  } else {
    throw new Error(`Unknown bridge action: ${action}`);
  }

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
