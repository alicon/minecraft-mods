# Minecraft Playtest Harness

If a disposable test owner dies, preserve the failed scenario before recovery.
Matrix setup refuses dead owners. Use `npm run bridge -- respawn --expected-save
"Codex Test Copy" --player-uuid "<original UUID>" --report-file
../../build/playtest-reports/owner-respawn.json` from this directory to request
ordinary native respawn. The command holds the bridge lock, refuses living or
changed players, preserves its own report and requires a living server owner
after acknowledgement. This explicit recovery does not change earlier verdicts.

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
make bridge-yorkie-smoke PLAYTEST_WORLD="Mushroom Abel Noelle 20261115-075437" BRIDGE_SCREENSHOT_NAME=yorkie-smoke.png
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
The `yorkie-smoke` command now requires the exact disposable save via `--expected-save`
(or `PLAYTEST_WORLD`), plus a single local player in the Overworld. The copied-world
launcher passes its actual save name automatically. It shares the matrix's bridge lock,
checks the same world/player before every step and mutating request, and checkpoints partial observations.
Completed reports retain the original flat `steps`/`screenshot` fields alongside the runner's
case record and separate `gameplayOk`/`postRun` verdicts. While running, partial steps live
under `cases[0].observed.steps`; failed assertions are recorded in `cases[0].error`. On success only, it feeds/heals
the same living owned `runtime_smoke_yorkie` fixture after the original observations
are saved. Harness, leash holder, UUID and native item components must be preserved.
Saved leash data may need a native entity tick to restore its holder; care observes this
with a bounded read-only wait and never attaches a replacement leash. Failed/interrupted
runs and dead/missing/unverified pets receive no care or replacement. A care error fails
overall `ok` while preserving gameplay results. The default report is
`build/playtest-reports/yorkie-smoke.json`; `--report-file` or `BRIDGE_REPORT_FILE` can override it.
Paths are relative to the CLI working directory. `make` uses npm's harness directory;
pass an absolute report path when you want the report under the repository root.
Care is a one-time inspection step, not immunity from later hunger decay.

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
`Mushroom Matrix `, or `Mushroom Abel Noelle `). It replaces loaded Yorkies, boats and minecarts,
builds a high-altitude arena, changes player mode/time/gamerules, and resumes
the client. Never point it at a family save. Keep only one live scenario run
active per bridge. It leaves the test arena and report available for inspection;
it restores daylight and a grounded creative player, not the original save state.
After a successful run it feeds/heals only the original tagged matrix pet, retaining
its UUID, harness, leash, mounted vehicle and native equipment (including item components). This care
happens after case observations are persisted, and is recorded separately in
`postRun`; it cannot change gameplay verdicts. Failed/interrupted runs get no pet
care, and missing/dead/unowned/untagged pets are never replaced. Every maintenance
mutation rechecks the copied Overworld and original player. A care/verification
failure makes overall `ok` false while retaining `gameplayOk`, original case
statuses and evidence. `complete` stays false until maintenance finishes. A final fixture explicitly
marked pet-free (the standalone squirrel cases) records care as skipped; a pet
unexpectedly missing from another fixture remains a failure. World-reset errors
preserve the original failed report or interruption. Direct CLI calls also honor
`BRIDGE_REPORT_FILE`; an explicit `--report-file` takes precedence.

The 144 base cases combine four times (day, dusk, night, dawn), three shelter types
(open sky, roof only, enclosed room), fed/hungry needs, sit/follow orders,
and three owner states (survival walking, creative walking, creative flying). Each fresh-pet fixture checks sleep, orders,
gravity, health, need bounds, and the transition back to daylight and landing.
Each fixture verifies the owner mode and flight flags. The suite does not claim
every state transition. 34 additional sequences interrupt carried fetches with sit/sleep (bone, ball,
chew toy) exercise sleep-to-flight-to-sleep transitions at two hunger levels, and verify
that a starving pet eats an available nighttime meal and settles back to sleep.
Three fetch cases switch from survival pickup to grounded creative delivery and
back, checking exact toy conservation for the ball, bone, and chew toy. The
squirrel case checks that a squirrel uses a clear climbing face when a low
branch blocks the nearest face (`--case squirrel-clear-tree-face`).
Replay them by name with `--case fetch-sit-yorkie_ball` or
`--case sleep-flight-sleep-90`, or `--case starving-night-food-bowl`, or `--case fetch-owner-mode-yorkie_ball`.

