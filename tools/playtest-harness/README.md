# Minecraft Playtest Harness

Mineflayer-based harness for local playtesting this mods workspace. The first pass focuses on a bot that can join your local/LAN world, follow a player, open a browser viewer, and run command-backed smoke scenarios for mod entities.

## Install

```shell
make harness-install
```

## Start Minecraft

Use a local dev server, a dedicated local server, or a single-player world opened to LAN.

For command-backed smoke scenarios, the bot needs operator permissions and cheats enabled. For companion/watch mode, normal player permissions are enough.

If you open a single-player world to LAN, Minecraft prints the temporary port in chat. Pass that as `HARNESS_PORT`.

Fabric modded LAN worlds can reject Mineflayer with a message that the server requires Fabric Loader and Fabric API on the client. That is expected when the server needs Fabric registry sync for custom mod content: Mineflayer is a protocol bot, not a Fabric client. Use this harness against protocol-compatible local worlds, or use it as the command/scenario layer behind a future Fabric client bridge.

## Fabric Bridge

For real modded worlds, install the `playtest-bridge` jar in the same profile as the other local test mods:

```shell
make live-test-bridge
```

Restart Minecraft after installing it. When a single-player or LAN server starts, the bridge listens on loopback port `57321`.

```shell
make bridge-health
make bridge-state
make bridge-smoke BRIDGE_MESSAGE="Codex bridge smoke passed."
make bridge-chat BRIDGE_MESSAGE="Codex can see the world."
make bridge-command BRIDGE_COMMAND="time set day"
make bridge-look BRIDGE_PLAYER=YourMinecraftName
make bridge-give BRIDGE_ITEM=minecraft:apple BRIDGE_COUNT=1
make bridge-summon BRIDGE_ENTITY=cops_robbers:police_cruiser
make bridge-teleport BRIDGE_X=0 BRIDGE_Y=100 BRIDGE_Z=0
make bridge-use-entity BRIDGE_ENTITY=mushroom_yorkie:mushroom_yorkie BRIDGE_ITEM=mushroom_yorkie:yorkie_treat BRIDGE_RADIUS=12
make bridge-clear-entities BRIDGE_ENTITY=mushroom_yorkie:mushroom_yorkie
make bridge-set-block-near-entity BRIDGE_ENTITY=mushroom_yorkie:mushroom_yorkie BRIDGE_BLOCK=minecraft:oak_planks BRIDGE_DY=2
make bridge-set-block BRIDGE_X=0 BRIDGE_Y=100 BRIDGE_Z=0 BRIDGE_BLOCK=minecraft:air
make bridge-use-block BRIDGE_X=0 BRIDGE_Y=99 BRIDGE_Z=0 BRIDGE_ITEM=cops_robbers:bank_kit
make bridge-count-blocks BRIDGE_X1=-8 BRIDGE_Y1=100 BRIDGE_Z1=-8 BRIDGE_X2=8 BRIDGE_Y2=106 BRIDGE_Z2=8
make bridge-screenshot BRIDGE_SCREENSHOT_NAME=playtest.png
make bridge-yorkie-smoke BRIDGE_SCREENSHOT_NAME=yorkie-smoke.png
make bridge-cops-smoke BRIDGE_SCREENSHOT_NAME=cops-smoke.png
make bridge-cops-structures-smoke BRIDGE_SCREENSHOT_NAME=cops-structures.png
make bridge-cops-visual-sweep BRIDGE_SCREENSHOT_NAME=cops-visual
```

The bridge is intentionally bound to `127.0.0.1` and should only be installed in local development profiles.
Screenshots close the active client screen before capture by default. Set `BRIDGE_SCREENSHOT_RESUME=0` to keep the current screen visible. Set `BRIDGE_SCREENSHOT_HIDE_GUI=1` and `BRIDGE_SCREENSHOT_CLEAR_CHAT=1` for clean visual inspection captures.
Set `BRIDGE_REPORT_FILE=build/playtest-reports/<name>.json` on any bridge scenario target to persist the full JSON result, including every step payload and screenshot path, outside the terminal output.
The `set-block` and `set-block-near-entity` bridge actions accept namespaced block IDs or full block-state strings such as `minecraft:cherry_leaves[persistent=true]`.

You can launch Modrinth directly into a save without using the launcher UI:

```shell
make modrinth-launch-world PLAYTEST_WORLD="New World (21)"
```

For repeatable disposable worlds, keep a closed template save and copy it before launch:

```shell
make modrinth-playtest-world PLAYTEST_TEMPLATE_WORLD="Clean Template" PLAYTEST_WORLD_PREFIX="Codex Playtest"
```

Run the full local loop by copying a template save, launching it, waiting for the bridge, smoke testing, and saving a screenshot:

```shell
make modrinth-autoplay-smoke PLAYTEST_TEMPLATE_WORLD="Clean Template" BRIDGE_SCREENSHOT_NAME=playtest.png
```

Run Mushroom's richer bridge scenario:

