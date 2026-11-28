const assert = require('node:assert/strict');
const test = require('node:test');

test('stronghold triangulation accepts forward intersections and rejects unstable bearings', async () => {
  const { intersectEyeBearings } = await import('./expedition-eye-route.mjs');
  const first = { origin: { x: 0, z: 0 }, bearing: { x: 0, z: 1 } };
  const normal = Math.hypot(16, 48);
  const second = { origin: { x: 16, z: 0 }, bearing: { x: -16 / normal, z: 48 / normal } };
  const result = intersectEyeBearings(first, second);
  assert.equal(result.x, 0);
  assert.ok(Math.abs(result.z - 48) < 0.001);
  assert.equal(intersectEyeBearings(first, { ...second, bearing: { x: 0.01, z: 1 } }), null);
  assert.equal(intersectEyeBearings(first, { ...second, bearing: { x: 16 / normal, z: -48 / normal } }), null);
});

const cell = (x, y, z, block) => ({ x, y, z, b: `minecraft:${block}` });
const frame = [-1, 0, 1].flatMap(i => [
  cell(-2, 64, i, 'end_portal_frame'), cell(2, 64, i, 'end_portal_frame'),
  cell(i, 64, -2, 'end_portal_frame'), cell(i, 64, 2, 'end_portal_frame'),
]);
const center = [0, 64, 0];
const player = { x: 0.5, y: 64, z: 4.5 };
const dryFloor = [cell(0, 63, 3, 'stone_bricks'), cell(3, 63, 0, 'stone_bricks')];
const water = cell(0, 64, 3, 'water');
const roof = cell(3, 66, 0, 'stone_bricks');

test('a stronghold bearing uses observed horizontal flight and ignores vertical motion', async () => {
  const { eyeBearing } = await import('./expedition-eye-route.mjs');
  assert.equal(eyeBearing([4, 62, 3], [4, 69, 3]), null);
  assert.deepEqual(eyeBearing([4, 62, 3], [1, 63, 7]), { x: -0.6, z: 0.8, distance: 5 });
});

test('End entry finds the full observed ring and sorts dry, unobstructed approaches by distance', async () => {
  const { findEndRing } = await import('./expedition-end-entry.mjs');
  const ring = findEndRing([...frame, ...dryFloor], player);
  assert.deepEqual(ring.center, center);
  assert.equal(ring.frame.length, 12);
  assert.deepEqual(ring.approaches, [[0, 64, 3], [3, 64, 0]]);
  assert.equal(ring.lit, false);
  assert.equal(findEndRing([...frame.slice(1), ...dryFloor], player), undefined);
  assert.equal(findEndRing([...frame, ...dryFloor, water, roof], player), undefined);
});

test('End entry requires all nine vanilla portal blocks when deciding if it can cross', async () => {
  const { findEndRing } = await import('./expedition-end-entry.mjs');
  const portal = [-1, 0, 1].flatMap(x => [-1, 0, 1].map(z => cell(x, 64, z, 'end_portal')));
  assert.equal(findEndRing([...frame, ...dryFloor, ...portal.slice(1)], player), undefined);
  assert.equal(findEndRing([...frame, ...dryFloor, ...portal], player).lit, true);
});
