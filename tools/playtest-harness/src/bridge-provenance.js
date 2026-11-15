'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');

// A source revision describes committed code only; dirty runs remain explicitly distinguishable.
function provenance(savePath) {
  const result = {};
  const repo = path.resolve(__dirname, '../../..');
  try {
    result.sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
    result.sourceDirty = execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' }).trim().length > 0;
  } catch { result.sourceUnavailable = true; }
  try {
    const mods = path.resolve(savePath, '../..', 'mods');
    result.installedJarHashes = {};
    for (const prefix of ['mushroom-the-yorkie-', 'playtest-bridge-']) {
      const matches = fs.readdirSync(mods).filter((name) => name.startsWith(prefix) && name.endsWith('.jar'));
      if (matches.length !== 1) throw Error(`Expected one ${prefix} jar, observed ${matches.length}`);
      const file = matches[0];
      result.installedJarHashes[file] = createHash('sha256').update(fs.readFileSync(path.join(mods, file))).digest('hex');
    }
  } catch (error) { result.installedJarsUnavailable = error.message; }
  return result;
}

module.exports = { provenance };
