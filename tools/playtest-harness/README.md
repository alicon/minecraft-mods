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

World `seed` fields in bridge state and terrain scans are signed decimal strings.
Keep them as strings when saving reports or recreating worlds: JavaScript numbers
cannot preserve the full Minecraft 64-bit seed range.

The bridge scenarios target Minecraft 1.21.11. Use its namespaced gamerules
(`minecraft:advance_time`, `minecraft:spawn_mobs`, `minecraft:mob_drops`), not
the older camelCase names. The CLI rejects command parse failures even when
the bridge's HTTP response succeeds. A valid command that changes zero blocks
is distinct from rejected syntax.

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
make bridge-yorkie-home-squirrel BRIDGE_SCREENSHOT_NAME=yorkie-home-squirrel
make bridge-cops-smoke BRIDGE_SCREENSHOT_NAME=cops-smoke.png
make bridge-cops-structures-smoke BRIDGE_SCREENSHOT_NAME=cops-structures.png
make bridge-cops-visual-sweep BRIDGE_SCREENSHOT_NAME=cops-visual
```

For a normal saved client shutdown before installing rebuilt jars:

```shell
make bridge-quit PLAYTEST_WORLD="Mushroom Abel Noelle 20261115-075437"
```

The quit endpoint requires the exact loaded disposable save name, a single-player
world, and exactly one connected player. It uses Minecraft's client stop path;
the integrated server does not implement `/stop`. The reply means the request was
accepted, **not that the save is complete**. Before installing jars or relaunching,
verify the game process has exited and that new log lines after the request contain
`All dimensions are saved`. If that confirmation is missing, inspect the shutdown
rather than treating a vanished bridge as proof of a successful save.

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
make modrinth-autoplay-yorkie-home-squirrel PLAYTEST_TEMPLATE_WORLD="Clean Template" BRIDGE_SCREENSHOT_NAME=yorkie-home-squirrel
make modrinth-autoplay-yorkie-visual PLAYTEST_TEMPLATE_WORLD="Clean Template" BRIDGE_SCREENSHOT_NAME=yorkie-gallery
make modrinth-autoplay-yorkie-biome-scout PLAYTEST_WORLD="New World (21)" BRIDGE_SCREENSHOT_NAME=yorkie-biome-scout
make modrinth-autoplay-yorkie-natural-gallery PLAYTEST_TEMPLATE_WORLD="New World (21)" PLAYTEST_WORLD_PREFIX="Codex Yorkie Natural" BRIDGE_SCREENSHOT_NAME=yorkie-natural-gallery
```

It covers duplicate-claim blocking, treat taming, owner commands, harness/lead behavior, exact food and toy effects, sheltered nighttime sleep/wake, dog food and water bowl use, same-day bowl refill rejection, outdoor potty relief, exact shelter cleanup, screenshot capture, and positive leash attach.
The focused home-and-squirrel scenario proves visible doghouse sleep, squirrel tree seeking, Mushroom's chase and 30-second return, and the early return when a tree-less squirrel crosses the 24-block player limit. It also saves clean doghouse and squirrel-chase screenshots.
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

## Mushroom state matrix

Run the matrix only in a disposable copy, with exactly one player connected:

```shell
make bridge-yorkie-matrix PLAYTEST_WORLD="Mushroom Abel Noelle 20261115-075437" BRIDGE_REPORT_FILE=build/playtest-reports/yorkie-matrix.json
```

It requires an exact save-name match and a disposable prefix (`Codex `,
`Mushroom Matrix `, or `Mushroom Abel Noelle `). It replaces loaded Yorkies,
builds a high-altitude arena, changes player mode/time/gamerules, and resumes
the client. Never point it at a family save. Keep only one live scenario run
active per bridge. It leaves the test arena and report available for inspection;
it restores daylight and a grounded creative player, not the original save state.