```shell
make modrinth-autoplay-yorkie PLAYTEST_TEMPLATE_WORLD="Clean Template" BRIDGE_SCREENSHOT_NAME=yorkie-smoke.png
make modrinth-autoplay-yorkie-visual PLAYTEST_TEMPLATE_WORLD="Clean Template" BRIDGE_SCREENSHOT_NAME=yorkie-gallery
make modrinth-autoplay-yorkie-biome-scout PLAYTEST_WORLD="New World (21)" BRIDGE_SCREENSHOT_NAME=yorkie-biome-scout
make modrinth-autoplay-yorkie-natural-gallery PLAYTEST_TEMPLATE_WORLD="New World (21)" PLAYTEST_WORLD_PREFIX="Codex Yorkie Natural" BRIDGE_SCREENSHOT_NAME=yorkie-natural-gallery
```

It covers duplicate-claim blocking, treat taming, owner commands, harness/lead behavior, exact food and toy effects, sheltered nighttime sleep/wake, dog food and water bowl use, same-day bowl refill rejection, outdoor potty relief, exact shelter cleanup, screenshot capture, and positive leash attach.
The visual sweep captures clean gallery scenes for sitting, a fence-tied leash walk, sleep, water, fetch, flying, food and water bowls, wants-outside messaging, sheep chasing, and hostile spider defense.
The biome scout samples real worldgen coordinates in an existing save, records seed/coordinates/biomes, and captures candidate staging screenshots for natural outdoor gallery refreshes.
The natural gallery scenario copies a scouted save, then stages Mushroom at saved real-biome coordinates for outdoor sitting, leashed, water, fetch, flying, bowl, chase, and hostile-defense screenshots.

Run Cops and Robbers' richer bridge scenario:

```shell
make modrinth-autoplay-cops PLAYTEST_TEMPLATE_WORLD="Clean Template" BRIDGE_SCREENSHOT_NAME=cops-smoke.png
make modrinth-autoplay-cops-structures PLAYTEST_TEMPLATE_WORLD="Clean Template" BRIDGE_SCREENSHOT_NAME=cops-structures.png
make modrinth-autoplay-cops-visual PLAYTEST_TEMPLATE_WORLD="Clean Template" BRIDGE_SCREENSHOT_NAME=cops-visual
```

The fast Cops scenario covers item registration, the cruiser/fire truck/cop/fireman/teller entity registrations, cruiser mounting, mounted cruiser robber capture, jail dropoff conversion into a jailed robber, bridge state assertions, and screenshot capture.
The structures scenario uses real item-on-block placement for the police station, fire station, and bank kits, counts signature generated blocks, verifies teller/fire crew spawning, verifies robber vault theft, verifies firefighter extinguishing, verifies mounted fire truck water-cannon extinguishing, and captures a screenshot.
The visual sweep builds a clean high-altitude stage and captures HUD-free lineup, mob skin closeup, vehicle closeup, police station front, fire station front, bank front, and overview screenshots with the real kits.

The launcher uses `open -g` by default to avoid intentionally activating Modrinth, but Minecraft can still grab mouse/keyboard focus when the client window starts. Press Escape to release it, or set `MODRINTH_OPEN_BACKGROUND=0` when you want the game to come forward.
It also sets `pauseOnLostFocus:false` by default so singleplayer test worlds keep ticking in the background. Set `PLAYTEST_DISABLE_PAUSE_ON_LOST_FOCUS=0` to leave that profile option unchanged.
If Modrinth was not already running, the launcher re-opens the deep link after a short cold-start delay. Set `MODRINTH_STARTUP_RETRY_SECONDS=0` to disable that retry.
Set `PLAYTEST_SCREENSHOT_DELAY_SECONDS=0` to skip the default post-smoke screenshot delay.

## Companion Mode

```shell
make harness-companion HARNESS_PORT=25565 HARNESS_TARGET=YourMinecraftName
```

Useful chat commands in-game:

- `CodexBot come`
- `CodexBot follow`
- `CodexBot stop`
- `CodexBot state`
- `CodexBot look`
- `CodexBot help`

The harness writes JSON snapshots and event logs under `tools/playtest-harness/artifacts/`.

## Viewer

The Make targets start the viewer by default. Open:

```text
http://localhost:3007
```

Set `HARNESS_VIEWER=0` to disable it, or `HARNESS_VIEWER_PORT=3010` to change the port.

## Smoke Scenarios

Mushroom the Yorkie:

```shell
make harness-mushroom-smoke HARNESS_PORT=25565
```

Cops and Robbers:

```shell
make harness-cops-smoke HARNESS_PORT=25565
```

These scenarios use `/summon`, `/give`, and `/tellraw` assertions, so run them only in a local test world where the bot is opped.

## Auth

Offline local server:

```shell
HARNESS_AUTH=offline HARNESS_USERNAME=CodexBot
```

Microsoft-authenticated server:

```shell
HARNESS_AUTH=microsoft HARNESS_USERNAME=you@example.com
```

Mineflayer caches Microsoft auth tokens locally after the first login.
