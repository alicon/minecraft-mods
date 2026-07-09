# Testing

Use automated CLI checks first, then do a short manual pass for visuals, feel, and multiplayer behavior that cannot be proven cheaply from tests.

## Hardening Workflow

For engineering hardening, start with fast tests and only move outward when the behavior needs more Minecraft runtime.

1. Extract pure Java rules for decisions, ordering, cooldowns, clamps, permissions, and save/load adapters.
2. Cover those rules with JVM tests, using parameterized tests for boundary values and gameplay matrices.
3. Add focused GameTests for behavior that needs a registered entity, item interaction, world state, or tick loop.
4. Add local iteration commands only when they remove repeated manual steps.
5. Add logging or opt-in in-game diagnostics for rare state transitions and hard-to-see gameplay decisions.

When auditing a mod, record work as:

- Now: high-value fixes or tests that fit in the current slice.
- Next: follow-up tests, fixtures, or refactors that are clearly useful but not required now.
- Later: broader harnesses, playtest tools, or GameTests that need more setup.

Prefer the narrowest useful command while iterating, then run broader checks before release.

## Automated CLI Checks

Run all verification:

```shell
./gradlew check
./gradlew check -Ptarget_minecraft_version=1.21.1
```

This runs:

- root `validateModLayout`
- root `validateFormatting`
- root `validateJavaFileSizes`
- root `validateNoClientImportsInMain`
- root `validatePublicApiDocs`
- root `validateReleaseNotes`
- root `validateVersionedSourceLayout`
- per-mod Javadoc generation
- JVM unit tests for every mod subproject
- normal Gradle/Fabric check tasks

Run one mod's tests:

```shell
./gradlew :narwhal-together:test
./gradlew :mushroom-the-yorkie:test
./gradlew :cops-and-robbers:test
```

Run one mod against a supported Minecraft-version variant:

```shell
./gradlew :narwhal-together:check -Ptarget_minecraft_version=1.21.1
./gradlew :mushroom-the-yorkie:check -Ptarget_minecraft_version=1.21.1
```

Build all jars:

```shell
./gradlew build
```

Production jars are written to:

```text
build/mods/narwhal-together/<minecraft-version>/libs/narwhal-together-<version>.jar
build/mods/mushroom-the-yorkie/<minecraft-version>/libs/mushroom-the-yorkie-<version>.jar
build/mods/cops-and-robbers/<minecraft-version>/libs/cops-and-robbers-<version>.jar
```

Run Mushroom's headless Minecraft GameTests:

```shell
./gradlew :mushroom-the-yorkie:runGameTestServer
```

GameTests boot a scripted Minecraft server from the CLI. They are slower than unit tests, so keep them focused on behavior that needs a real world, entity registry, or server tick loop.

## Local Playtest Harness

The Mineflayer harness in `tools/playtest-harness/` can join a local dev server, dedicated test server, or single-player LAN world. Use it for player-like smoke checks, live bot companionship, and artifact capture that is faster than repeating manual setup by hand.

Install once:

```shell
make harness-install
```

Join a world and follow the human player:

```shell
make harness-companion HARNESS_PORT=<lan-or-server-port> HARNESS_TARGET=<your-player-name>
```

Run op-only smoke scenarios in a local test world:

```shell
make harness-mushroom-smoke HARNESS_PORT=<lan-or-server-port>
make harness-cops-smoke HARNESS_PORT=<lan-or-server-port>
```

The Make targets start a Prismarine viewer by default at `http://localhost:3007` and write JSON event logs/snapshots to `tools/playtest-harness/artifacts/`. Set `HARNESS_VIEWER=0` to disable the viewer.

For real Fabric modded worlds, install the local Playtest Bridge mod and use its loopback HTTP endpoints instead of Mineflayer:

```shell
make live-test-bridge
make bridge-health
make bridge-state
make bridge-smoke BRIDGE_MESSAGE="Codex bridge smoke passed."
make bridge-chat BRIDGE_MESSAGE="Codex can see the world."
make bridge-command BRIDGE_COMMAND="time set day"
make bridge-look BRIDGE_PLAYER=<your-player-name>
make bridge-give BRIDGE_ITEM=minecraft:apple BRIDGE_COUNT=1
make bridge-summon BRIDGE_ENTITY=cops_robbers:police_cruiser
make bridge-teleport BRIDGE_X=0 BRIDGE_Y=100 BRIDGE_Z=0
make bridge-use-entity BRIDGE_ENTITY=mushroom_yorkie:mushroom_yorkie BRIDGE_ITEM=mushroom_yorkie:yorkie_treat BRIDGE_RADIUS=12
make bridge-clear-entities BRIDGE_ENTITY=mushroom_yorkie:mushroom_yorkie
make bridge-set-block-near-entity BRIDGE_ENTITY=mushroom_yorkie:mushroom_yorkie BRIDGE_BLOCK=minecraft:oak_planks BRIDGE_DY=2
make bridge-set-block BRIDGE_X=0 BRIDGE_Y=100 BRIDGE_Z=0 BRIDGE_BLOCK=minecraft:air
make bridge-screenshot BRIDGE_SCREENSHOT_NAME=playtest.png
```

Restart Minecraft after installing `playtest-bridge`. The bridge binds to `127.0.0.1:57321` by default and is intended only for local development profiles.
Screenshots close the active client screen before capture by default; set `BRIDGE_SCREENSHOT_RESUME=0` to keep the current screen visible.

Launch Modrinth directly into an existing save:

```shell
make modrinth-launch-world PLAYTEST_WORLD="New World (21)"
```

Create a disposable save by copying a closed template world, then launch Modrinth directly into the copy:

```shell
make modrinth-playtest-world PLAYTEST_TEMPLATE_WORLD="Clean Template" PLAYTEST_WORLD_PREFIX="Codex Playtest"
```

Run the full local automation loop against a copied template world:

```shell
make modrinth-autoplay-smoke PLAYTEST_TEMPLATE_WORLD="Clean Template" BRIDGE_SCREENSHOT_NAME=playtest.png
```

Run Mushroom's richer live bridge scenario against a disposable world:

```shell
make modrinth-autoplay-yorkie PLAYTEST_TEMPLATE_WORLD="Clean Template" BRIDGE_SCREENSHOT_NAME=yorkie-smoke.png
```

The Yorkie scenario checks duplicate-claim blocking, treat taming, owner sit/follow commands, harness equip/removal, lead rejection without a harness, exact treat/toy/player-food need changes, sheltered nighttime sleep, double-click wake-up, exact shelter cleanup, dog food and water bowl use, same-day bowl refill rejection, outdoor potty relief, screenshot capture, and positive lead attach with the harness equipped.

This uses Modrinth's `modrinth://launch/instance/<instance-id>?singleplayer_world=<save-folder>` deep link and avoids clicking through the launcher UI. The template save must not be the currently open world.
The launcher script uses `open -g` by default so Modrinth is not deliberately activated during launch. Minecraft can still grab mouse/keyboard focus when the game window starts or enters relative-mouse mode; press Escape to release it, or set `MODRINTH_OPEN_BACKGROUND=0` if you want the client to come forward intentionally.
The launcher also sets `pauseOnLostFocus:false` by default so singleplayer test worlds keep ticking when Minecraft is not frontmost. Set `PLAYTEST_DISABLE_PAUSE_ON_LOST_FOCUS=0` to leave that profile option unchanged.
Set `PLAYTEST_SCREENSHOT_DELAY_SECONDS=0` to skip the default post-smoke screenshot delay.

## Current Automated Coverage

NARwhal Together:

- target cycling selects the first target when no previous target exists
- target cycling advances to the next target
- target cycling wraps back to the first target
- target cycling recovers when the previous target left the game
- empty target lists are rejected

Mushroom the Yorkie:

- live Modrinth bridge smoke covers duplicate-claim blocking, treat taming, sit/follow, harness on/off, lead gating, exact toy/player-food effects, sheltered sleep/wake, dog food/water bowl consumption, same-day bowl refill rejection, outdoor potty relief, cleanup, screenshot capture, and lead attach
- default pet needs
- save/load value clamping
- treat effects
- indoor need ticking
- hungry potty acceleration
- sitting energy behavior
- outside potty drain and mood boost
- indoor potty warning mood penalty
- wake-up spawn policy for respawn and extreme modes
- spawn-mode config parsing defaults
- structure scent lead-point, found-distance, wait-for-owner/return-to-owner policy, and nearby default range
- domestic care policy for one bowl meal per day and bowl-gated hunger prompts
- pet-needs effects for bowl meals, normal player food, water, toy play, food bar display, and starvation state
- lost-Mushroom recovery policy after a full Minecraft day away from the owner
- daily outdoor relief state and saved passive-mob calm memory
- headless GameTest verifies Mushroom's custom entity can spawn in a Minecraft test world

Cops and Robbers:

- cruiser flight lift input clamps to the server-authoritative control range
- non-finite cruiser lift input becomes neutral before it can affect motion
- cruiser reverse and strafe controls use reduced handling multipliers
- captured robber counts clamp to the cruiser capacity
- capture/release count transitions do not overflow or go negative

Root layout validation:

- root `src/` does not exist
- every mod has `src/main/java`
- every mod has `src/client/java`
- every mod has `src/main/resources/fabric.mod.json`
- Gradle `mod_id` matches `fabric.mod.json`
- mod IDs are unique
- declared icons exist
- declared entrypoint classes exist
- duplicate translation keys are rejected
- non-Minecraft item model textures must exist

Quality gates:

- source text cannot have CRLF line endings, trailing whitespace, or missing final newlines
- Java files warn over 300 lines and fail over 500 lines
- common/server source cannot import client-only classes
- public declarations need Javadocs unless they override Minecraft/Fabric APIs
- Javadocs must generate successfully

Good future GameTests:

- Mushroom spawn egg creates the custom entity
- Yorkie treat tames Mushroom
- owner can toggle sit/follow
- non-owner cannot command Mushroom
- NARwhal payload registration does not fail on startup
- Cops and Robbers spawn eggs create custom entities
- police station and bank kits place expected structures
- cruiser driver controls mutate only the currently controlled cruiser
- bank robbery/capture/recovery flow works in a real server world

## Manual Acceptance Checks

NARwhal Together:

- [ ] Minecraft 1.21.11 launches with Fabric API and NARwhal Together.
- [ ] The server or LAN host has the same NARwhal Together JAR as every client.
- [ ] With two players online, each player can teleport to the other.
- [ ] Teleporting works without operator permissions.
- [ ] Teleporting between the Overworld, Nether, and End works.
- [ ] Repeated uses cycle through three or more players alphabetically.
- [ ] Spectators are skipped.
- [ ] No errors attributed to `narwhal_together` appear in the latest log.

Mushroom the Yorkie:

- [ ] Minecraft 1.21.11 launches with Fabric API and Mushroom the Yorkie.
- [ ] The Mushroom spawn egg creates a small Yorkie entity.
- [ ] Repeated Mushroom spawn egg clicks do not create duplicate Mushrooms for the same player, including rapid creative clicks before interacting with the first one.
- [ ] Mushroom renders with pointy ears and no missing texture.
- [ ] Yorkie treats tame and feed Mushroom.
- [ ] Mutton + two bones crafts 8 Yorkie Treats.
- [ ] Creative inventory has a Mushroom the Yorkie tab.
- [ ] After a successful night in a bed, Mushroom appears near the bed already tamed.
- [ ] Empty-hand owner interaction toggles sit/follow.
- [ ] Empty-hand owner interaction shows Mushroom's food bar.
- [ ] Mushroom follows closely enough to feel like a tiny companion.
- [ ] If Mushroom enters a boat, creative flight does not trap him; owner empty-hand interaction pops him out.
- [ ] Yorkie Harness can be put on and removed by the owner without losing the item.
- [ ] A tamed, following Mushroom can catch a nearby surface structure scent, show kid-readable follow/lost/found messages, come back when the player loses him, lead close enough to stay visible, and celebrate at the destination.
- [ ] In creative mode, a tamed Mushroom does not start structure scenting, but still follows, sits, accepts treats, and uses creative flying support.
- [ ] Copper can craft a Dog Bowl; Dog Bowl plus Yorkie Treat creates a Dog Food Bowl; Dog Bowl plus Water Bucket creates a Dog Water Bowl.
- [ ] Mushroom eats one placed Dog Food Bowl per Minecraft day, drinks one placed Dog Water Bowl per Minecraft day, and each filled bowl becomes an empty Dog Bowl.
- [ ] Owner can feed Mushroom normal edible player food, and his food bar improves.
- [ ] Mushroom's food bar drains while following and drains much more slowly while sitting.
- [ ] Mushroom can starve only while the owner is nearby enough to care for him.
- [ ] A lost loaded Mushroom that has not been near the owner for a full Minecraft day returns to the player's bed after successful sleep when not already near the bed.
- [ ] Mushroom only whines for food when at least one dog bowl has been placed nearby and no filled food bowl is available.
- [ ] At night indoors, Mushroom walks to a nearby Dog Bed before curling up.
- [ ] At night, waking Mushroom and then ordering him to sit leaves him seated without floor-shuffling.
- [ ] During daytime, Mushroom can rarely do a short bum-shuffle while not ordered to sit.
- [ ] When Mushroom needs outside, he relieves himself once per Minecraft day after a few seconds under open sky.
- [ ] In a cave base with a closed door, Mushroom circles the door; with an open reachable path, he searches toward outside instead.
- [ ] With debug messages enabled, the baseline state wraps into readable chat lines and outdoor relief emits `potty_relieved`.
- [ ] Calming peaceful-mob barking with a treat makes nearby passive mobs stop triggering repeat barking.
- [ ] Right-clicking with a Yorkie Ball, Yorkie Chew Toy, or vanilla Bone throws it like a soft snowball; Mushroom fetches it and returns it near the owner.
- [ ] Mushroom starts chasing a thrown toy quickly, without a multi-second pause.
- [ ] Dropped Yorkie Balls, Yorkie Chew Toys, and vanilla Bones are all fetch targets, even when dropped close to the owner.
- [ ] Mushroom picks up one toy per fetch and does not immediately re-fetch the same toy he just returned.
- [ ] Survival fetch returns one toy to the owner's inventory; creative fetch completes without spawning extra duplicate toys.
- [ ] Mushroom fetches toys floating in open water, but ignores toys that are submerged or trapped in water under a low platform with no air block.
- [ ] In survival, Mushroom barks and gives up instead of jumping off a high ledge for a toy; in creative, he can still use flight support to fetch it.
- [ ] If Mushroom reaches an edge or ledge and cannot path to the toy, he barks briefly and gives up instead of staring indefinitely.
- [ ] Using the Yorkie Ball or Yorkie Chew Toy on Mushroom plays a happy toy interaction without consuming the toy.
- [ ] No errors attributed to `mushroom_yorkie` appear in the latest log.

Cops and Robbers:

- [ ] Minecraft 1.21.11 launches with Fabric API and Cops and Robbers.
- [ ] Creative inventory has Cops and Robbers items and spawn eggs.
- [ ] Police cruiser can be driven and responds to lights and siren controls.
- [ ] Creative-only cruiser flight and tricks are unavailable to non-creative players.
- [ ] Bank and police station kits place their expected structures.
- [ ] Robber capture, jail release, and gold recovery messages are understandable.
- [ ] Fire truck and fire response behavior do not spam logs or chat.
- [ ] No errors attributed to `cops_robbers` appear in the latest log.