The 144 base cases combine four times (day, dusk, night, dawn), three shelter types
(open sky, roof only, enclosed room), fed/hungry needs, sit/follow orders,
and three owner states (survival walking, creative walking, creative flying). Each fresh-pet fixture checks sleep, orders,
gravity, health, need bounds, and the transition back to daylight and landing.
Each fixture verifies the owner mode and flight flags. The suite does not claim
every state transition. Thirteen additional sequences interrupt carried fetches with sit/sleep (bone, ball,
chew toy) exercise sleep-to-flight-to-sleep transitions at two hunger levels, and verify
that a starving pet eats an available nighttime meal and settles back to sleep.
Three fetch cases switch from survival pickup to grounded creative delivery and
back, checking exact toy conservation for the ball, bone, and chew toy. The
squirrel case checks that a squirrel uses a clear climbing face when a low
branch blocks the nearest face (`--case squirrel-clear-tree-face`).
Replay them by name with `--case fetch-sit-yorkie_ball` or
`--case sleep-flight-sleep-90`, or `--case starving-night-food-bowl`, or `--case fetch-owner-mode-yorkie_ball`.

The terrain group adds 36 cases: dry ground, open water, covered water, and a
six-block drop for each toy and owner locomotion state. It requires ordinary
returns in accessible terrain and safe refusal under covered water or a survival
cliff. A grounded creative cliff attempt may return or safely give up; it must
conserve the toy, avoid damage, and end near the owner. Flying fetches must return.
Six landing transitions reuse the ledge fixture for every toy: land during the chase or after pickup, then verify safe delivery, no damage, one play reward, and normal grounded following. The outdoor-care group adds 20 cases, and the water/rest group adds 18, making the full suite 237 cases. Run one group with `--group base`,
`--group transitions`, `--group terrain`, `--group outdoors`, or `--group water`; combine it with an exact `--case`.
Unknown groups/cases fail instead of running a different suite.

```shell
node tools/playtest-harness/src/bridge-cli.js yorkie-matrix --expected-save "<copied save>" --group terrain --report-file build/playtest-reports/terrain.json
```

The `outdoors` group checks closed-to-open doors across day/night, fed/hungry,
sit/follow, and survival/grounded creative owners. Four additional cases start
near the warning threshold (81 and 90). Following daytime pets must finish
relief, return to the indoor owner, suppress another trip that day, and complete
one on the next day. Sit and nighttime sleep remain protected. Native
`LastReliefDay` and need reset assertions distinguish completion from ordinary
outdoor meter decay. The fixture verifies both door halves and audits an
extended clear outdoor approach. Hunger is reset at synthetic day boundaries
so these care cases do not become starvation tests.

The `water` group moves an already-resting or awake pet into a contained deep
pool. Sixteen cases cross day/night, fed/hungry, survival/grounded creative,
and real empty-hand wet sit requests. Two more trigger creative naps through
three actual block placements, at energy 0 and 80. Every case checks wet rest
refusal, the same healthy pet, a real bank landing rather than a surface hop,
normal gravity afterward, and appropriate dry sleep/nap resumption. Bridge
entity state includes `onGround`; sleeping during an airborne hop fails. The owner
steps farther onto shore after the reachable interaction. Each fixture resets
and verifies owner yaw/pitch so an earlier failure camera cannot change flight
targets and mask a stall.

Failure captures preserve the initial server state, wait 300 ms for client
interpolation, then record a separate camera state and aim at the current pet's
coordinates. After another 150 ms, they capture with the GUI/chat hidden. The
screenshot is a later visual observation, not the exact assertion tick; both
states and camera coordinates remain in the report.

The Overworld arena clears its footprint to y=319 and verifies the upper volume
is air, so an old high platform cannot masquerade as outside. Terrain cases also
reset below-floor water/pit remnants, freeze setup, count inventory/ground/held
toys, and preserve health/position traces. Reports include source revision/dirty
state and installed Mushroom/bridge jar hashes. A dirty revision does not capture
uncommitted source. Unique run IDs keep start/failure screenshots from overwriting
earlier evidence.

Tick sprint advances real server ticks with a bounded wait; this is a fast
state check, not a substitute for watching animation or movement over normal time.

