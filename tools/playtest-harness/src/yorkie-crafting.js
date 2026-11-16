'use strict';
const { runCases } = require('./scenario-runner');
const { assertTestWorld } = require('./yorkie-world');
const { withBridgeLock } = require('./bridge-lock');
const { provenance } = require('./bridge-provenance');

const copper = 'minecraft:copper_ingot';
const wool = 'minecraft:white_wool';
const string = 'minecraft:string';
const bowl = 'mushroom_yorkie:dog_bowl';
function check(value, message) { if (!value) throw Error(message); }

function craftingInputs() {
  const craft = (name, width, height, slots, expected, count = 1, unique = true) => ({ name, body: { width, height, slots }, expected, count, unique });
  return [
    craft('dog-bowl', 3, 2, [copper, null, copper, null, copper, null], bowl),
    craft('dog-food-bowl', 2, 1, [bowl, 'mushroom_yorkie:yorkie_treat'], 'mushroom_yorkie:dog_food_bowl'),
    craft('dog-water-bowl', 2, 1, [bowl, 'minecraft:water_bucket'], 'mushroom_yorkie:dog_water_bowl'),
    craft('yorkie-ball', 2, 2, [wool, string, 'minecraft:lime_dye', null], 'mushroom_yorkie:yorkie_ball'),
    craft('yorkie-chew-toy', 2, 2, [wool, string, 'minecraft:yellow_dye', null], 'mushroom_yorkie:yorkie_chew_toy'),
    craft('yorkie-treat', 3, 1, ['minecraft:mutton', 'minecraft:bone', 'minecraft:bone'], 'mushroom_yorkie:yorkie_treat', 8),
    craft('dog-bed', 3, 2, [wool, wool, wool, null, 'minecraft:red_dye', null], 'mushroom_yorkie:dog_bed'),
    craft('yorkie-harness', 3, 3, [string, null, string, 'minecraft:leather', 'minecraft:black_dye', 'minecraft:leather', null, string, null], 'mushroom_yorkie:yorkie_harness'),
    craft('doghouse', 3, 3, ['minecraft:dark_oak_planks', 'minecraft:dark_oak_planks', 'minecraft:dark_oak_planks', 'minecraft:cherry_planks', 'minecraft:lantern', 'minecraft:cherry_planks', 'minecraft:cherry_planks', 'minecraft:red_wool', 'minecraft:cherry_planks'], 'mushroom_yorkie:doghouse'),
    craft('vanilla-copper-nuggets', 1, 1, [copper], 'minecraft:copper_nugget', 9, false),
    craft('vanilla-lime-wool', 2, 1, [wool, 'minecraft:lime_dye'], 'minecraft:lime_wool', 1, false),
    craft('vanilla-yellow-wool', 2, 1, [wool, 'minecraft:yellow_dye'], 'minecraft:yellow_wool', 1, false),
    { name: 'no-recipe', body: { width: 1, height: 1, slots: [null] }, unmatched: true },
    { name: 'reject-wrong-grid-size', body: { width: 2, height: 2, slots: [copper] }, error: 'exactly width * height' },
    { name: 'reject-unknown-item', body: { width: 1, height: 1, slots: ['minecraft:missing_crafting_fixture'] }, error: 'Unknown crafting item' }
  ];
}

function craftingCases({ query, guard = async () => {} }) {
  return craftingInputs().map((row) => ({
    name: `craft-${row.name}`, inputs: row,
    setup: guard,
    run: async (fixture, result) => {
      const response = await query(row.body);
      result.observed = response;
      if (row.error) {
        check(response.ok === false && response.error?.includes(row.error), `Invalid grid was not rejected: ${JSON.stringify(response)}`);
      } else {
        check(response.ok && response.mode === 'read_only_recipe_resolution', 'Missing native read-only crafting response');
        if (row.unmatched) check(response.matched === false && response.result?.empty && response.matchingRecipes?.length === 0, 'Empty grid produced a recipe');
        else {
          check(response.matched && response.result?.id === row.expected && response.result?.count === row.count,
            `Expected ${row.count} ${row.expected}, observed ${JSON.stringify(response.result)}`);
          if (row.unique) check(response.matchingRecipes?.length === 1, `Ambiguous Mushroom craft: ${JSON.stringify(response.matchingRecipes)}`);
        }
      }
      return response;
    }
  }));
}

async function runCraftingChecks(baseUrl, args) {
  check(/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(baseUrl), 'Crafting checks require a loopback bridge');
  return withBridgeLock(baseUrl, async () => {
    async function request(route, body) {
      const response = await fetch(baseUrl + route, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body), signal: AbortSignal.timeout(15000) });
      const result = await response.json();
      check(response.ok, `${route}: HTTP ${response.status} ${JSON.stringify(result)}`);
      return result;
    }
    const guard = async () => { const state = await request('/state'); assertTestWorld(state, args.expectedSave); return state; };
    const initial = await guard();
    return runCases(craftingCases({ guard, query: body => request('/crafting-check', body) }), {
      reportFile: args.reportFile || process.env.BRIDGE_REPORT_FILE || 'build/playtest-reports/yorkie-crafting.json',
      metadata: { scenario: 'yorkie-crafting', saveName: initial.saveName, provenance: provenance(initial.savePath), observation: 'read_only_native_recipe_resolution_not_inventory_crafting' },
      capture: guard,
      onResult: result => console.error(`${result.name}: ${result.status}${result.error ? ': ' + result.error : ''}`)
    });
  });
}

module.exports = { craftingInputs, craftingCases, runCraftingChecks };
