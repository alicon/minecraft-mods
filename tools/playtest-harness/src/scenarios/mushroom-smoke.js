'use strict';

module.exports = {
  description: 'Local op-only smoke test for Mushroom entity and starter items.',
  keepAlive: false,

  async run(harness) {
    await harness.command('gamemode creative');
    await harness.command('difficulty peaceful');
    await harness.command('time set day');
    await harness.command(`give ${harness.bot.username} mushroom_yorkie:mushroom_yorkie_spawn_egg 1`);
    await harness.command(`give ${harness.bot.username} mushroom_yorkie:yorkie_treat 8`);
    await harness.command(`give ${harness.bot.username} mushroom_yorkie:yorkie_ball 1`);
    await harness.command('summon mushroom_yorkie:mushroom_yorkie ~2 ~ ~2');
    await harness.wait(2500);
    await harness.assertCommandEntity('mushroom_yorkie:mushroom_yorkie', 'mushroom_present');
    await harness.snapshot('mushroom_smoke');
    await harness.chat('Mushroom smoke scenario complete.');
  }
};
