'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { journeyWaterGeometry, readWaterFixture, assertWaterFixture, settleWaterFixture } = require('./yorkie-water-fixture');
const base = { x: -61, y: 220, z: 106 };
const geometry = journeyWaterGeometry(base);
const volume = b => (b.x2 - b.x1 + 1) * (b.y2 - b.y1 + 1) * (b.z2 - b.z1 + 1);

function fixtureRequests({ blockLight = 13, waterFreezeEligible = false, ice = false } = {}) {
  const calls = [];
  return { calls, request: async (route, body) => {
    calls.push({ route, body });
    if (route === '/block') return { block: ice && body.x === -59 && body.y === 219 && body.z === 107 ? 'minecraft:ice' : 'minecraft:water',
      state: ice && body.x === -59 && body.y === 219 && body.z === 107 ? 'minecraft:ice' : 'minecraft:water[level=0]', blockLight, waterFreezeEligible };
    assert.equal(route, '/count-blocks', 'Auditing/settling may only read the fixture');
    const support = geometry.supports.find(s => JSON.stringify(s.bounds) === JSON.stringify(body));assert(support);
    return { volume: volume(body), counts: { [support.block]: volume(body) } };
  } };
}

test('journey water audit covers every source cell, lit bottom and complete containment walls', async () => {
  assert.deepEqual(geometry.water, { x1: -63, y1: 218, z1: 105, x2: -58, y2: 219, z2: 107 });
  assert.equal(volume(geometry.floor), 18);
  assert.deepEqual(geometry.supports.map(s => volume(s.bounds)), [18, 10, 10, 12, 12]);
  const mock = fixtureRequests();const audit = await readWaterFixture(mock.request, geometry);
  assert.equal(audit.water.length, 36);
  assert.equal(new Set(audit.water.map(c => Object.values(c.position).join(','))).size, 36);
  assert(audit.water.some(c => c.position.x === -59 && c.position.y === 219 && c.position.z === 107));
  assert.equal(mock.calls.filter(c => c.route === '/count-blocks').length, 5);
  assertWaterFixture(audit, geometry);
});

test('ice, flowing water, weak or missing native light facts and broken supports remain setup failures', async () => {
  const valid = await readWaterFixture(fixtureRequests().request, geometry);
  const changes = [
    a => { a.water[0].observed.block = 'minecraft:ice';a.water[0].observed.state = 'minecraft:ice'; },
    a => { a.water[0].observed.state = 'minecraft:water[level=1]'; },
    a => { a.water[0].observed.blockLight = 9; },
    a => { delete a.water[0].observed.blockLight; },
    a => { delete a.water[0].observed.waterFreezeEligible; },
    a => { a.water[0].observed.waterFreezeEligible = true; },
    a => { a.water.pop(); },
    a => { a.supports[0].observed.counts['minecraft:sea_lantern'] = 17; },
    a => { a.supports[1].observed.counts['minecraft:stone'] = 9; },
    a => { a.supports.pop(); }
  ];
  for (const change of changes) {
    const audit = structuredClone(valid);change(audit);
    assert.throws(() => assertWaterFixture(audit, geometry), error => error.phase === 'setup' && error.observed.waterFixtureAudit === audit);
  }
  for (const blockLight of [10, 15]) {
    const audit = await readWaterFixture(fixtureRequests({ blockLight }).request, geometry);
    assertWaterFixture(audit, geometry);
  }
});

test('setup waits for light propagation without ticking, melting or refilling the water', async () => {
  let auditCount = 0, delays = 0;
  const request = async (route, body) => {
    const response = await fixtureRequests({ blockLight: auditCount ? 13 : 0, waterFreezeEligible: !auditCount }).request(route, body);
    if (route === '/count-blocks' && body.z1 === geometry.supports.at(-1).bounds.z1 && body.z2 === body.z1) auditCount++;
    return response;
  };
  const result = await settleWaterFixture(request, geometry, { delay: async ms => { assert.equal(ms, 50);delays++; } });
  assert.equal(result.audits.length, 2);assert.equal(delays, 1);
  assertWaterFixture(result.settled, geometry);
});

test('changed water fails immediately; light settling has a finite bound', async () => {
  let delays = 0;
  await assert.rejects(settleWaterFixture(fixtureRequests({ ice: true }).request, geometry,
    { delay: async () => { delays++; } }), error => error.phase === 'setup' && /source-water cell/.test(error.message));
  assert.equal(delays, 0);
  await assert.rejects(settleWaterFixture(fixtureRequests({ blockLight: 0, waterFreezeEligible: true }).request, geometry,
    { attempts: 3, delay: async () => { delays++; } }), error => error.phase === 'setup' && error.observed.waterFixtureAudit.attempts.length === 3);
  assert.equal(delays, 2);
});
