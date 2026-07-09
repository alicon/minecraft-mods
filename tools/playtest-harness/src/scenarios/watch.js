'use strict';

module.exports = {
  description: 'Join the world, record snapshots, and keep the viewer/log stream open.',
  keepAlive: true,

  async run(harness) {
    await harness.chat('Watch mode online.');
    await harness.snapshot('watch_start');
    await harness.waitForEnd();
  }
};