Before each fresh pet, the fixture advances an empty arena past the owner’s 1800-tick builder-focus window. Replacing the pet alone does not clear that owner activity. The audit records this reset so case ordering cannot silently trigger a leftover creative nap.

The terrain group adds 36 cases: dry ground, open water, covered water, and a
six-block drop for each toy and owner locomotion state. It requires ordinary
returns in accessible terrain and safe refusal under covered water or a survival
cliff. A grounded creative cliff attempt may return or safely give up; it must
conserve the toy, avoid damage, and end near the owner. Flying fetches must return.
Eight squirrel routes reuse the clear-face fixture at neighboring starts, including
starts that previously circled for about nine seconds. Each records every native
world tick and requires healthy, stable clinging for 40 ticks. The observer also
rejects more than three horizontal blocks of travel after a half-block
rise within 1.25 horizontal blocks of the expected trunk or more than one block of lost height, so eventual success cannot hide a
clumsy route. Contact hops are allowed. The original `squirrel-clear-tree-face`
case name is retained; use the other `squirrel-*` cases for nearby starts. These
cases have no inspection pet and do not run success-only pet care.

Five reachability controls add known enclosed-tree and face choices, an
unobstructed-nearer control, a farther-only control and a route closed after a
native approach begins. The observer requires the expected tree, not just any
healthy cling nearby. `squirrel-route-closure` adds a wall only after measured
progress and body clearance; an invalid setup stays distinct from a gameplay
failure. Use `--case squirrel-reachable-alternative`, `squirrel-open-near-control`,
`squirrel-far-only-control`, `squirrel-route-closure` or
`squirrel-reachable-other-face` with the transitions group.

Three `squirrel-step-5`/`6`/`7` cases add one-block rises and drops at different
points on a nine-block approach. They retain full native movement, require
observed airborne approach ticks and the intended tree, and stage the owner
outside new solid blocks. The observer starts counting climbing travel near the
expected trunk, so crossing the raised strip cannot masquerade as circling.

Six landing transitions reuse the ledge fixture for every toy: land during the chase or after pickup, then verify safe delivery, no damage, one play reward, and normal grounded following. The outdoor-care group adds 20 cases, the water/rest group adds 22, and sleep-spot controls add eight, making 270 cases before vehicle coverage. The vehicle group adds 100 cases; the journeys group adds 112; native shore adds eight, for 490 defined cases. Run one group with `--group base`,
`--group transitions`, `--group terrain`, `--group outdoors`, `--group water`, `--group rest`, `--group vehicles`, `--group journeys`, or `--group native-shore`; combine it with an exact `--case`.
Unknown groups/cases fail instead of running a different suite.

`native-shore` needs the current Minecraft client and bridge. It covers day/night,
hungry/fed and sit/follow using a native owner exit, an empty-hand pet interaction
within survival reach, 80 native forward walking ticks and 120 subsequent world
ticks. Before movement it checks the entire walking bank's floor, headroom,
30 pool-water blocks, walls, bottom, pool headroom and half-block step. Runtime bounds cancel native input
before the owner reaches an edge. Following recovery requires 40 final consecutive
world samples with full air, normal gravity, dry grounded posture and the original
owner nearby, followed by a native block-support check. Dry sitting keeps its
order, full air and actual support on audited blocks or the original boat hull.
Ordinary reboarding of that same boat after 200 native world ticks is allowed;
earlier reboarding fails. Drift
over one block from the help position fails. Observed water contact requires
release and recovery, but these eight cases do not guarantee wet-sit coverage.
The empty-hand help is frozen, with its first subsequent native world tick
inspected separately. Walking is sampled by request snapshots, not every world
tick; a short contact between those polls can remain unseen. The world freezes
before post-walk block queries. All cases retain original
actors, health, air/fall/damage facts and possessions, and disable inspection care.
These investigative cases stop at the first failure so a later setup cannot
replace its original actors. A failed fixture stays frozen with its owner mode
and time retained; player ticks can still advance, so check owner safety before
resuming. Input release failures are visible in the case error and observations.
The report distinguishes terminal completion from
whether every requested case ran.
The matrix's 490 defined cases are not a claim that a full sweep has passed.

```shell
node tools/playtest-harness/src/bridge-cli.js yorkie-matrix --expected-save "<copied save>" --group native-shore --report-file build/playtest-reports/native-shore.json
```

```shell
node tools/playtest-harness/src/bridge-cli.js yorkie-matrix --expected-save "<copied save>" --group terrain --report-file build/playtest-reports/terrain.json
```

