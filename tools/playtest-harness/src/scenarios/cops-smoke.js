'use strict';

module.exports = {
  description: 'Local op-only smoke test for Cops and Robbers entities and kit items.',
  keepAlive: false,

  async run(harness) {
    await harness.command('gamemode creative');
    await harness.command('difficulty peaceful');
    await harness.command('time set day');
    await harness.command(`give ${harness.bot.username} cops_robbers:police_cruiser_spawn_egg 1`);
    await harness.command(`give ${harness.bot.username} cops_robbers:bank_kit 1`);
    await harness.command(`give ${harness.bot.username} cops_robbers:police_station_kit 1`);
    await harness.command('summon cops_robbers:police_cruiser ~2 ~ ~2');
    await harness.command('summon cops_robbers:cop ~4 ~ ~2');
    await harness.command('summon cops_robbers:bank_robber ~6 ~ ~2');
    await harness.wait(2500);
    await harness.assertCommandEntity('cops_robbers:police_cruiser', 'police_cruiser_present');
    await harness.assertCommandEntity('cops_robbers:cop', 'cop_present');
    await harness.assertCommandEntity('cops_robbers:bank_robber', 'bank_robber_present');
    await harness.snapshot('cops_smoke');
    await harness.chat('Cops and Robbers smoke scenario complete.');
  }
};
