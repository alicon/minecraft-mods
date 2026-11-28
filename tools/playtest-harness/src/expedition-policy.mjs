import { spawnSync } from 'node:child_process';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { userInfo } from 'node:os';
import { dirname, join } from 'node:path';

export async function expeditionPolicy(mode, coachingFile, narrate) {
  if (mode === 'rules') return {};
  if (mode !== 'jev') throw new Error(`Unknown expedition policy ${mode}`);
  const key = process.env.OPENROUTER_API_KEY || spawnSync('/usr/bin/security', [
    'find-generic-password', '-a', userInfo().username, '-s', 'mushroom-qa-openrouter', '-w',
  ], { encoding: 'utf8', timeout: 7_000 }).stdout?.trim();
  if (!key) throw new Error('Set OPENROUTER_API_KEY or add the Mushroom QA OpenRouter key to Keychain');
  const limits = { scout_for_wool: 48, prepare_gear: 16, leave_quarry: 12 };
  const budgetFile = join(dirname(coachingFile), 'jev-budget.json');
  const recorded = await readFile(budgetFile, 'utf8').catch(error => {
    if (error.code !== 'ENOENT') throw error;
    return '{}';
  });
  const saved = JSON.parse(recorded);
  const remaining = Object.fromEntries(Object.entries(limits).map(([stage, limit]) => {
    const value = saved[stage] ?? limit;
    if (!Number.isInteger(value) || value < 0 || value > limit) throw new Error('Invalid saved Jev request budget');
    return [stage, value];
  }));
  const lastDecisionTick = new Map();
  let unavailable = false;
  async function ask(player, stage, state, instructions, criteria, fallback) {
    if (unavailable || !remaining[stage] || player.gameTime - (lastDecisionTick.get(stage) ?? -Infinity) < 45) {
      return fallback;
    }
    lastDecisionTick.set(stage, player.gameTime);
    remaining[stage]--;
    const budgetUpdate = `${budgetFile}.${process.pid}.tmp`;
    await writeFile(budgetUpdate, JSON.stringify(remaining), { flag: 'wx' });
    await rename(budgetUpdate, budgetFile);
    const coaching = (await readFile(coachingFile, 'utf8').catch(() => '')).trim().slice(0, 400);
    const start = performance.now();
    const trace = { at: new Date().toISOString(), policy: 'jev', stage, gameTime: player.gameTime, ...state, chosen: null };
    if (coaching) trace.coaching = coaching;
    try {
      const response = await fetch('https://openrouter.ai/api/alpha/decisions', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(4_000),
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'typesafe/jev-1.13',
          state: { ...state, health: player.health, hunger: player.food, timeOfDay: player.timeOfDay, coaching },
          questions: { next: { type: 'choice', instructions, criteria } },
        }),
      });
      if (!response.ok) {
        unavailable = [401, 402, 403, 404, 429].includes(response.status);
        throw new Error(`HTTP ${response.status}`);
      }
      const result = await response.json();
      const answer = result.answers?.next;
      trace.model = result.model;
      trace.inputTokens = result.usage?.input_tokens;
      trace.costUsd = result.usage?.cost;
      if (answer?.type === 'choice' && Object.hasOwn(criteria, answer.choice)) {
        trace.chosen = answer.choice;
        trace.confidence = answer.confidence;
        return answer.choice;
      }
      trace.fallback = 'unknown choice';
    } catch (error) {
      trace.fallback = /^HTTP \d{3}$/.test(error.message) ? error.message : 'request failed';
    } finally {
      trace.latencyMs = Math.round(performance.now() - start);
      console.log(JSON.stringify(trace));
      const description = stage === 'scout_for_wool'
        ? `Take route ${trace.chosen ?? fallback} toward ${state.sheepOffset ? 'the visible sheep' : 'fresh terrain'}.`
        : criteria[trace.chosen ?? fallback];
      await narrate?.('Decision', trace.chosen ? `Jev selected the next action. ${description}`
        : `Using the local choice after ${trace.fallback}. ${description}`, 15_000);
    }
    return fallback;
  }

  async function chooseRoute(player, routes, sheep) {
    if (routes.length < 2) return routes[0];
    const offset = ([x, y, z]) => [
      Number((x - player.position.x).toFixed(1)),
      Number((y - player.position.y).toFixed(1)),
      Number((z - player.position.z).toFixed(1)),
    ];
    const localRoutes = routes.map(({ pos: [x, y, z], revisits, surface }) => ({
      offset: offset([x + 0.5, y, z + 0.5]), revisits, surface,
    }));
    const labels = ['a', 'b', 'c'];
    const criteria = Object.fromEntries(localRoutes.map((route, index) =>
      [labels[index], `Take route ${labels[index]}: ${JSON.stringify(route)}`]));
    const choice = await ask(player, 'scout_for_wool', {
      goal: 'Explore in Normal Survival and gather matching wool to make a bed and adopt Mushroom.',
      sheepOffset: sheep ? offset(sheep) : null, routes: localRoutes,
    }, 'Choose the safest useful walking route toward sheep or fresh grass. Avoid revisiting terrain. Use the coaching note when it helps.', criteria, labels[0]);
    return routes[labels.indexOf(choice)];
  }

  function chooseWork(player, progress, fallback) {
    const mineral = progress.material === 'iron' ? 'iron ore' : 'stone';
    const options = {
      scout: `Walk on dry ground and look for exposed ${mineral} at a different spot.`,
      quarry: 'Dig one supported staircase and keep a safe route back to camp.',
    };
    if (progress.beforeNight && player.timeOfDay >= 9700) {
      options.camp = 'Return to the bed and continue mining after sleeping.';
    }
    return ask(player, 'prepare_gear', {
      goal: `Find ${mineral} to make the Survival gear.`, elevation: Math.floor(player.position.y), ...progress,
    },
      'Choose a useful change of plan. Consider repeated misses, the daylight left, and the coaching note.', options, fallback);
  }

  function chooseEscape(player, progress, choices, fallback) {
    if (Object.keys(choices).length < 2) return fallback;
    return ask(player, 'leave_quarry', { goal: 'Get back up the quarry safely.', ...progress },
      'Choose a safe change based on the last movement failure and the ground ahead. Avoid repeating a failed approach. Use the coaching note when it helps.',
      choices, fallback);
  }

  return { chooseRoute, chooseWork, chooseEscape };
}