The `vehicles` group adds four controlled reboarding challenges to 96 full-entity
sequences. The challenge holds the pet with NoAI, lets the vanilla cooldown expire,
then creates direct contact while the real boat ticks. This isolates automatic
boarding refusal; it is separate from the ordinary full-entity sequences.
The group proves controlled native mounts in oak boats, chest boats and
minecarts before testing owner-assisted dismount, creative takeoff/landing, and
mounted survival feeding/harness changes. It covers day/night, fed/hungry and
sit/follow orders; assisted dismount also covers survival/creative grounded owners.
Both directions of the bridge's id/type passenger references must match the full
UUID states. Takeoff moves the owner above ground before enabling flight, waits
for stable client/server flight flags, and samples those flags during gameplay.
A lost flight/mode flag is a setup failure, not a pet-behavior failure.
Named native pet equipment and chest-boat cargo must survive. Food
and harness controls freeze ticks for exact item/need changes, then resume full
entity ticks. Successful final passenger fixtures retain their vehicle through
inspection care. These are dry stationary vehicles and controlled contact tests, not water travel,
moving-cart journeys. Those are in the journeys group below; natural approach and
reload behavior remain tracked in issue #45.

The `journeys` group adds 64 contained-water dock sequences, 16 offshore immersion
controls, and 32
rail-minecart sequences. Each proves a real native passenger, injects motion
for at most 30 frozen native ticks and requires at least two blocks of observed native movement before
owner help, creative takeoff/landing, or mounted survival feeding/harness changes.
Every motion request is recorded. A single initial impulse was observed to stop
short, so the fixture reapplies motion at five-tick samples until its travel
target is observed. Offshore controls sample every tick and stop the hull after three
blocks, leaving room for its later departure; dock and rail controls sample every
five ticks. The original short-travel cause is unconfirmed. Short travel remains a setup failure; command success alone does
not establish movement. These inputs do not simulate player rowing.
Boat bank-exit cases have a real dock doorway, a controlled shore-facing passenger
yaw, and an owner standing clear of the exit. They do not claim an offshore sit
order should make a dog walk off its safe boat platform. Offshore controls
explicitly move the empty boat away after dismount, then witness actual water entry.
Survival controls observe a native fall; creative controls explicitly place the
same dismounted pet underwater because early creative recovery can otherwise
preempt immersion. Both require witnessed immersion, released sitting and safe
return; their entry methods are recorded separately in the inputs and trace.
Departure includes a small native
downward bob before drifting toward the bank; a boat that never actually departs
is a setup failure. The bank obstruction remains part of the recovery challenge.
It combines day/night, hunger and sit/follow states, preserves native named cargo,
and checks safe grounded recovery after dismount. Dry passengers retain their
order; a witnessed wet dismount releases sitting for water safety. Fine-grained
post-dismount samples distinguish that safety transition from an unwanted order
change aboard a dry boat. The ejection frame may still retain sit because native
water safety runs before flight dismount; the next witnessed world tick must
release it. Native world-clock evidence from an immediately preceding frame is required for that
one-tick allowance; a first wet sample after a larger gap must already be released.
All matrix sprint waits and vehicle frozen-step waits use native
gametime, with modulo-wrap handling and tickAudit records. The server counter is
not a physics clock while frozen. The shared vehicle fixture, flight setup and mounted
care checks are reused by both groups. These controlled /ride mounts and injected
motion do not prove natural walking approaches, player rowing or reload behavior.
Those remain tracked in issue #45. A case that fails before its travel/end-state
checks is not counted as completing that journey.

The eight clear-face squirrel transitions sample every native world tick. Each
requires the original healthy squirrel to reach safety within 100 ticks and
remain clinging for 40 more consecutive ticks, within a 400-tick observation
bound. Reports retain completion time, horizontal travel and lost height.
A frozen-world state check and native tick audit protect the per-tick samples.

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
three actual block placements, at energy 0 and 80. Four urgent-potty cases compare day and night for both grounded owner modes. Night recovery must keep the outside trip inactive while retaining water escape and dry sleep. Every case checks wet rest
refusal, the same healthy pet, a real bank landing rather than a surface hop,
normal gravity afterward, and appropriate dry sleep/nap resumption. Bridge
entity state includes `custom.relief.tripActive` and `lastReliefDay` to observe active outside trips during water recovery (not every brief transition between samples), plus `onGround`; sleeping during an airborne hop fails. Native sleep guards also require center
support, so partial bank contact cannot count as a safe place to rest. The owner
steps farther onto shore after the reachable interaction. Each fixture resets
and verifies owner yaw/pitch so an earlier failure camera cannot change flight
targets and mask a stall.

