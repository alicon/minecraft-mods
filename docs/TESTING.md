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
```

This runs:

- root `validateModLayout`
- root `validateFormatting`
- root `validateJavaFileSizes`
- root `validateNoClientImportsInMain`
- root `validatePublicApiDocs`
- per-mod Javadoc generation
- JVM unit tests for every mod subproject
- normal Gradle/Fabric check tasks

Run one mod's tests:

```shell
./gradlew :narwhal-together:test
./gradlew :mushroom-the-yorkie:test
./gradlew :cops-and-robbers:test
```

Run a supported NARwhal Minecraft-version variant:

```shell
./gradlew :narwhal-together:check -Ptarget_minecraft_version=1.21.1
```

Build all jars:

```shell
./gradlew build
```

Production jars are written to:

```text
build/mods/narwhal-together/<minecraft-version>/libs/narwhal-together-<version>.jar
build/mods/mushroom-the-yorkie/<minecraft-version>/libs/mushroom-the-yorkie-<version>.jar
```

Run Mushroom's headless Minecraft GameTests:

```shell
./gradlew :mushroom-the-yorkie:runGameTestServer
```

GameTests boot a scripted Minecraft server from the CLI. They are slower than unit tests, so keep them focused on behavior that needs a real world, entity registry, or server tick loop.

## Current Automated Coverage

NARwhal Together:

- target cycling selects the first target when no previous target exists
- target cycling advances to the next target
- target cycling wraps back to the first target
- target cycling recovers when the previous target left the game
- empty target lists are rejected

Mushroom the Yorkie:

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
- structure scent lead-point, found-distance, and wait-for-owner policy
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
- [ ] Mushroom renders with pointy ears and no missing texture.
- [ ] Yorkie treats tame and feed Mushroom.
- [ ] Mutton + two bones crafts 8 Yorkie Treats.
- [ ] Creative inventory has a Mushroom the Yorkie tab.
- [ ] After a successful night in a bed, Mushroom appears near the bed already tamed.
- [ ] Empty-hand owner interaction toggles sit/follow.
- [ ] Mushroom follows closely enough to feel like a tiny companion.
- [ ] A tamed, following Mushroom can catch a structure scent, show kid-readable follow/lost/found messages, lead ahead, and celebrate at the destination.
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