Each case is independent and failures do not skip later cases. Reports are
atomically saved after each case, including failed setup, last observed state,
and screenshots on failure. An interrupted report has `complete: false`.
Treat setup failures as harness problems until investigated.

Replay one numbered case directly:

```shell
node tools/playtest-harness/src/bridge-cli.js yorkie-matrix --expected-save "Mushroom Abel Noelle 20261115-075437" --case 19 --report-file build/playtest-reports/replay-19.json
npm --prefix tools/playtest-harness test
```

The runner/safety tests use Node's built-in test runner and need no dependency
installation. CI runs them separately from the Gradle builds.

## Quiet command feedback and boot diagnostics

Bridge command replies include bounded plain-text `feedback` and a
`feedbackTruncated` flag. Results still use `callbackSeen`, `success`, and
`result`: a valid no-op is different from rejected syntax. The CLI includes
native error text when it rejects syntax. Routine command feedback stays in the
HTTP reply instead of the launcher console and operator chat. Commands that
explicitly send chat, player notifications, or asynchronous game logs can still
produce output. This reduces traffic; it does not repair an upstream launcher
that stops draining its pipe.

If autoplay times out, it saves a local diagnostic JSON report and, when
available, a Java thread dump. With `BRIDGE_REPORT_FILE`, the diagnostic is saved
beside that report as `<name>.boot-diagnostics.json`; otherwise it gets a unique
name under `build/playtest-reports`. Diagnostics use `ps` process names and
`lsof` open-log matching to select the Java process for this profile, never
command-line arguments that might contain credentials. `JAVA_HOME/bin/jcmd` or
`jcmd` on PATH captures threads. Missing tools are recorded as diagnostic limits.
A server logging write to a stdout pipe is reported as suspected backpressure,
not a confirmed cause or proof that the world failed to load. The diagnostic
never kills or relaunches a process; inspect it before attempting another launch.

## Fetch across a saved restart

```shell
make bridge-yorkie-fetch-restart PLAYTEST_WORLD="Mushroom Abel Noelle 20261115-075437"
```

This destructive test requires Python 3, the updated bridge and Mushroom jars,
exact copied-save matching, and one player. It clears test inventory/items/pets,
creates one toy, observes it in Mushroom's native `mainHand`, saves and quits,
verifies fresh save-completion logs and the returned client `processId` exiting,
relaunches the same profile, then checks that exactly one toy reaches the owner.
Both jar hashes and the player/carrier identities must stay unchanged across the restart.
Normal command refusals and bootstrap errors remain distinct from failed toy
conservation; partial reports survive each stage. A startup error is not proof
of item loss—inspect the recorded `failedStage` and bootstrap log before retrying.

Default report names include a unique run ID. Set `BRIDGE_REPORT_FILE` to choose
an explicit path. Direct invocation also accepts `--toy minecraft:bone` or
`--toy mushroom_yorkie:yorkie_chew_toy`, and `--instance-id` for a non-default
Modrinth profile. Add `--full-creative-inventory` to switch the carrying owner to
creative, fill the inventory, save/restart, verify the toy stays held through a
sit interruption, then free space and verify delivery. This catches vanilla
creative auto-pickup deleting overflow that was dropped under the owner.
Do not run another mutating bridge scenario concurrently.

```shell
python3 -m unittest discover -s scripts/tests -p 'test_*.py'
```

The bridge exposes stable entity `uuid` values across reloads and additive
`mainHand` state for living entities. Interruption tests
now observe the carried toy directly and verify the hand clears after a drop.

The restart arena requires the Overworld, clears old overhead blocks through y=319,
and records an air-volume audit. Use `--flight-return flying` or
`--flight-return landed` to save after a real six-block ledge pickup. The latter
lands the creative owner before quitting. Each mode traces the same carrier,
health, and inventory/ground/hand counts for up to 800 ticks after reload, then
checks safe settling after delivery. Combine either mode with `--toy` to test
any fetch toy. These modes are separate from `--full-creative-inventory`.
Restart reports also record source commit/dirty status; installed jar hashes
remain the direct evidence for the running gameplay build.

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
