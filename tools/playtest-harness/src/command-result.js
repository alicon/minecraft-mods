'use strict';

// HTTP success means the bridge handled the request, not that Minecraft parsed it.
function checkCommandParsed(result) {
  if (result && result.callbackSeen === false) {
    throw new Error(`Minecraft rejected command syntax: ${result.command}`);
  }
}

module.exports = { checkCommandParsed };