Failure captures preserve the initial server state, wait 300 ms for client
interpolation, then record a separate camera state and aim at the current pet's
coordinates. After another 150 ms, they capture with the GUI/chat hidden. The
screenshot is a later visual observation, not the exact assertion tick; both
states and camera coordinates remain in the report.

Water recovery also checks the actual solid block under the landed pet. Safe
nighttime rest may start within four blocks of the owner; it need not reach the
normal follow distance before sleeping on dry supported ground.

The `rest` group adds dog-bed and doghouse controls across survival/grounded
creative and fed/hungry states. A daytime awake control precedes actual nighttime
approach, three stable sleep observations on the intended spot, and dawn wake-up.
The doghouse's non-colliding visual bed holds Mushroom a quarter block above its
solid floor; native support guards preserve this anchor while refusing one over
unsupported water. Dawn checks keep the same pet alive and healthy, catching
synthetic fall accumulation from the raised visual bed. Awake falling pets do
not gain sleep-based fall protection.

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
A Log4j console write on the server, render thread or a resource-reload worker
while stdout is a pipe is reported as suspected backpressure. `consoleWriteThreads` names
the observed critical threads, including stalls before the server exists. This is
not a confirmed cause or proof that the world failed to load. Other worker
writes and non-console file writes do not implicate launcher backpressure. The diagnostic
never kills or relaunches a process; inspect it before attempting another launch.

## Bounded native client input

The development bridge can hold forward/backward/left/right through Minecraft's
key mappings, before native `KeyboardInput` runs. It supports a walking player
or the driver of an identified boat, and can press the native dismount key for
an identified boat or minecart. It does not set velocity, teleport the
player, or use OS keyboard automation. Start with a clear copied-world route
and no movement keys held. An open screen, frozen world, flying/spectator player,
wrong vehicle or changed save/player prevents input or releases an active burst.

```shell
node tools/playtest-harness/src/bridge-cli.js client-input \
  --expected-save "Mushroom Abel Noelle 20261115-075437" \
  --mode walk --ticks 20 --forward true \
  --report-file build/playtest-reports/native-walk.json
```

For rowing, use `--mode boat --vehicle-uuid <original boat UUID>` while the
original player is already its driver. Omitting direction flags requests an idle
control. Durations are 1–100 client ticks, with a 15-second wall-time cleanup
callback. Normal completion includes a later neutral input tick. Cancellation,
context loss and shutdown release injected controls; an unconfirmed release is
reported as failure, not movement success. Unowned jump, sprint or sneak input
interrupts the burst. Native momentum can continue after keys release.

Use `--mode dismount --vehicle-uuid <original vehicle UUID> --ticks 2` to leave
a boat or minecart through native Shift input. This mode defaults to two client
ticks, accepts only 2–5, and forbids directional controls. It owns and releases
Shift; other input modes still reject external sneaking. Toggle-sneak settings
are refused before a dismount burst. Cancellation still clears the owned key if
the setting changes while a burst is active. After release, up to 40 neutral
client ticks may await the native exit; no additional key presses occur.
Once a fresh neutral sample proves release, the bridge stops writing keys.
Later physical movement ends the operation without clearing that new user input.
The original client
must show the key press, key release and on-foot state. The driver then waits
up to two seconds within its overall timeout for server-side exit, a released
server shift flag and world-clock progress. That server flag is a final-state
check; the fresh native client sample proves actual key release. The original source vehicle must
remain observable. Request acceptance alone cannot pass this check. No server
dismount command is used. `/state` exposes read-only player `shiftKeyDown` for
this final-state check.

Use `--mode jump --ticks 2 --forward true` for an ordinary forward hop from a
grounded, dry, on-foot non-creative owner. Jump allows 2–5 ticks and defaults to
two. It refuses recent hurt, climbing, water/bubbles and active effects. It owns
the native jump key through the shared lifecycle and requires a grounded press
followed by an airborne upward impulse without a vertical collision at launch.
The native code records whether that launch occurred during its own press;
movement after release cannot create the witness.

Client/server starting heights must agree within 0.125 blocks. The bridge binds
the request to the fresh server-origin snapshot and records monotonic input and
snapshot intervals from the same process. A separate server snapshot must show
accepted airborne rise over 0.05 blocks during input ownership. Minecraft takes
player movement packets from the client, so this confirms accepted position; it
does not constitute another physics calculation. A late jump after completion
cannot supply missing evidence. Recorded in-window rise still counts if the
owner has landed by the final read. Missing proof is failure. The action does
not establish a safe landing or explain a blocked forward-only walk.

