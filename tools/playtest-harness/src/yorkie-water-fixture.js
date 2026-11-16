'use strict';

// A controlled journey needs liquid water, including in cold biomes at y=220.
// Submerged lighting preserves sky exposure, biome and pool depth. Minecraft's
// native freeze predicate refuses cells with block light >=10 (daylight differs).
function journeyWaterGeometry(base) {
  const water = { x1: base.x - 2, y1: base.y - 2, z1: base.z - 1, x2: base.x + 3, y2: base.y - 1, z2: base.z + 1 };
  const floor = { ...water, y1: base.y - 3, y2: base.y - 3 };
  const supports = [
    { name: 'lit-bottom', block: 'minecraft:sea_lantern', bounds: floor },
    { name: 'west-wall', block: 'minecraft:stone', bounds: { ...water, x1: base.x - 3, x2: base.x - 3, z1: base.z - 2, z2: base.z + 2 } },
    { name: 'east-wall', block: 'minecraft:stone', bounds: { ...water, x1: base.x + 4, x2: base.x + 4, z1: base.z - 2, z2: base.z + 2 } },
    { name: 'north-wall', block: 'minecraft:stone', bounds: { ...water, z1: base.z - 2, z2: base.z - 2 } },
    { name: 'south-wall', block: 'minecraft:stone', bounds: { ...water, z1: base.z + 2, z2: base.z + 2 } }
  ];
  return { water, floor, supports, minimumBlockLight: 10, climateControl: 'submerged-sea-lantern-floor' };
}

const volume = b => (b.x2 - b.x1 + 1) * (b.y2 - b.y1 + 1) * (b.z2 - b.z1 + 1);

async function readWaterFixture(request, geometry) {
  const cells = [], b = geometry.water;
  for (let x = b.x1; x <= b.x2; x++)
    for (let y = b.y1; y <= b.y2; y++)
      for (let z = b.z1; z <= b.z2; z++) cells.push({ x, y, z });
  const water = [];
  for (let i = 0; i < cells.length; i += 8) {
    water.push(...await Promise.all(cells.slice(i, i + 8).map(async position => ({ position, observed: await request('/block', position) }))));
  }
  const supports = await Promise.all(geometry.supports.map(async region => ({
    ...region, observed: await request('/count-blocks', region.bounds)
  })));
  return { water, supports };
}

function fixtureError(message, audit) {
  const error = new Error(message);
  error.phase = 'setup';
  error.observed = { waterFixtureAudit: audit };
  throw error;
}

function assertWaterFixture(audit, geometry, { allowLightSettling = false } = {}) {
  if (audit.water.length !== volume(geometry.water)) fixtureError('Water fixture audit is incomplete', audit);
  let lightReady = true;
  for (const { position, observed: block } of audit.water) {
    const where = `${position.x},${position.y},${position.z}`;
    if (block.block !== 'minecraft:water' || block.state !== 'minecraft:water[level=0]') {
      fixtureError(`Controlled water lost a source-water cell at ${where}: ${block.state}`, audit);
    }
    if (!Number.isInteger(block.blockLight) || block.blockLight < 0 || block.blockLight > 15 || typeof block.waterFreezeEligible !== 'boolean') {
      fixtureError('Water audit needs native block light/freezing observations; install and restart the rebuilt bridge', audit);
    }
    if (block.blockLight < geometry.minimumBlockLight || block.waterFreezeEligible) lightReady = false;
  }
  if (audit.supports.length !== geometry.supports.length) fixtureError('Water fixture support audit is incomplete', audit);
  for (const support of audit.supports) {
    const expected = volume(support.bounds);
    if (support.observed.volume !== expected || support.observed.counts?.[support.block] !== expected) {
      fixtureError(`Controlled water lost its full ${support.name} support`, audit);
    }
  }
  if (!lightReady && !allowLightSettling) fixtureError('Controlled water is insufficiently lit or natively freeze-eligible', audit);
  return lightReady;
}

// Light propagation can finish after the placement command. Wait without native
// world steps; never refill/melt a changed cell or alter an asserted trajectory.
async function settleWaterFixture(request, geometry, { attempts = 20, delay = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  const audits = [];
  for (let attempt = 0; attempt < attempts; attempt++) {
    const audit = await readWaterFixture(request, geometry);
    audits.push(audit);
    if (assertWaterFixture(audit, geometry, { allowLightSettling: true })) return { audits, settled: audit };
    if (attempt + 1 < attempts) await delay(50);
  }
  fixtureError('Water fixture block lighting did not settle within its bounded setup wait', { attempts: audits });
}

module.exports = { journeyWaterGeometry, readWaterFixture, assertWaterFixture, settleWaterFixture };
