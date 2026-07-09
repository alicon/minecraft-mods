'use strict';

const fs = require('fs');
const path = require('path');
const mineflayer = require('mineflayer');

function booleanOption(value) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (value === undefined || value === null) {
    return false;
  }
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function describeValue(value) {
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch (error) {
    return String(value);
  }
}

class PlaytestHarness {
  constructor(options) {
    this.options = options;
    this.bot = null;
    this.viewerStarted = false;
    this.pathfinderLoaded = false;
    this.messageWaiters = [];
    this.artifactRoot = path.resolve(options.artifactsDir, timestamp());
    fs.mkdirSync(this.artifactRoot, { recursive: true });
    this.eventLog = path.join(this.artifactRoot, 'events.jsonl');
  }

  async connect() {
    const botOptions = {
      host: this.options.host,
      port: this.options.port,
      username: this.options.username,
      auth: this.options.auth,
      version: this.options.version || false,
      hideErrors: false
    };
    if (this.options.profilesFolder) {
      botOptions.profilesFolder = this.options.profilesFolder;
    }

    this.bot = mineflayer.createBot(botOptions);
    this.installEventLogging();
    console.log(`Connecting ${botOptions.username} to ${botOptions.host}:${botOptions.port} (${botOptions.auth})`);

    await this.withTimeout(new Promise((resolve, reject) => {
      this.bot.once('spawn', resolve);
      this.bot.once('kicked', (reason) => reject(new Error(`Kicked while connecting: ${describeValue(reason)}`)));
      this.bot.once('error', reject);
    }), this.options.connectTimeoutMs, 'Timed out waiting for bot spawn');

    console.log(`Connected. Artifacts: ${this.artifactRoot}`);
  }

  installEventLogging() {
    this.bot.on('login', () => this.log('login', { username: this.bot.username }));
    this.bot.on('spawn', () => this.log('spawn', this.positionSummary()));
    this.bot.on('death', () => this.log('death', this.positionSummary()));
    this.bot.on('health', () => this.log('health', { health: this.bot.health, food: this.bot.food }));
    this.bot.on('kicked', (reason) => this.log('kicked', { reason: describeValue(reason) }));
    this.bot.on('end', (reason) => this.log('end', { reason: String(reason || '') }));
    this.bot.on('error', (error) => this.log('error', { message: error.message, stack: error.stack }));
    this.bot.on('messagestr', (message) => {
      this.log('message', { message });
      this.messageWaiters = this.messageWaiters.filter((waiter) => {
        if (!waiter.pattern.test(message)) {
          return true;
        }
        waiter.resolve(message);
        return false;
      });
    });
  }

  log(event, data = {}) {
    const entry = {
      time: new Date().toISOString(),
      event,
      data
    };
    fs.appendFileSync(this.eventLog, `${JSON.stringify(entry)}\n`);
  }

  startViewer() {
    if (this.viewerStarted) {
      return;
    }
    const { mineflayer: mineflayerViewer } = require('prismarine-viewer');
    mineflayerViewer(this.bot, {
      port: this.options.viewerPort,
      firstPerson: this.options.firstPerson
    });
    this.viewerStarted = true;
    console.log(`Viewer: http://localhost:${this.options.viewerPort}`);
  }

  async command(command) {
    const normalized = command.startsWith('/') ? command.slice(1) : command;
    this.log('command', { command: normalized });
    this.bot.chat(`/${normalized}`);
    await sleep(this.options.commandDelayMs);
  }

  async chat(message) {
    this.log('chat', { message });
    this.bot.chat(message);
    await sleep(this.options.commandDelayMs);
  }

  async wait(ms) {
    await sleep(ms);
  }

  async waitForMessage(pattern, timeoutMs = 10000) {
    const compiled = pattern instanceof RegExp ? pattern : new RegExp(pattern);
    return this.withTimeout(new Promise((resolve) => {
      this.messageWaiters.push({ pattern: compiled, resolve });
    }), timeoutMs, `Timed out waiting for chat message: ${compiled}`);
  }

  async assertCommandEntity(entityId, label, radius = 16) {
    const marker = `HARNESS_ASSERT ${label}`;
    const markerSeen = this.waitForMessage(new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 10000);
    await this.command(
      `execute positioned as ${this.bot.username} if entity @e[type=${entityId},distance=..${radius},limit=1] run tellraw ${this.bot.username} {"text":"${marker}"}`
    );
    await markerSeen;
    this.log('assertion', { label, entityId, radius, passed: true });
  }