Player state includes read-only `onGround`, `inWater`, `inWaterOrBubble`,
`onClimbable`, `hasEffects`, `hurtTime`, `crouching`, `pose`, collision flags,
`stepHeight`, `velocity` and `positionPrecise`. Client frames retain native
launch, pose/collision and timing facts. These observations do not alter physics.

The CLI holds the shared bridge lock and saves incremental reports. It checks
fresh native keyboard records and player ticks, neutral release, actual server-world progress and measured
owner/vehicle displacement. A valid burst can have zero movement against an
obstacle or in an idle control; scenario callers must assert the travel they need.
It does not reset the arena or apply pet care.

Direct `POST /client-input` requests use `action: start|status|cancel`, the exact
`expectedSave`, `playerUuid` and a caller-generated UUID `operationId`. Starts add
`mode`, integer `ticks`, Boolean direction flags and, for boats or dismount,
`vehicleUuid`. Dismount direction flags must all be false.
Status/cancel use only the common fields. The current operation's identical start
can be retried without applying input twice. Other overlapping starts fail.
Only the most recent receipt is retained. Poll until `phase=complete`, then
require `outcome=completed` and `controlsReleased=true`. Receipts include bounded
client frames and a server snapshot taken before dispatch of that request.
The CLI takes a separate final server snapshot for movement verification.
New receipts also retain `serverInputTrace`: ordered native `input_packet`,
`ride_tick_start` and `ride_tick_end` observations for the original owner. Packet
events run after the real server handler; riding events bracket native player
riding logic. They record the packet flags, actual server Shift flag, original
vehicle, world clock and server/player ticks. No hook changes those values.
This can distinguish a handled held/released pair before a riding tick from a
held flag actually seen by the native riding logic.
This is handler order, not network arrival order. The required Minecraft 1.21.11
mixin targets must be verified after a rebuild/restart; an incompatible target
fails startup rather than silently omitting a hook.

The observer arms only after a validated copied-world input request, retains at
most 1024 events, and stops recording after 30 seconds without another validated
input request. Server shutdown clears its context. `coverageComplete` is false
when the requested interval predates its scope, expires, loses events to overflow
or encounters an observation error; missing events then cannot establish absence.
If the diagnostic snapshot fails or times out, its status is `unavailable` with
incomplete coverage; the original input receipt is still returned.
Sequence numbers preserve order when monotonic millisecond timestamps are equal.
Unlike `serverSnapshot`, which is taken before request dispatch, this trace is
copied on the server thread after the client receipt returns, so a snapshot cannot
split a native hook's read and append. Coverage ends at that snapshot boundary,
identified by `throughSequence` and `captureMillis`; a later event can have the
same millisecond and a larger sequence. The final release packet may still be in
the server queue; a later status poll can observe it. Native dismount clears the
server Shift flag, so `ride_tick_end` can show false while `lastClientInput.shift`
still shows the earlier held input. Events may extend beyond `finishedMillis`;
the packet itself has no bridge operation ID, so timing alone does not prove
ownership. Existing movement and release acceptance checks remain required.

`firstApplyAttemptMillis` and `releaseRequestedMillis` describe native key-mapping
attempt/release timing separately from the later neutral keyboard sample. A
mapping can be released before cached native input is refreshed. These times do
not replace fresh release proof. Passive observation can still affect scheduling;
a passing instrumented retry does not explain an earlier failure.
`/state` also exposes `worldFrozen` and exact string `overworldGameTime`; client
frame time is a distinct observation. The shared `driveClientInput` helper
requires its caller to hold the bridge lock and attempts cancellation on failure,
including a lost acceptance reply using the ID chosen before dispatch.
Normal completion uses a fresh native neutral sample. Emergency context, adapter
failure or shutdown cleanup can clear cached input without waiting for another
player tick; those outcomes are not successful movement evidence. The CLI also
attempts cancellation and preserves a failed report on SIGINT/SIGTERM.

Nearby living-entity snapshots include native `air`, `maxAir`, `fallDistance`,
`hurtTime` and `lastDamageType` alongside health. These read-only facts help
separate drowning, fall accumulation and other damage during travel. A retained
damage type is recent native history; `unavailable` means no cause is currently
retained, not that the entity has never taken damage. Gameplay observers run only
during the requested operation; cancellation receipt collection stays independent
of an observer that has already failed.

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

