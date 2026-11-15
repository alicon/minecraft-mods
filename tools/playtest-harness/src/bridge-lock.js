'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');

// Separate processes must not mutate one test world concurrently.
async function withBridgeLock(baseUrl, run, directory = os.tmpdir()) {
  const key = createHash('sha256').update(baseUrl.replace('localhost', '127.0.0.1')).digest('hex').slice(0, 16);
  const file = path.join(directory, `minecraft-bridge-${key}.lock`);
  let fd;
  for (let attempt = 0; attempt < 2; attempt++) {
    try { fd = fs.openSync(file, 'wx'); break; }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const pid = Number(fs.readFileSync(file, 'utf8'));
      if (pid > 0) {
        try { process.kill(pid, 0); }
        catch (probe) {
          if (probe.code === 'ESRCH') { fs.unlinkSync(file); continue; }
        }
      }
      throw new Error(`Another scenario owns ${baseUrl}; lock ${file}. Stop it before starting another matrix.`);
    }
  }
  if (fd === undefined) throw new Error(`Could not acquire ${file}`);
  fs.writeFileSync(fd, String(process.pid));
  fs.closeSync(fd);
  try { return await run(); }
  finally { fs.unlinkSync(file); }
}

module.exports = { withBridgeLock };