  async snapshot(label) {
    const state = {
      label,
      time: new Date().toISOString(),
      bot: {
        username: this.bot.username,
        health: this.bot.health,
        food: this.bot.food,
        gameMode: this.bot.game ? this.bot.game.gameMode : null,
        dimension: this.bot.game ? this.bot.game.dimension : null,
        position: this.positionSummary()
      },
      inventory: this.bot.inventory.items().map((item) => ({
        name: item.name,
        displayName: item.displayName,
        count: item.count,
        slot: item.slot
      })),
      players: Object.values(this.bot.players).map((player) => ({
        username: player.username,
        ping: player.ping,
        entityId: player.entity ? player.entity.id : null
      })),
      nearbyEntities: this.nearbyEntities(24)
    };

    const file = path.join(this.artifactRoot, `${label.replace(/[^a-z0-9_-]/gi, '_')}.json`);
    fs.writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`);
    this.log('snapshot', { label, file });
    return state;
  }

  nearbyEntities(maxDistance) {
    const origin = this.bot.entity.position;
    return Object.values(this.bot.entities)
      .filter((entity) => entity !== this.bot.entity)
      .map((entity) => ({
        id: entity.id,
        type: entity.type,
        name: entity.name,
        username: entity.username,
        displayName: entity.displayName,
        kind: entity.kind,
        distance: Number(origin.distanceTo(entity.position).toFixed(2)),
        position: {
          x: Number(entity.position.x.toFixed(2)),
          y: Number(entity.position.y.toFixed(2)),
          z: Number(entity.position.z.toFixed(2))
        }
      }))
      .filter((entity) => entity.distance <= maxDistance)
      .sort((left, right) => left.distance - right.distance);
  }

  positionSummary() {
    if (!this.bot || !this.bot.entity) {
      return null;
    }
    const position = this.bot.entity.position;
    return {
      x: Number(position.x.toFixed(2)),
      y: Number(position.y.toFixed(2)),
      z: Number(position.z.toFixed(2)),
      yaw: Number(this.bot.entity.yaw.toFixed(3)),
      pitch: Number(this.bot.entity.pitch.toFixed(3))
    };
  }

  loadPathfinder() {
    if (this.pathfinderLoaded) {
      return;
    }
    const { pathfinder, Movements } = require('mineflayer-pathfinder');
    const minecraftData = require('minecraft-data')(this.bot.version);
    this.bot.loadPlugin(pathfinder);
    this.bot.pathfinder.setMovements(new Movements(this.bot, minecraftData));
    this.pathfinderLoaded = true;
  }

  followPlayer(username, distance = 3) {
    this.loadPathfinder();
    const { goals } = require('mineflayer-pathfinder');
    const targetName = username || this.options.target;
    const player = this.findPlayer(targetName);
    if (!player || !player.entity) {
      throw new Error(`Cannot follow player; not visible: ${targetName || '(nearest player)'}`);
    }
    this.bot.pathfinder.setGoal(new goals.GoalFollow(player.entity, distance), true);
    this.log('follow', { username: player.username, distance });
    return player.username;
  }

  stopMoving() {
    if (this.pathfinderLoaded) {
      this.bot.pathfinder.setGoal(null);
    }
    this.bot.clearControlStates();
    this.log('stopMoving');
  }

  lookAtPlayer(username) {
    const player = this.findPlayer(username);
    if (!player || !player.entity) {
      throw new Error(`Cannot look at player; not visible: ${username || '(nearest player)'}`);
    }
    const target = player.entity.position.offset(0, player.entity.height || 1.6, 0);
    this.bot.lookAt(target, true);
    this.log('lookAtPlayer', { username: player.username });
    return player.username;
  }

  findPlayer(username) {
    if (username && this.bot.players[username]) {
      return this.bot.players[username];
    }

    return Object.values(this.bot.players)
      .filter((player) => player.username !== this.bot.username && player.entity)
      .sort((left, right) => {
        const origin = this.bot.entity.position;
        return origin.distanceTo(left.entity.position) - origin.distanceTo(right.entity.position);
      })[0];
  }

  async waitForEnd() {
    await new Promise((resolve) => {
      this.bot.once('end', resolve);
    });
  }

  async end(reason) {
    if (!this.bot) {
      return;
    }
    this.log('shutdown', { reason });
    this.bot.end(reason);
    await sleep(250);
  }

  async withTimeout(promise, timeoutMs, message) {
    let timer = null;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    });

    try {
      return await Promise.race([promise, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }
}

module.exports = {
  PlaytestHarness,
  booleanOption
};
