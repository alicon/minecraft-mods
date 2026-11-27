const assert = require('node:assert/strict');
const { mkdtemp, rm, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const test = require('node:test');

test('reattaching the controller cannot refill its Jev request budget', async t => {
  const { expeditionPolicy } = await import('./expedition-policy.mjs');
  const report = await mkdtemp(join(tmpdir(), 'expedition-budget.'));
  t.after(() => rm(report, { recursive: true, force: true }));
  const existingKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'local-test-key';
  t.after(() => {
    if (existingKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = existingKey;
  });
  const request = t.mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    json: async () => ({
      answers: { next: { type: 'choice', choice: 'b' } },
      usage: { input_tokens: 50, cost: 0.0000021 },
    }),
  }));
  const budget = { scout_for_wool: 1, prepare_gear: 0, leave_quarry: 0 };
  await writeFile(join(report, 'jev-budget.json'), JSON.stringify(budget));
  const coaching = join(report, 'coach.txt');
  const player = { gameTime: 100, position: { x: 0, y: 3, z: 0 } };
  const routes = [{ pos: [1, 3, 0] }, { pos: [0, 3, 1] }];

  const initial = await expeditionPolicy('jev', coaching);
  assert.equal(await initial.chooseRoute(player, routes), routes[1]);
  const reattached = await expeditionPolicy('jev', coaching);
  assert.equal(await reattached.chooseRoute({ ...player, gameTime: 200 }, routes), routes[0]);
  assert.equal(request.mock.callCount(), 1);
});
