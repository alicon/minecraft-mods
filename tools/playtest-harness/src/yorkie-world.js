'use strict';

function check(value, message) { if (!value) throw new Error(message); }

function assertTestWorld(state, expectedSave) {
  check(expectedSave && state.saveName === expectedSave, 'Exact --expected-save is required and must match the loaded save');
  check(/^(Mushroom Abel Noelle |Codex |Mushroom Matrix )/.test(expectedSave), 'Refusing a save without a disposable-test prefix');
  check(state.singleplayer && state.players.length === 1, 'Matrix requires a single-player local test world');
}

module.exports = { assertTestWorld };
