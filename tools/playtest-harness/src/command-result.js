'use strict';

// HTTP success means the bridge handled the request, not that Minecraft parsed it.
function checkCommandParsed(result) {
  if (result && result.callbackSeen === false) {
    const feedback = Array.isArray(result.feedback) ? result.feedback.join('\n') : '';
    throw new Error(`Minecraft rejected command syntax: ${result.command}${feedback ? `\n${feedback}` : ''}`);
  }
}

module.exports = { checkCommandParsed };