## Live crafting checks

```shell
node tools/playtest-harness/src/bridge-cli.js yorkie-crafting \
  --expected-save 'Mushroom Abel Noelle 20261115-075437' \
  --report-file build/playtest-reports/yorkie-crafting.json
```

This guarded, read-only suite checks all nine mod recipes, vanilla copper nuggets and dyed wool,
empty input, and rejected malformed/unknown-item grids. It records the native selected output,
quantity and every matching recipe, so a mod craft cannot silently overlap another recipe.
Vanilla controls also reject any matching Mushroom recipe, even when the selected output is vanilla.
Reports are saved incrementally, including failed checks. This command does not replace items,
change the player's inventory, reset pets, or apply post-run care.

The bridge's `POST /crafting-check` accepts integer `width`/`height` from 1 to 3 and `slots` in
row order, with one namespaced item ID or null per slot. Each occupied slot represents one item.
For example, a bowl uses `{"width":3,"height":2,"slots":["minecraft:copper_ingot",null,"minecraft:copper_ingot",null,"minecraft:copper_ingot",null]}`.
The response reports `mode: read_only_recipe_resolution`, `matched`, `selectedRecipe`, `result`
and `matchingRecipes`. A rejected grid returns `ok:false` with an error. This queries loaded
server recipes; it does not open a UI or consume inventory ingredients. Separate headless native
tests verify actual crafting-menu output on both Minecraft targets.

The two `squirrel-climbing-face-*` transition cases compare an ascent interrupted
by a solid block with the same open route. They verify exact native ticks,
body-safe placement, the original healthy UUID and 40 recovered perch ticks
within a 300-tick bound. A failed climb preserves its trace and unfreezes during
cleanup; neither case receives success-only pet care.

## Squirrel perch across a saved restart

```shell
node tools/playtest-harness/src/bridge-cli.js yorkie-squirrel-restart \
  --expected-save "Mushroom Abel Noelle 20261115-075437" --lower-face-block
```

Omit `--lower-face-block` for the unchanged-perch control. This destructive check keeps one mutation lock across its matrix fixture and
restart. It uses the existing matrix case to create a fresh squirrel and observe a real
climb. It then verifies the original healthy UUID and trunk, optionally places
and reads back stone below the body, and observes 40 safe native ticks before
saving. Normal shutdown must produce fresh save-completion logs and the old
client process must exit before the same profile is relaunched. No jars change
during this test. The original owner, exact save path and jar hashes must match.
A non-default profile requires `--instance-id`.

The report includes the first reconnected snapshot and 120 further exact frozen
native ticks. A later recovered perch cannot hide observed health/height loss or
movement to another face. The unfrozen intervals before quit, during startup and between reconnection
and freeze are not individually sampled; their native clock endpoints and this
limit are recorded explicitly. Native serialization
controls provide separate per-tick evidence across entity loading.

Reports are atomic and incremental, with a linked fixture report and bootstrap
log; `--report-file` overrides the unique default name. Failures and startup
errors remain distinct. Cleanup rechecks identity and verifies the world is
unfrozen. A cleanup failure keeps the gameplay verdict separately and fails the
overall run. No failed or successful squirrel run receives pet care, damage
immunity, a replacement squirrel or a post-start success teleport.

Add `--support-log ground` to remove a remote ground log after a verified saved
restart and require 40 more safe perching ticks. `--support-log middle` removes
one of the two supporting log blocks instead and requires released no-gravity,
observed height loss and native fall-distance accumulation within 20 ticks.
The latter permits ordinary fall damage; it does not heal the squirrel. Native
controls compare the same two support changes both before and after reload.

The four `squirrel-hurt-*` transition cases cover climbing/perched squirrels
and two attack-source directions. A creative flying owner supplies a controlled
native `player_attack` damage command from within ordinary reach and a clear
authored line of sight. This is not a client mouse attack. The original full-AI
squirrel must receive new attacker-directed momentum, release its observed climb
flag on the first tick, move away within two ticks, and regain a stable perch
within 400 ticks. Perched hits must accumulate ordinary fall distance. Observed
landing damage is retained for perched hits; unrelated damage, healing, missing
identity, skipped ticks and unexpected position jumps fail. Every trace is saved
before assertions and cleanup unfreezes the world. No squirrel care runs.

Entity snapshots now include server-side `velocity` in blocks per native tick,
rounded to two decimals like positions. This read-only field exposes supplied
momentum separately from actual displacement; it does not itself prove movement.
