'use strict';

function parseCommand(botName, message) {
  const escapedName = botName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const direct = new RegExp(`^(?:${escapedName}|codex|bot)[:,]?\\s+(.+)$`, 'i').exec(message.trim());
  if (!direct) {
    return null;
  }
  return direct[1].trim().toLowerCase();
}

module.exports = {
  description: 'Join the world, follow a target player, and respond to simple chat commands.',
  keepAlive: true,

  async run(harness) {
    await harness.chat('CodexBot online. Say "CodexBot help" for commands.');

    if (harness.options.target) {
      try {
        const followed = harness.followPlayer(harness.options.target, 3);
        await harness.chat(`Following ${followed}.`);
      } catch (error) {
        await harness.chat(`I cannot see ${harness.options.target} yet.`);
        harness.log('followFailed', { message: error.message });
      }
    }

    harness.bot.on('chat', async (username, message) => {
      if (username === harness.bot.username) {
        return;
      }

      const command = parseCommand(harness.bot.username, message);
      if (!command) {
        return;
      }

      try {
        if (command === 'help') {
          await harness.chat('Commands: come, follow, stop, state, look, help.');
        } else if (command === 'come' || command === 'follow') {
          const followed = harness.followPlayer(username, 3);
          await harness.chat(`Following ${followed}.`);
        } else if (command === 'stop' || command === 'stay') {
          harness.stopMoving();
          await harness.chat('Stopping here.');
        } else if (command === 'state' || command === 'where') {
          const position = harness.positionSummary();
          await harness.snapshot('companion_state');
          await harness.chat(`I am at ${position.x}, ${position.y}, ${position.z}.`);
        } else if (command === 'look') {
          const lookedAt = harness.lookAtPlayer(username);
          await harness.chat(`Looking at ${lookedAt}.`);
        } else {
          await harness.chat('Unknown command. Say "CodexBot help".');
        }
      } catch (error) {
        harness.log('chatCommandError', { username, command, message: error.message });
        await harness.chat(`I hit a harness error: ${error.message}`);
      }
    });

    await harness.waitForEnd();
  }
};
