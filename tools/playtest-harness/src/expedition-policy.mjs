import { spawnSync } from 'node:child_process';
import { userInfo } from 'node:os';

export function expeditionScoutPolicy(mode) {
  if (mode === 'rules') return undefined;
  if (mode !== 'jev') throw new Error(`Unknown expedition policy ${mode}`);
  const key = process.env.OPENROUTER_API_KEY || spawnSync('/usr/bin/security', [
    'find-generic-password', '-a', userInfo().username, '-s', 'mushroom-qa-openrouter', '-w',
  ], { encoding: 'utf8', timeout: 7_000 }).stdout?.trim();
  if (!key) throw new Error('Set OPENROUTER_API_KEY or add the Mushroom QA OpenRouter key to Keychain');
  let remaining = 48;
  let lastDecisionTick = -Infinity;
  return async (player, routes, sheep) => {
    if (!remaining || player.gameTime - lastDecisionTick < 45 || routes.length < 2) return routes[0];
    lastDecisionTick = player.gameTime;
    remaining--;
    const offset = ([x, y, z]) => [
      Math.round(x - player.position.x), Math.round(y - player.position.y), Math.round(z - player.position.z),
    ];
    const localRoutes = routes.map(({ pos, revisits, surface }) => ({ offset: offset(pos), revisits, surface }));
    const labels = ['a', 'b', 'c'];
    const criteria = Object.fromEntries(localRoutes.map((route, index) =>
      [labels[index], `Take route ${labels[index]}: ${JSON.stringify(route)}`]));
    const start = performance.now();
    const trace = {
      at: new Date().toISOString(), policy: 'jev', stage: 'scout_for_wool',
      gameTime: player.gameTime, routes: localRoutes, chosen: null,
    };
    try {
      const response = await fetch('https://openrouter.ai/api/alpha/decisions', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(4_000),
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'typesafe/jev-1.13',
          state: {
            goal: 'Explore in Normal Survival and gather matching wool to make a bed and adopt Mushroom.',
            health: player.health, hunger: player.food, timeOfDay: player.timeOfDay,
            sheepOffset: sheep ? offset(sheep) : null, routes: localRoutes,
          },
          questions: {
            route: {
              type: 'choice',
              instructions: 'Choose the safest useful walking route. Seek the known sheep when possible, or fresh open grass when no sheep are visible. Avoid revisiting the same terrain.',
              criteria,
            },
          },
        }),
      });
      if (!response.ok) {
        if ([401, 402, 403, 404, 429].includes(response.status)) remaining = 0;
        throw new Error(`HTTP ${response.status}`);
      }
      const result = await response.json();
      const answer = result.answers?.route;
      trace.model = result.model;
      trace.inputTokens = result.usage?.input_tokens;
      trace.costUsd = result.usage?.cost;
      if (answer?.type === 'choice' && Object.hasOwn(criteria, answer.choice)) {
        trace.chosen = answer.choice;
        trace.confidence = answer.confidence;
        return routes[labels.indexOf(answer.choice)];
      }
      trace.fallback = 'unknown choice';
    } catch (error) {
      trace.fallback = /^HTTP \d{3}$/.test(error.message) ? error.message : 'request failed';
    } finally {
      trace.latencyMs = Math.round(performance.now() - start);
      console.log(JSON.stringify(trace));
    }
    return routes[0];
  };
}
