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

### Mushroom expedition travel

Run the focused Java 1.21.11 travel fixture in a real Fabric client:

```shell
./gradlew :mushroom-the-yorkie:runClientGameTest -Pclient_game_tests -Pyorkie_expedition_client
```

The fixture creates a disposable Normal Survival world with a fresh inventory.
It stages a bed, squirrel and portal entrances, then uses the normal Use,
crouch and movement bindings. It opens the adoption guide, calls Mushroom off
a chase and uses a treat to record the first paw. It also equips the vest,
attaches scute plates and places the camp mat. In the End, a staged breath cloud
tests whether Mushroom retreats and keeps shelter while his owner dies and
returns. Each crossing checks the original dog's UUID, ownership and living
arrival. The final fight fixture starts with the crystals cleared, the vanilla
dragon perched at two health, and a nearby sheltered camp. A native sword
strike kills the dragon. The server verifies that vanilla opens the exit and
that the original dog waits at camp. The player recalls Mushroom and they
walk through the exit. Save and reopen verify the dragon victory and the
same dog's armor, camp and training progress. A final Nether crossing checks
that a seated dog stays behind.
Screenshots are under `mods/mushroom-the-yorkie/build/run/clientGameTest/screenshots/`.

Prefix the Java command with `MUSHROOM_EXPEDITION_SLEEP_OWNERSHIP_ONLY=1` for
the focused wake-up regression. A native bed interaction adopts Mushroom.
The fixture moves him out of loaded chunks and saves and reopens the world.
Another native sleep leaves that same dog alive in his distant chunk. After
a confirmed death, the following sleep creates one replacement in the
default respawn mode.

For Bedrock, build the add-on and run the expedition fixtures with the official
Bedrock Dedicated Server archive.

```shell
python3 scripts/build-bedrock-addon.py mushroom-the-yorkie
python3 scripts/smoke-mushroom-bedrock.py SERVER.zip ADDON.mcaddon \
  --verify-expedition-travel --verify-expedition-vest --verify-expedition-camp \
  --verify-expedition-trail --verify-expedition-dragon --verify-expedition-victory
```

The travel fixture stages safe Nether and End crossings and checks the original
dog's identity. It also covers an ordered sit, an unsafe landing, a remote End
arrival and a lead already held by a guest. A second fixture walks a Survival
simulated player through a native Nether portal. The vest fixture checks same-tick
owner and guest inputs, damage, repair, plates, removal and saved wear. The camp
fixture exercises native placement, ownership, a safe route around a wall, recall,
and a missing mat. It also throws a lingering potion in the End to exercise a
native cloud and keep Mushroom clear while the owner is still inside it.
A restart checks the same dog's mark and safety hold. The trail fixture
checks a one-wide bridge for an owner and for a guest holding the lead, then
widens it and verifies that Mushroom resumes walking across.
The Dragon fixture watches for a native fireball and its breath cloud, then
tests the original dog walking out on prepared footing. A separate fresh world
stages the final hit by reducing the Dragon's health and clearing its crystals.
That fixture checks that the attack opens the native exit and that the same dog
is alive with its original owner. Use a real client for the exit and save/reopen.

Export the staged victory save with the generated End fountain and prepared
Overworld landing for the official client:

```shell
python3 scripts/smoke-mushroom-bedrock.py SERVER.zip ADDON.mcaddon \
  --export-expedition-client-exit build/playtest-reports/Mushroom-Expedition-Client-QA.mcworld
```

The export replaces the simulated-player script with the stable client probe.
Import the prepared `.mcworld` through **Play → Worlds →
Import world** in Minecraft for Windows. The probe stages the local player
and records Mushroom's identity before handing off to normal input. Walk into
the portal, jumping over the raised rim and stepping around the center pillar
if needed, then dismiss the credits. Check `EXPEDITION RETURN VERIFIED` in
chat, then save and reopen the same world and check `EXPEDITION REOPEN VERIFIED`.
Both assertions require a living dog with the recorded ID and original owner.

### Mushroom fresh-world Survival adoption

Build [mc-agent-mcp at 3cf75f3](https://github.com/ArchitektSpeer/mc-agent-mcp/tree/3cf75f33ee93b7e999f16dc320ef09f85c2f0de2)
with Java 21 and `./gradlew build -Ploom_version=1.17.21`. Pass the resulting
`build/devlibs/mc-agent-mcp-0.2.1-dev.jar` to the runner from the repository
root. The runner requires Java 21 and Node 22 or later.

```shell
MUSHROOM_EXPEDITION_SEED=1 MUSHROOM_EXPEDITION_SPAWN_RADIUS=0 \
  sh scripts/run-mushroom-java-survival.sh /path/to/mc-agent-mcp-0.2.1-dev.jar
```

The runner prints a new directory under `build/playtest-reports/` containing
the action trace, client and controller logs, and screenshots. Follow
`tail -f "$RUN_DIRECTORY/playtest.log"` for the current objective, status,
observations that changed the plan, and actions such as crafting. With Jev
enabled, the log also names its selected action or the local fallback.
The native game log records the damage source, health, and position when
the original companion is hurt during a fresh or recovered expedition.

The client starts in a fresh Normal Survival world with an empty inventory and
commands disabled. If wood drops through the canopy,
the pilot centers over an observed dry landing before breaking its support
and checks that the player actually landed. It permits a four-block drop
only with at least 18 health. The player gathers wood, crafts a wooden
pickaxe, sword, and shovel, packs the crafting table, and looks for a bed
behind a door and under a roof. It
walks through the door and closes it before sleeping. If it cannot find a
reachable sheltered bed, it crafts a bed once it has collected matching wool.
When food runs low, it can route toward nearby pigs or cows while scouting for
wool. The scout can dye mixed wool when it has enough materials and takes a dry
retreat from nearby danger. If it falls into water, it swims up for air and
looks for a supported bank with a dry route inland. If it is stranded on a
shoreline shelf, it enters the water again only after finding a route to a
walkable bank. It verifies grounded footing before scouting again. When
scouting repeatedly returns to the same tiles,
it interrupts the chase and retraces grounded observations. If a ledge blocks
the return, it can cut a supported one-block foothold away from fluids and
falling blocks before looking for a different sheep. It uses remaining daylight
to gather reachable supplies close to the bed, replenish food and timber, and cook
when it has a furnace and enough
mutton to keep a meal for the dog. It then sleeps at normal sunset and
feeds the adopted dog. The
controller uses a local view of the loaded world and checks the actual crosshair
before attacking or feeding. The integrated server verifies the next morning,
one living owned Mushroom, and the Field Guide in the player's inventory.
Allow roughly one full Minecraft day for setup. The game test captures the final
view or, on controller failure, the view at failure. After a pass it saves and
reopens the world to check that the same living dog still belongs to the
original player. Use the seed and spawn-radius settings above to replay
the starting area, including the possible canopy spawn.

The default policy uses local rules. Set `MUSHROOM_EXPEDITION_POLICY=jev` to
let TypeSafe Jev choose dry scouting routes and how to proceed when the player
is missing stone or finds a blocked quarry exit. The runner
uses `OPENROUTER_API_KEY` or the Mac Keychain entry `mushroom-qa-openrouter`.
Each run reserves at most 76 requests, including after controller reattachment.
It logs the choices, latency and reported input cost in `actions.jsonl`.
The controller has a local fallback.
The ordinary Survival actions and assertions are identical in both modes.

After a respawn, the controller can take a direct daylight recovery route
when it can see both the dropped shield and Field Guide near the recorded
death site. It verifies the recovered shield in the offhand. Before looking
for iron again, it replaces a missing stone pickaxe or furnace using earned
materials and a crafting table it places within reach.

For Survival routing decisions, use daylight for a sheltered bed, cooked
food, and a way back to camp. Put a solid barrier between the player and
ranged mobs. Light enclosed routes and keep the return path out of a quarry.
Fit the tool to the block and keep a stone-or-better pickaxe for iron ore.
Use the earliest iron toward a shield when working around skeletons. Once in
the End, establish Mushroom's camp and a safe return route before attacking
the crystals. These are priorities for the pilot. The stage results
indicate which actions the controller actually exercised.

[First-night and shelter guide](https://www.minecraft.net/en-us/article/how-survive-your-first-night-minecraft)
· [Shovel](https://www.minecraft.net/en-us/article/taking-inventory-shovel)
· [Exploring with a shield and supplies](https://www.minecraft.net/en-us/article/exploring-minecraft)
· [Ender Dragon](https://www.minecraft.net/en-us/article/ender-dragon)

Write `coach.txt` inside the printed report directory to send one short gameplay
instruction to the next Jev decision. The note is read again for every call
and is recorded in the action trace. The client stays in the same world.
Set `MUSHROOM_EXPEDITION_LIVE=1` to keep a failed controller's world open for
inspection. If the controller has tried its quarry exit options and waits for
coaching, replacing the note resumes its recovery attempt in the same world.
The standard QA invocation still exits after a controller failure.

If the owner dies in live mode, the runner records the death location and
screen, then uses Minecraft's Respawn button in the same save. If the
controller stopped and has a saved phase, the runner reattaches it once for
that death. The controller can follow a dry route to the recorded location
and recover the dropped guide and gear. When respawn is far away, it makes
a wooden sword if needed and earns food for the player and Mushroom along
the way. The last portion stays reserved for Mushroom. The controller
retains the original gear location if the player dies again during recovery.
If the guide is missing, it verifies the saved companion's UUID and confirms
that the recovered stone kit is in the player's inventory before continuing.
The trace records the deaths, provisioning, and gear reacquisition.

If a live controller has exited and its status is `held`, restart the external
controller from its last saved phase with the same client still open. Use the
same stage and policy and point to that run's status file. The client connection
and owner must match the recorded checkpoint. The replacement controller
takes ownership of the run so the original launcher cannot mark it failed.
The live verifier freezes world ticks while the controller is held and
resumes them before the replacement controller starts issuing gameplay input.
A player with the earned starter
tools can resume searching for food and wool before a camp has been built.
An interrupted iron quarry retains its grounded steps. The resumed controller
can continue from the verified landing or use the recorded route to climb out.
When an old exit has missing support, the player can place carried blocks from
an observed dry ledge. If Mushroom occupies the build space, the player can
choose a neighboring foothold. A quarry that ends
without enough ore records its entrance and the observed blocks at the last
landing. If the same footing remains after reattachment, the controller
scouts another opening. On the surface it offers Mushroom an earned portion
if his first meal is still pending. A decision to return after a meal
survives a handoff and takes priority over mining until both the player and
the original living dog reach the bed. For a long return near nightfall, the
player looks for shelter and can sleep until daylight in a carried bed. If the
pair gets separated, the player checks for the original dog at longer range and
regroups before continuing to wait or travel. An injured player under fire
faces the archer and uses a carried shield before attempting another exposed
step toward the dog. At critical health, it can dig and cap a shallow shelter
when the observed terrain has solid walls, a floor and a climbable exit. The
controller checks the landing at each level and waits for daylight and a clear
approach before reopening the exit.
The first mined iron goes back to the camp bed before smelting. Both trips
can retrace grounded positions recorded on the outbound path. The iron trip
uses positions from before the first ore pickup. The trace records the
original dog, the player's position at the bed, and any raw iron brought back.
After a meal when it is safe to keep mining, the player checks and retraces the
existing quarry stairs before extending them. A return to camp takes priority
when Mushroom or the player needs more care.

```shell
MUSHROOM_EXPEDITION_STATUS="$RUN_DIRECTORY/status" MUSHROOM_EXPEDITION_RESUME=1 \
  MUSHROOM_EXPEDITION_LIVE=1 MUSHROOM_EXPEDITION_STAGE=iron MUSHROOM_EXPEDITION_POLICY=jev \
  node tools/playtest-harness/src/expedition-supplies.mjs >> "$RUN_DIRECTORY/actions.jsonl"
```

A closed test world can be continued at the iron phase with
`MUSHROOM_EXPEDITION_RESTORE_MANIFEST`. Archive the closed save under
`build/playtest-reports`. Make a JSON manifest containing the absolute
`source` directory, the `seed`, the `owner` and `dog` UUIDs, and a `camp`
object with the `bed` and `table` block coordinates. Start the ordinary
runner with the manifest path and the `iron`, `nether`, `nether-powder`,
`stronghold`, or `expedition` stage. The client opens a copy and verifies
the world, owner, camp, earned stone kit and original living dog before
handing control back at the iron phase. The
trace records the recovery as assisted. An archive taken inside a quarry can
include `ironProgress` with the recorded `quarry`, `quarryLanding`, and
`lastDogMealAt` so the controller can resume the stairs. During the iron hunt,
the controller pauses to regroup with the dog when care is due and checks
that they stay together while looking for food nearby. If the dog gets
separated by terrain, it can retrace dry footing from their last same-level
contact. The surface retreat check looks for intervening solid rock when a
creeper is well below the player. When a bed is within
reach at night, the controller attempts sleep before sending the player to
search for food in the dark.

Use `MUSHROOM_EXPEDITION_STAGE=reunion` with a restore manifest to replay
an injured dog and separated owner from a copied save. Add a `reunion`
object with the last observed block position as `lastSeen` and the dog's
previous `health`. The controller seeks daylight, earns a meal, and uses
the old sighting to look for Mushroom. The native verifier checks that
the same living dog has recovered health beside the original owner.
The run report's `source-build.txt` records the Git revision and working
changes to the mod and controller sources used to launch the native client.

Summarize the action logs and the native save/reopen evidence for comparison:

```shell
python3 scripts/summarize-mushroom-expedition.py "$RUN_DIRECTORY" "$OTHER_RUN_DIRECTORY"
```

Add `--compare-policies` to compare fresh Java expedition runs on seeds shared
by rules and Jev at the same source revision. Pass the matched-seed reports and
held-out reports in separate invocations. Only a native dragon victory followed
by a return and reopen with the original dog counts as a win. The cost per win
includes failed terminal attempts. It stays unset when there are no verified
wins or when billable usage is unknown. Live attempts remain visible without
being counted as finished. When a run is stopped to replace its build, record
the reason in `retired-for-build` before shutting down the client. The report
retains its usage and excludes it from the matched comparison.

When an experiment's controller exits with a failure and the test keeps
the world open for investigation, copy the report before reattaching. In
the copy, save the final `Run held.` reason in
`archived-controller-failure.txt`. The comparison counts that attempt as a
failure only when the copy still says `held` and its final narration agrees
with the recorded reason. The live report can continue as an assisted replay.

The same command accepts a Bedrock `--play-seconds` log. It reports elapsed
time, completed cases, input recovery, and the add-on and fixture checksums.
A Bedrock soak passes only after the logged duration meets the requested
duration and the fixture emits its final pass marker.

The controller marks manual reattachments as assisted when they begin. The
original launcher can retry automatically after a native respawn. Older
reattachment logs without that distinction are treated as assisted. Charge
reported inference spend from failed benchmark attempts to the policy that
made them.

Apply the companion patch to the isolated bridge checkout before rebuilding the
JAR. It exposes the original dog's stable identity and hurt animation alongside
the client-observed health. The controller can interrupt work for nearby danger,
and the native game test fails if that dog dies. For a smoother spectator camera,
also apply the camera patch. Use separate JARs for concurrent clients.

```shell
git -C "$BRIDGE_CHECKOUT" apply --unidiff-zero "$PWD/tools/playtest-harness/patches/mc-agent-mcp-companion.patch"
git -C "$BRIDGE_CHECKOUT" apply --unidiff-zero "$PWD/tools/playtest-harness/patches/mc-agent-mcp-smooth-camera.patch"
git -C "$BRIDGE_CHECKOUT" apply --unidiff-zero "$PWD/tools/playtest-harness/patches/mc-agent-mcp-dragon-combat.patch"
```

With the dragon patch, a targeted entity query reports the dragon's current
perch state and part positions. A melee action on a part requires that the
native crosshair hit that part and that it be within normal attack reach.

Set `MUSHROOM_EXPEDITION_STAGE=stone` to earn the stone kit. The player can
use the daylight before adoption and finish any remaining work after breakfast. It
scouts for reachable stone, mines cobblestone in view, and returns to the
crafting table. If the surface has no exposed stone, it cuts and retraces a
short staircase with dry footing away from camp. The integrated server also checks the earned stone pickaxe,
the furnace, and the original adopted dog's identity.

Set `MUSHROOM_EXPEDITION_STAGE=iron` to continue from the stone kit. The
controller looks for exposed iron and coal, verifies the actual mining
crosshair, and waits for the native furnace to smelt the ore. It can burn a
plank for the first piece of iron or make charcoal for a larger batch when
coal is scarce. Before the first quarry trip
the controller stocks food and reserves a portion for Mushroom. It returns
to feed the original dog when he is injured or due for a meal, and records the
last verified feeding so the schedule survives reattachment. The server checks
the earned iron pickaxe, bucket, shield, and original dog.

Set `MUSHROOM_EXPEDITION_STAGE=quarry-iron` to replay the iron portion in a
disposable native client. The fixture supplies the stone kit, fuel, timber
and an ore pocket beside a one-block quarry stair. The run digs and descends
the stair, clears any leaf litter that blocks the mining crosshair, collects
and smelts seven raw iron, crafts the iron pickaxe and bucket, equips the
shield in the offhand, and returns to the same seated Mushroom. The server
checks the mined ore, the player's return above the stair, the equipped
shield, and the original dog's owner and sit order. In a longer expedition,
the player can use its first iron for a shield and pack the furnace before
scouting again for the rest of the kit.

Set `MUSHROOM_EXPEDITION_STAGE=defense` with the same runner for the focused
native companion protection scenario. The disposable world stages an injured
Mushroom next to a spider beyond the player's melee reach and gives the owner
a stone sword. It verifies that the controller interrupts a proposed errand,
approaches and kills the spider in the same interruption, and keeps the
original injured dog alive. Set `MUSHROOM_EXPEDITION_DEFENSE_COVER=1` with
this stage to put tall grass in the strike's sightline. The verifier requires
that the player clear the grass, kill the same spider, and keep Mushroom at
his starting health. Set `MUSHROOM_EXPEDITION_DEFENSE_CREEPER=1` instead to
stage a creeper between the player and the injured dog. The server verifies
that the player abandons the errand and walks away before trying melee, with
the original dog, owner, and both mobs still at their starting health. The
fixture stages the danger and checks the native retreat. Use a Survival run
to verify encounters with mobile creepers and actual blasts.

Set `MUSHROOM_EXPEDITION_STAGE=feeding` to replay a meal while Mushroom is
chasing a sheep. The disposable fixture supplies mutton and waits until the
original dog has started chasing. The player holds the meat from camp to
call him back, then uses it on the dog in reach. The integrated server checks
that the same dog is alive and healed, one portion was spent, and the owner
stayed at camp.

Set `MUSHROOM_EXPEDITION_STAGE=portal` to replay the Java Nether round trip.
The disposable world stages an incomplete portal with a dry landing and a
chest with obsidian and flint. The owner starts with an iron ingot. The
controller loots the chest, crafts flint and steel, repairs the frame, lights
it, and walks in. It walks clear in the Nether,
waits out the portal cooldown, and returns with the same dog. The integrated
server verifies the repaired frame and the living original dog with its owner
in both dimensions.

Set `MUSHROOM_EXPEDITION_STAGE=nether-supplies` to replay the crossing,
then earn a blaze rod and craft powder after bringing Mushroom home. The fixture supplies a bow,
arrows, a sword, iron armor, food and a camp mat. It stages live blazes one at
a time beyond the portal. The controller finds a camp, asks Mushroom to stay,
uses ranged combat, and
returns to cover to recover if hurt. It picks up the rod and recalls the
original dog for the exit. The integrated server
checks bow use, a vanilla blaze kill, the crafted powder, and the same living dog
back in the Overworld with his Nether camp recorded.

Use `MUSHROOM_EXPEDITION_STAGE=nether-distant-supplies` to start with the
fortress beyond the portal survey. The same checks also require marking the
camp down the route before recalling Mushroom for the trip home.

Set `MUSHROOM_EXPEDITION_STAGE=nether` to play from a fresh Survival spawn
through the iron stage and a round trip. The controller can reserve a smelted
ingot for ignition and scout for a repairable ruined portal and usable chest.
It can also look for accessible gravel to supply flint. Before crossing, the
controller looks for materials, crafts and fits Mushroom's harness and padded
vest, practices stay and follow, and packs a camp mat. The integrated server
requires the original living, equipped dog with its owner in each dimension
and again after reopening the save.

Set `MUSHROOM_EXPEDITION_STAGE=nether-powder` to keep playing the fresh
Survival save through the Nether supply trip. The player earns an iron sword,
finds a fortress from observed terrain, marks a camp for Mushroom, and hunts
blazes. After recalling the dog and crossing home, the player crafts twelve
blaze powder. The server verifies the kill and crafting stats, the powder in the
inventory, and the original equipped dog after reopening the save.

Set `MUSHROOM_EXPEDITION_STAGE=stronghold` for a continuous run from fresh
Survival to the generated stronghold portal room. After the Nether trip, the
controller gathers pearls, crafts twenty Eyes, prepares a combat kit, and
follows the Eyes' observed bearings. It uses dry stairs into the stronghold
and checks on Mushroom during the descent. The native verifier requires earned
blaze powder, twenty crafted Eyes, ordinary Eye throws, twelve Eyes available
for the portal, a bow, 96 arrows, two filled water buckets, and the original
living dog with the same owner at the portal room after reopening.

Set `MUSHROOM_EXPEDITION_STAGE=end-kit` to replay combat preparation separately.
The Normal Survival fixture starts with an iron sword, raw ingredients and
nearby chickens and water. The controller hunts for the missing feather,
crafts a bow and twelve arrows, cooks rations in a furnace, and fills a spare
bucket. The native verifier checks the kill, crafting statistics, carried food
and water, and the original living dog with the same owner.

Set `MUSHROOM_EXPEDITION_STAGE=ender-supplies` to replay the transition from
blaze powder to an Eye of Ender. The flat Normal Survival fixture supplies an
iron sword, one blaze powder, and two separate covered areas. The controller
asks Mushroom to stay, uses a two-block-high shelter to fight an Enderman, picks up its loot,
and recalls the dog before crafting the Eye. Native checks require a player
kill, an Eye crafted from the earned pearl, and the original unharmed dog.

Set `MUSHROOM_EXPEDITION_STAGE=equipment` to replay crafting, fitting and
marking camp in the native client. The disposable fixture places a crafting
table and stages Mushroom and the raw ingredients. The controller crafts
black dye from ink, makes the three mod recipes, fits the harness and vest,
asks Mushroom to stay and follow, and places and marks the mat. The server
checks the same dog's ownership, equipment, sit order and camp marker.

Set `MUSHROOM_EXPEDITION_STAGE=end-entry` to replay opening and crossing a
vanilla End portal. The disposable fixture supplies one blaze rod, two
pearls, the original dog, and a portal frame with two empty sockets above
lava. The controller crafts the eyes, finds dry approaches, fills the
sockets through Use, and jumps into the portal. The integrated server
checks that the frame activated and the same living dog arrived with its
owner in the End. This replay begins in the portal room.

Set `MUSHROOM_EXPEDITION_STAGE=generated-end-entry` to test the route from a
generated stronghold corridor into its vanilla End portal. The fixture
supplies the Eyes and tools and disables mob spawning and the spawner to
exercise navigation and portal interaction. The controller uses nearby
block observations, finds dry footing for filling the frames, and crosses
from the raised approach with the original dog. The verifier locates the
structure independently and checks the original dog in the End. Add
`MUSHROOM_EXPEDITION_START_ABOVE_STRONGHOLD=1` to start above the generated
corridor and require stone mining before opening and crossing its portal.

Set `MUSHROOM_EXPEDITION_STAGE=end-camp` to continue from the generated portal
through building Mushroom's camp at the observed End landing. This fixture
adds a mat and cobblestone to the supplied gear. The controller asks the
original dog to stay, builds a roof with room for him and his mat, and
marks the mat through normal Use. The server verifies the same living,
seated dog and marked mat beneath solid cover.

Set `MUSHROOM_EXPEDITION_STAGE=end-camp-route` to walk the generated End
landing to the surface and retrace the same stairs back to camp. The
controller mines observed End stone and keeps the camp floor and roof in
place. The server verifies the exposed End surface and seated original
Mushroom at the waypoint, then verifies the same dog and camp when the
owner returns. The controller recalls the dog through normal Use and
climbs out together. The final native check requires the original dog
following near the top of the stairs.

Set `MUSHROOM_EXPEDITION_STAGE=expedition` for the complete fresh Survival
campaign. After earning its gear and reaching the generated stronghold,
the player crosses with Mushroom, builds and marks his shelter, reaches
the surface, clears the generated crystals, and fights the dragon.
The server records the original full-health dragon and verifies the
native exit before the player recalls Mushroom and brings him home.
The run finishes after a save and reopen check of the original living
dog, his owner and equipment, and the defeated dragon.

Set `MUSHROOM_EXPEDITION_STAGE=end-crystal` to replay the first combat step
with a native bow. The disposable End fixture supplies a bow, arrows, a
camp mat, a seated Mushroom under cover, and one raised End crystal. The
controller marks camp, finds the crystal from the client, and aims outside
blast range for both the player and the dog. The server checks that the
crystal broke, the bow used ammunition, and the same Mushroom stayed
unhurt beside his marked camp.

Set `MUSHROOM_EXPEDITION_STAGE=generated-end-crystals` to exercise the crystal
phase on the generated island with the vanilla dragon active. The disposable
fixture supplies a bow, arrows, armor, food, and a protected camp for Mushroom.
The controller scouts the island, watches for incoming dragon breath, and
shoots from observed positions. It eats ordinary rations to restore natural
regeneration before climbing again. The bridge's automatic melee is disabled
to keep it from attacking neutral Endermen. After damage near an Enderman,
the player tries to stand in water while recovering. It finishes its retreat
through damage before shooting again. For a guarded crystal, it surveys
a dry pillar, water landing, and clear bow trajectory around nearby towers.
It opens a side with a pickaxe and removes the pillar one supported block
at a time to keep the area dry for the arrow. If it needs the water exit,
it checks the whole column and steers back toward it when the current
pushes sideways. If knocked off the pillar, it looks straight down and
tries to place water once solid ground comes within reach. From the ground
it checks the bow arc from nearby dry
footing, including any water or blocks obstructing the opened cage. After
repeated misses at an exposed crystal it surveys both the direct and
overhead shots against the observed tower blocks.
The fixture
supplies the blocks, pickaxe, and buckets. The server checks for the removal of all ten
original crystals and verifies Mushroom's identity and health at camp. The
summary reports shot attempts, observed breaks, and the native verdict.
`MUSHROOM_EXPEDITION_RESUME=1` can take over a held crystal run in the
same world. The replacement controller checks the marked mat and original
dog, then reads the prior observations. It credits an already observed
crystal as missing only after two checks near its loaded tower, and the
server still verifies all original crystal IDs at the end.
The fixture saves a server snapshot even when the controller fails. It
lists loaded remaining crystals, whether their original spikes were
guarded, and whether the dog stayed alive at his shelter.
Set `MUSHROOM_EXPEDITION_CAGE_ONLY=1` with the same stage to start near a
guarded spike and exercise one intact generated cage. The native verdict
requires that exactly one guarded crystal broke, the dragon is still active,
and the original Mushroom is still unharmed at his marked shelter.
Set `MUSHROOM_EXPEDITION_TALLEST_ONLY=1` to replay the highest exposed spike.
The server checks that this specific crystal broke and the other nine,
dragon, and original Mushroom are still present.
With the dragon combat bridge patch applied, set
`MUSHROOM_EXPEDITION_DUEL_ONLY=1` to start a focused native duel. The fixture
clears the crystals during setup, supplies a sword and rations, and
verifies the generated vanilla dragon starts at 200 health. The controller
finds the exit fountain, approaches the visible head on a perch, and
attempts strikes through the native crosshair. It checks for active breath
clouds before walking back toward the fountain or the head. If dragon
knockback sends it high into the air, it tries to land in water using a
carried bucket. The patched bridge can place the water on the first
game tick when the ground is in range. Set
`MUSHROOM_EXPEDITION_FALL_ONLY=1` with the duel flag to reproduce the
landing from a staged 110-block fall. The server checks the actual water
source, the spent bucket, and the health of the player and original dog.
The updated bridge also scans that pool in the client and verifies the bucket
source remains in the results after flowing water is filtered out.
With the duel flag and `MUSHROOM_EXPEDITION_REFUGE_ONLY=1`, the fixture
starts an Enderman attack after the controller is ready. The controller
uses a carried bucket to make a refuge. The server verifies the hit,
water placement, and the original dog unharmed at camp.
In the full duel replay, the server verifies the dragon
died, the sword shows use, and the original dog remains at shelter.
The duel keeps a separate checkpoint with the marked mat, original dog,
client identity, and strike count. A replacement controller with
`MUSHROOM_EXPEDITION_RESUME=1` can take over a held duel in the same world,
using the same status path and duel flag.

Use `MUSHROOM_EXPEDITION_STAGE=end-return` with
`MUSHROOM_EXPEDITION_RESTORE_MANIFEST` to continue a closed copy of the
cleared crystal save. The JSON manifest needs the absolute world folder
`source` under `build/playtest-reports/`, its `seed`, the `owner` UUID,
and the original `dog` UUID. The game test opens a disposable copy and
checks the original owner, living dragon, and sheltered dog. The pilot
uses the carried equipment. When the exit opens, the server checks that
the original dragon died and Mushroom is still at shelter before the
pilot recalls him and enters the exit. The server checks both identities
in the Overworld and again after reopening. This continuation starts
with the equipment and world state from the crystal fixture.
The pilot waits farther from the fountain while the dragon is healthy and
shoots during flight. It updates its aim during the draw from observed
movement, prefers an exposed head at close range, and records a hit
only after the native health reading drops. An Enderman attack interrupts
the dragon fight so the player can take cover and recover.

Set `MUSHROOM_EXPEDITION_STAGE=eye-route` to replay using an Eye of Ender
to choose a route. The disposable fixture supplies one eye, Mushroom, and
dry footing. The controller uses the eye, measures the flight exposed by
the client, and follows that bearing. The server independently checks that
the player moved closer to the world's actual stronghold with the same
living dog nearby. The controller receives the dog's identity and learns
the direction from the thrown eye.

Set `MUSHROOM_EXPEDITION_STAGE=stronghold-approach` to check a longer
route over generated terrain. The fixture starts the player about 54 blocks
from a real stronghold, with eleven eyes, ingredients for one more, food, and
Mushroom nearby. Set
`MUSHROOM_EXPEDITION_STRONGHOLD_DISTANCE=224` to exercise a longer approach.
The controller crafts the missing Eye, observes one throw, moves sideways for
a second reading, and intersects the bearings. It takes another pair of readings after walking
toward a distant estimate and checks on Mushroom during the journey. The
integrated server verifies ordinary throws, the final position relative to
the actual stronghold, and the original living dog. This stage stops at the
surface approach.

Set `MUSHROOM_EXPEDITION_STAGE=quarry-tools` to verify tool selection at
the dirt-to-stone boundary. The disposable native fixture supplies four logs
and two reachable blocks. The controller crafts the starter kit, packs the
crafting table from under a log, uses the shovel on dirt, and switches to the pickaxe for stone.
The server checks that both blocks broke and that each tool took one point of wear.

Set `MUSHROOM_EXPEDITION_STAGE=shelter` to replay the Java sheltered adoption.
The disposable world provides a furnished house at night. The player
starts outside with an empty inventory. The integrated server verifies the
player slept inside with the door closed and woke to a living owned Mushroom
and a Field Guide.

Set `MUSHROOM_EXPEDITION_STAGE=field-sleep` to check the spare-bed route.
The Normal Survival fixture starts after dusk with the original dog, one
carried bed, and no nearby bed or hostile mobs. The verifier observes the
player sleeping in the placed bed, the resulting dawn, and the same living dog.

### Playtest bridge and server GameTests

Matrix setup refuses a dead test owner before screenshots or fixture mutations.
Preserve the original failure first. For an already-dead owner in the disposable
Overworld test save, explicitly run:

```shell
npm --prefix tools/playtest-harness run bridge -- respawn --expected-save "Codex Test Copy" --player-uuid "<original owner UUID>" --report-file build/playtest-reports/owner-respawn.json
```

This sends Minecraft's native respawn request after exact save/player checks,
then waits for the same account to be alive on the server. It refuses a living
owner, hardcore worlds, changed context, active input and an existing output report. Recovery
does not alter the original scenario verdict or prove gameplay passed. It does
not heal a running fixture. Screenshots retain a dead player's screen even when
resume was requested. Check current state before retrying an uncertain request.
The attempted request is saved before dispatch. A response/confirmation failure
exits nonzero and retains an uncertain outcome plus a final read-only snapshot
when available. An earlier input operation with unconfirmed release blocks
recovery until a normal client restart; mapped movement controls must also be
released. This command does not clear keys on the user's behalf.

Native input receipts include a bounded read-only `serverInputTrace` of actual
input-packet handling and player riding ticks. For short-exit investigations,
use ordered packet and riding events rather than assuming a polled Shift flag
captures every held state. Require `coverageComplete` before drawing conclusions
from absent events; overflow, expired scope and observer errors are explicit.
The 1024-event journal stops after 30 seconds without a validated input request.
Its post-dispatch capture differs from the receipt's pre-dispatch server snapshot;
packet events have no bridge operation ID. Apply/release-request timestamps also
differ from the eventual fresh neutral-input sample. These observations supplement
the existing movement/release proof and do not change native key durations or
gameplay. Their scheduling overhead can affect a timing-sensitive reproduction.

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

Use Fabric 1.21.11's verification mode to repeat a native case 100 times in each of four rotations. The regular build still runs the short suite on both supported targets.

```shell
MUSHROOM_SQUIRREL_TRACE_DIR="$PWD/build/squirrel-approach-verify" \
  ./gradlew :mushroom-the-yorkie:runGameTestServer -Ptarget_minecraft_version=1.21.11 \
  -Pgame_test_filter=mushroom_yorkie_gametest:squirrel_approach_game_tests_squirrel_replans_closed_approach \
  -Pgame_test_verify=true
```

This fixture confirms the squirrel has started down the original path and its body is clear before placing the wall. The trace records when the route closed and when the same squirrel climbed the alternate tree.

Fetch GameTests cover active flight steering, interruption returning to normal following, toy returns from below a platform, fractional owner heights, landing during chase/return, airborne return across native save/load, and shoreline path endpoints within pickup reach. Flight fixtures run the real fetch goal, flight controller, and native collision movement in server order. Live terrain cases additionally exercise full entity ticks, all three toys, and independent survival/creative walking/creative flying owner states.

Flight and airborne-reload fetch tests declare a 16×16 horizontal arena. Their
toys at relative x8 and cliff floor through x10 extend past Fabric's default
8×8 template. Each flight fixture checks that the pet, owner, toy and cliff footprint are inside
its declared horizontal bounds before attempting fetch, and reports ownership, native chunk
state and exact toy-query visibility if setup still fails. A loaded chunk alone
does not prove that its entities are visible. Vertical out-of-bounds remains
intentional for below-platform returns. A deliberately small-template native control verifies that rejection removes the
original pet, toy and fake owner. This changes test setup, not gameplay.

Crafting GameTests load every Mushroom recipe and check exact output/count through both native recipe matching and the crafting menu. Vanilla lime/yellow wool and modern copper-nugget controls protect the recipes that previously overlapped the mod. The 1.21.1 build converts modern ingredient strings to the older object schema from the same source definitions; native crafting runs in CI for both targets.

The Java expedition magma test starts the original owned dog on a hot
block beside usable footing, before the player has a mat. It checks that
the same dog steps off and waits alive while his owner is away.

Water GameTests check clearing existing sleep/pose on entering water, refusing new wet sleep/sit requests, refusing airborne or overhanging-edge sleep/nap until supported landing, retaining sleep on thin dog beds/slabs and the supported doghouse visual bed, resuming dry nighttime sleep, preventing synthetic fall accumulation during supported doghouse sleep without protecting an awake falling pet, requiring the low-bed approach path to end on the bed rather than adjacent floor, and reaching a dry bank with the grounded creative recovery controller and native collision movement. Night recovery controls keep the sheltered routine quiet while wet or airborne, preserve daytime/outdoor trips and daily limits, and exercise doghouse priority and dusk cancellation. The live water group adds full entity ticks, day/night, hunger, real wet interactions, and creative naps triggered by actual block placement.

Vehicle water controls run full native ticks for dry floating boats and chest
boats, genuinely submerged carts/boats, and bubble-column danger. Dry passengers
retain their sit order; real water hazards still release it. Non-fetch vehicle
owners use the shared player fixture without deleting neighboring fetch toys.
This improves isolation without claiming the older intermittent throw setup is fixed.
Boat-bank escape controls compare a swimmer trapped beneath a boat with the same
clear bank without a boat, including a close grounded creative owner. They require
dry support, restored air and normal close following. The close creative owner
stays close until witnessed healthy, supported bank arrival, then steps clear
before ordinary boarding grace expires. The original boat remains; strict native
tick, movement, health and settling checks continue. This separates bank recovery
from the reboarding restoration tested elsewhere. A breathing surface swimmer
beneath a low deck keeps ordinary following; only submerged stalled movement
triggers escape. A farther creative control requires an observed flight-to-escape
handoff. These tests sample every world tick, retain minimum air and largest
movement, and observe at least 200 ticks with 40 consecutive settled ticks within a 400-tick
bound. First recovery and later water re-entry are recorded separately. Native
dismount controls also seed old movement/steering and require owner help to clear
it for boats, chest boats and carts. Live dock sequences separately check the
complete landing and settling behavior.

The deck's initial wet-body/breathing-eyes assertion runs inside the recovery
observer's first sample. An independent delayed callback could run several
native ticks late and sample a normal dry bob instead. The shared bank/deck
observer rejects gaps in both world time and entity tick count, including its
first sample. Placement and initial deck observations record native ticks,
relative body/eye position, velocity, health/air, water flags and escape state.
This changes fixture observation timing; ordinary AI and physics remain active.
The clear under-deck following case also rejects escape activity at every sample,
not only at the start. Its brief native submergence occurs while it keeps making
progress; this expectation does not prohibit the separate trapped-boat escape.
Set `MUSHROOM_SURFACE_TRACE=1` with a native GameTest run to log structured
post-tick samples throughout this fixture; any present value enables tracing. Each row records precise seed/clock
strings, position/velocity, wet/eye flags, escape, passenger/flight inputs and
health/air. These read-only observations do not invoke or pin the controller.
An unexpected escape also logs the last 25 samples even with full tracing off.
Water/underwater flags and air describe the input retained from before native
movement. Position, velocity, grounded state, fall distance and eye-block contents
describe the result of movement. An eye block
containing water alone does not prove the eye is below the fluid surface.

Water movement fixtures record each entity's RNG seed. Use
`MUSHROOM_GAME_TEST_SEED=42 ./gradlew :mushroom-the-yorkie:runGameTestServer`
to replay that RNG stream. This does not pin the complete world or structure
origin; retained positions and source versions remain part of the evidence. The
far creative fixture keeps its owner well ashore so normal boarding restoration
after the ten-second grace does not confound the recovery observation. Boat
support alone does not satisfy the bank check; the feet need block support.

Two separate NoAI, no-gravity, position-pinned controls test the controller's
boundaries. A wet pet with breathing eyes stays idle beneath a deck for 45 ticks,
beyond the stall gate. A submerged pet alternates between two positions to keep
resetting progress, yet must release escape after 80 ticks and remain inactive
through the 40-tick cooldown. Native fluid flags are established before invoking
the controller. These artificial inputs do not prove free-swimming recovery;
the boat-bank and surface-following tests above provide that separate evidence.

Vehicle GameTests reproduce owner-assisted and creative-flight reboarding in boats
and minecarts on both targets. They prove the grace period, retained sit order,
refusal while the owner is flying, and restoration of normal boarding after
landing and timeout. Their isolated NoAI ticks test native boarding decisions;
the live vehicle group separately covers full entity/goal ticks. Water journeys,
moving-cart journeys now run in the live journeys group; natural approach/boarding
routes and reload journeys remain work in progress.

GameTests boot a scripted Minecraft server from the CLI. They are slower than unit tests, so keep them focused on behavior that needs a real world, entity registry, or server tick loop.

## Survival-mode GameTest players

Minecraft's built-in mock server player hardcodes creative mode, even after
`setGameMode(SURVIVAL)`. Use the shared `SurvivalGameTestPlayers` fixture for
inventory-consumption or return tests that depend on survival behavior. Shared
fixtures live in `src/gametest/java`; version-specific annotations and save/load
adapters stay under `src/versions/<version>/gametest/java`. They remain test-only.

## Local Playtest Harness

The Mineflayer harness in `tools/playtest-harness/` can join compatible local servers and LAN worlds for player-like smoke checks, live bot companionship, and artifact capture. Mushroom's Fabric registry sync requires a modded client. Use the Playtest Bridge for single-client play or the Fabric client GameTest below for the two-client check.

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
make bridge-use-block BRIDGE_X=0 BRIDGE_Y=99 BRIDGE_Z=0 BRIDGE_ITEM=cops_robbers:bank_kit
make bridge-count-blocks BRIDGE_X1=-8 BRIDGE_Y1=100 BRIDGE_Z1=-8 BRIDGE_X2=8 BRIDGE_Y2=106 BRIDGE_Z2=8
make bridge-screenshot BRIDGE_SCREENSHOT_NAME=playtest.png
make bridge-yorkie-smoke BRIDGE_SCREENSHOT_NAME=yorkie-smoke.png
make bridge-yorkie-home-squirrel BRIDGE_SCREENSHOT_NAME=yorkie-home-squirrel
make bridge-cops-smoke BRIDGE_SCREENSHOT_NAME=cops-smoke.png
make bridge-cops-structures-smoke BRIDGE_SCREENSHOT_NAME=cops-structures.png
make bridge-cops-visual-sweep BRIDGE_SCREENSHOT_NAME=cops-visual
```

Use `make bridge-quit PLAYTEST_WORLD="<copied save>"` for a normal client shutdown
and verify new save-completion log lines plus process exit before installing jars.
An accepted quit response is not save-completion evidence.

Startup diagnostics recognize Log4j writes on the server, render thread and
resource-reload workers. A stdout pipe write is a backpressure hypothesis; the
report records the observed threads and leaves every process running. Healthy
frame waits and unrelated file writes are not evidence of console blockage.

Restart Minecraft after installing `playtest-bridge`. The bridge binds to `127.0.0.1:57321` by default and is intended only for local development profiles.
Bridge state and terrain-scan seeds are exact signed decimal strings; keep that
type in reproduction reports rather than converting to JavaScript numbers.

Test fetch interruptions, owner mode changes, and waking or landing in the live matrix. A case budget and a seed give a replayable subset. The report records the planned order, observed cases and Minecraft profile.

```shell
node tools/playtest-harness/src/bridge-cli.js yorkie-matrix \
  --expected-save "Codex Test Copy" --group transitions --seed 119 --limit 8 \
  --report-file build/playtest-reports/java-transition-seed119.json
```

Use `--prior-report <previous.json>` to prioritize a prior gameplay finding and nearby variants within the selected group. Replay uses the recorded seed and input report SHA-256. In this mode the harness ranks observed failures and retains the same case assertions. Keep the original report alongside the new one.

Run a real Java 1.21.11 client through natural bedtime, dawn, and daytime fetches with the same dog and owner. Open a disposable copy, select an empty hand, and bring a tamed, harnessed Yorkie within reach. The runner builds a guarded course near the player, stages one named ball, and starts shortly before dawn. During play the clock advances normally. The bridge drives ordinary movement, offers a treat when the dog is hungry, and stages each fetch item six blocks ahead of the owner.

```shell
node tools/playtest-harness/src/bridge-cli.js yorkie-daycare \
  --expected-save "Codex Test Copy" --seconds 1800 \
  --report-file build/playtest-reports/java-daycare.json
```

The report records each action, native walking distance, the original dog's identity, completed fetches, consumed treats, dawns, wall time, and in-game days. Use `--client-log <path>` when a dev launcher writes its Fabric startup log outside the game profile. The report tracks bridge observations and input failures separately from gameplay assertions. A failed run retains the current view and freezes the disposable fixture for investigation.

#### Two Java clients walking a borrowed Yorkie

On Java 1.21.11, start the opt-in client GameTest from one checkout. It creates a disposable server at `127.0.0.1:57341` and prints when it is ready for the dog owner.

```shell
./gradlew :mushroom-the-yorkie:runClientGameTest -Ptarget_minecraft_version=1.21.11 -Pclient_game_tests
```

Within 90 seconds, run the owner client from a separate worktree at the same commit. Prepare the second worktree and its Gradle dependencies before starting the test.

```shell
./gradlew :mushroom-the-yorkie:runClient -Ptarget_minecraft_version=1.21.11 -Pyorkie_daycare_guest
```

The first client uses the normal Use and movement bindings as a Survival guest. The test checks that a treat is consumed while the lead stays attached, the dog and guest both move, the harness stays on, and the connected owner keeps the dog. Look for `Daycare walk passed` in the first terminal and screenshots under `mods/mushroom-the-yorkie/build/run/clientGameTest/screenshots/`. The test stops the temporary server. Close the owner client after it disconnects.

For independent input on both clients, prefix the first command with
`MUSHROOM_DAYCARE_ACTIVE_OWNER=1`. Run a client GameTest from the second
worktree with `-Pclient_game_tests -Pyorkie_daycare_owner_test` instead of
`runClient -Pyorkie_daycare_guest`. The owner equips Mushroom's vest and the
guest attaches the lead through normal client controls. The server logs both
interaction ticks and requires them to be within 15 ticks. After saving the
world, the server disconnects the owner, who reconnects and verifies the vest
in the client. The server checks the same dog, owner, vest, harness, and guest
lead. Look for `Daycare concurrent use passed` and `Daycare owner rejoin passed`.

For an extended run, prefix the first command with `MUSHROOM_DAYCARE_SOAK_SECONDS=1800`. The guest keeps walking and feeds the dog when hungry while the owner stays connected and the clock advances in the test arena. The log records the elapsed seconds and ticks, moves with the dog, treats, and dawns. Every walk checks the original dog, owner, harness and lead.

Screenshots close the active client screen before capture by default; set `BRIDGE_SCREENSHOT_RESUME=0` to keep the current screen visible. Set `BRIDGE_SCREENSHOT_HIDE_GUI=1` and `BRIDGE_SCREENSHOT_CLEAR_CHAT=1` for clean visual inspection captures.

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
make modrinth-autoplay-yorkie-home-squirrel PLAYTEST_TEMPLATE_WORLD="Clean Template" BRIDGE_SCREENSHOT_NAME=yorkie-home-squirrel
make modrinth-autoplay-yorkie-visual PLAYTEST_TEMPLATE_WORLD="Clean Template" BRIDGE_SCREENSHOT_NAME=yorkie-gallery
make modrinth-autoplay-yorkie-biome-scout PLAYTEST_WORLD="New World (21)" BRIDGE_SCREENSHOT_NAME=yorkie-biome-scout
make modrinth-autoplay-yorkie-natural-gallery PLAYTEST_TEMPLATE_WORLD="New World (21)" PLAYTEST_WORLD_PREFIX="Codex Yorkie Natural" BRIDGE_SCREENSHOT_NAME=yorkie-natural-gallery
```

The Yorkie scenario checks duplicate-claim blocking, treat taming, owner sit/follow commands, harness equip/removal, lead rejection without a harness, exact treat/toy/player-food need changes, sheltered nighttime sleep, double-click wake-up, exact shelter cleanup, dog food and water bowl use, same-day bowl refill rejection, outdoor potty relief, screenshot capture, and positive lead attach with the harness equipped.
The Yorkie home-and-squirrel scenario verifies that Mushroom walks fully into the softly lit doghouse and curls up visibly, a squirrel reaches a tree, Mushroom starts the chase and returns after 30 seconds, and he returns early when a tree-less squirrel gets more than 24 blocks from the player. It captures focused doghouse and chase screenshots and records the squirrel's tree state in the JSON report.
The Yorkie visual sweep captures gallery-ready scenes for sitting, a fence-tied leash walk, nighttime sleep, water, fetch, flying, food and water bowls, wants-outside messaging, sheep chasing, and hostile spider defense.
The Yorkie biome scout samples real worldgen in an existing save, records seed/coordinates/biomes, and captures review screenshots for natural outdoor staging candidates.
The Yorkie natural gallery scenario copies the scouted save and stages Mushroom at saved real-biome coordinates for outdoor sitting, leashed, water, fetch, flying, bowl, chase, and hostile-defense screenshots.

Run Cops and Robbers' richer live bridge scenario against a disposable world:

```shell
make modrinth-autoplay-cops PLAYTEST_TEMPLATE_WORLD="Clean Template" BRIDGE_SCREENSHOT_NAME=cops-smoke.png
make modrinth-autoplay-cops-structures PLAYTEST_TEMPLATE_WORLD="Clean Template" BRIDGE_SCREENSHOT_NAME=cops-structures.png
make modrinth-autoplay-cops-visual PLAYTEST_TEMPLATE_WORLD="Clean Template" BRIDGE_SCREENSHOT_NAME=cops-visual
```

The fast Cops scenario checks item registration, the cruiser/fire truck/cop/fireman/teller entity registrations, cruiser mounting, mounted cruiser robber capture, jail dropoff conversion into a jailed robber, bridge state assertions, and screenshot capture.
The Cops structures scenario checks real item-on-block police station, fire station, and bank kit placement, signature generated block counts, teller/fire crew spawning, robber vault theft, firefighter extinguishing, mounted fire truck water-cannon extinguishing, and screenshot capture.
The Cops visual sweep builds a clean high-altitude stage, captures HUD-free lineup, mob skin closeup, vehicle closeup, police station front, fire station front, bank front, and overview screenshots, and uses real kit placement for the buildings.

This uses Modrinth's `modrinth://launch/instance/<instance-id>?singleplayer_world=<save-folder>` deep link and avoids clicking through the launcher UI. The template save must not be the currently open world.
The launcher script uses `open -g` by default so Modrinth is not deliberately activated during launch. Minecraft can still grab mouse/keyboard focus when the game window starts or enters relative-mouse mode; press Escape to release it, or set `MODRINTH_OPEN_BACKGROUND=0` if you want the client to come forward intentionally.
The launcher also sets `pauseOnLostFocus:false` by default so singleplayer test worlds keep ticking when Minecraft is not frontmost. Set `PLAYTEST_DISABLE_PAUSE_ON_LOST_FOCUS=0` to leave that profile option unchanged.
If Modrinth was not already running, the launcher re-opens the deep link after a short cold-start delay because the app can otherwise receive the URL before its state is initialized. Set `MODRINTH_STARTUP_RETRY_SECONDS=0` to disable that retry.
Set `PLAYTEST_SCREENSHOT_DELAY_SECONDS=0` to skip the default post-smoke screenshot delay.
Set `BRIDGE_REPORT_FILE=build/playtest-reports/<name>.json` to save the full bridge scenario result for later debugging instead of relying only on terminal output.

## State-combination testing

The [Mushroom state matrix](../tools/playtest-harness/README.md#mushroom-state-matrix)
defines 490 cases: 144 combinations, 40 interruption/owner-mode/flight/feeding/tree-approach sequences, 36 terrain cases, 20 outdoor-care sequences, 22 water/rest sequences, eight sleep-spot controls, 100 dry vehicle cases (96 full-entity sequences plus four controlled boarding-refusal challenges), 112 controlled water/rail journeys (including 16 actual offshore immersion controls), and eight native exit-to-shore sequences in a disposable live world. It preserves partial failure
reports. Run `npm --prefix tools/playtest-harness test` for the harness's runner,
command-rejection, and save-safety regression tests. These tests also run in CI.
Gameplay assertions still need the live Minecraft client and bridge. Matrix
sprints and vehicle frozen steps wait on native gametime, not the server counter
that keeps increasing during a frozen world. Clock-wrap and stalled-world controls
run in the Node suite; snapshots include a tickAudit for completed waits. Journey
interactions also verify actual supported owner placement and ordinary
interaction reach. The bridge's decimal-coordinate teleport avoids native integer
coordinate auto-centering; invalid placement/reach is a setup failure.
Vehicle journeys record bounded motion requests during 30 frozen native travel
ticks and require two blocks of actual movement before the owner action. Offshore
controls sample every tick and stop after three blocks to retain departure room;
dock and rail controls sample every five ticks. Short travel is a setup failure,
even when the movement command succeeded.
Controlled water journeys have a submerged sea-lantern floor to prevent native
freezing in cold high-altitude arenas while retaining the biome, depth and sky.
The harness audits all 36 source cells, native block light >=10, false native
freezing eligibility, and complete bottom/wall support before travel, at travel
samples, before owner action and at the end. Light setup settling is bounded and
does not advance world ticks; changed water is never silently refilled mid-case.
Invalid environment stays a setup failure; existing pet-health assertions keep
priority. Earlier unexplained short trips are not retroactively attributed to ice.
Dock owners stand on the inner quarter of the first dry bank column, within
survival reach of a short valid trip. Actual support and reach remain setup guards;
the fixture does not move the pet or hull to satisfy them. Elevated takeoff keeps
the original point outside the nighttime doorway lintel.
The `native-shore` group separately uses ordinary native keyboard exit and walking,
with empty-hand pet help at survival reach. It verifies floor/headroom, pool
water/walls/bottom and a half-block bank step before movement, and watches fixture boundaries while keys
are held. A following pet must have 40 final consecutive native world samples
dry, grounded, fully breathing and near the owner, with actual block support at
the end. Dry sitting also requires full air, bounded movement and support on
audited blocks or the original hull; normal reboarding after 200 native world ticks
is permitted. The group records observed wet contact without guaranteeing wet-sit
coverage. Help's first native tick is inspected while frozen. Walking still uses
polling, so a transient contact between samples is an explicit limit. Native AI,
collision, gravity and damage remain active. These cases
preserve possessions and disable success-only inspection care. A defined case
count is not a completed full sweep. Investigative failures retain a frozen
fixture, owner mode and time; they do not receive the usual creative/day reset.
Player ticks can still advance while frozen. Confirm owner safety and resume
world ticks explicitly before new native input.
Failure screenshots keep the current view, screen, HUD and chat. They never aim
the camera with an owner teleport: even a same-position teleport can dismount a
rider and reset native physics. The frozen actor snapshot and current-view image
remain available together for diagnosis.
Eight squirrel starts around a partly blocked tree sample every native world tick,
retain the original healthy squirrel, require first clinging within 100 ticks,
and require 40 consecutive safe clinging ticks within a 400-tick bound. The live observer starts measuring horizontal
travel after a half-block rise within 1.25 horizontal blocks of the expected trunk; more than three blocks of travel or
more than one block of lost height fails even when the squirrel eventually
reaches safety. Ordinary contact hops remain allowed. Every case preserves its
per-tick trace and native clock audit, then unfreezes the world during cleanup.
These are gameplay observations, not success-only pet care.

Native GameTests additionally cover eight approach positions, bound horizontal
travel from the actual goal's climb handoff, and remove a climbed tree to require
released gravity and a real landing. They run complete entity ticks without
post-start positioning, manual goal ticks, NoAI gameplay substitutes or forced
success flags. Set `MUSHROOM_SQUIRREL_TRACE_DIR=/absolute/output/directory` alongside
`MUSHROOM_GAME_TEST_SEED=0` to save optional per-tick route reports. The trace reads
selected goal/path/movement state through test-only reflection and never changes
it. CI runs the behavioral assertions without writing optional trace files.
Five additional live squirrel controls check an enclosed nearer tree with an
accessible farther tree, the same nearer tree without its enclosure, the farther
tree alone, a route enclosed after walking starts, and an enclosed face with
another usable face. They share the per-tick observer and check which tree the
original squirrel reaches. Route closure verifies ground progress and body
clearance before adding the wall; invalid staging is a setup failure. Native
controls also require normal avoidance and berry tempting when no tree is
reachable, including known enclosed-tree threats. A stationary Mushroom fixture
has NoAI only to isolate squirrel avoidance; the squirrel keeps full AI, gravity,
collision and damage. Optional native traces include ordinary-goal positions,
path targets, reachability and per-process path identities. Repeated path
requests do not prove repeated full planning; vanilla can retain one cached path.
Three stepped live routes add a real one-block rise and drop at different approach
timings. The owner is moved outside the raised strip before blocks are placed,
and the trace must contain genuine airborne movement before tree contact. Normal
raised-platform travel is approach movement, not circling during a climb. Native
step controls require an uninterrupted selected approach and observed airborne
ticks; the native goal and live near-trunk distance metrics remain distinct.
Native squirrel save/load controls serialize the real entity with the matching
version's NBT API. With the trunk intact, the original UUID must resume healthy
clinging without fall damage. With the trunk removed before reload, no-gravity
must release and the same squirrel must demonstrate normal free fall and land.
The removed-tree control allows ordinary fall damage; no actor receives immunity
or healing. This proves entity serialization/recovery, not a client-world restart. A changed-lower-face control places a solid block below the original perched body before native serialization and requires full health, unchanged height and no move to another face. A top-log removal control after reload checks that the original support log still owns the perch. Four additional full-AI controls remove a remote ground log or the supporting middle log before/after native reload: both modes keep a still-supported perch and both release a missing supporting column. Modern native serialization asserts that the save/load problem collector stays empty. Artificial saved-flag boundary inputs place the initial squirrel just outside horizontal contact, above a log, or on a short column; normal native ticks must clear no-gravity, fall and land. These are rejection controls, not observed natural climbs. The live `yorkie-squirrel-restart` command separately checks a fresh real climb across a normal client-world saved restart, with optional lower-face placement.
Two live ascent-interruption controls place a solid block above the original
squirrel only after verified west-face climbing and body clearance, or retain the
same open route. They sample every native tick and require 40 healthy recovered
perch ticks within 300 ticks. Invalid staging is separate from a failed recovery.
Native controls repeat this change during ascent and below an established perch;
the latter must retain full health and height. Four controlled native sprint
attacks require empty-hand charge, actual reach/line of sight, damage and recovery.
The synthetic player fixture drives native player doTick once per world tick;
the squirrel uses full normal entity ticks. Separate controls keep an ascent
when its canopy opens or already-passed face changes, and retain a perched
squirrel when terrain below it changes. The attack assertions require newly supplied attacker-directed native momentum, climbing released on the first tick, movement away from the attacker by two ticks, and actual horizontal movement by ten ticks. A declared 16-block arena keeps the impulse away from the small template boundaries. Perched hits must accumulate ordinary native fall distance and may take only observed native landing damage; unrelated damage or healing fails. Immediate saved-hit controls also require their expected landing damage. Two controls save/load immediately after a real hit, preserving the hurt timer, momentum and original UUID. Four live command-driven hurt controls separately check both directions during ascent and while perched, including native velocity evidence, safe source reach, full normal AI, real falling and bounded re-clinging. These are controlled native damage commands, not client mouse attacks.
Successful matrix runs persist their original case observations before separately feeding
and healing the same tagged pet for inspection. The postRun record is maintenance,
not gameplay evidence; its failure cannot turn a case failure into a pass. Failed
or interrupted runs never receive this care.

The standalone `yorkie-smoke` also requires the exact copied save and a single local
Overworld player. Each summon uses fixed arena coordinates, checks the grass support
and air at that cell, then observes the new Yorkie's UUID, health and native ground
contact before interacting. Starting with a steep camera angle must produce the same
supported placement. For the night case, the runner waits for that same Yorkie to
settle into a grounded sit. It places the roof above the pet's native block position
and anchors every wall to that cell. Missing support, a misplaced spawn or a failed
shelter placement is a setup failure that retains its observations.
The smoke checkpoints original steps and, only after success, feeds/heals
the same tagged live pet for inspection. Raw observations stay unchanged; maintenance
has a separate verdict and preserves UUID, harness, leash, vehicle and native possessions.
Missing/dead/unverified fixtures and failed/interrupted runs are never repaired by care.

## Current Automated Coverage

Native client input has separate lifecycle and request tests. They cover exact
duration followed by a neutral tick, overlap, safe retry, stale cancellation,
context loss, wall timeout, shutdown, adapter failure and bounded unconfirmed
release. Harness controls reject wrong identity, unapplied native buttons and a
stalled server clock, and cancel by a known operation ID if acceptance is lost.
The [native input CLI](../tools/playtest-harness/README.md#bounded-native-client-input)
records actual input and displacement; accepting a key request alone does not
prove a walking or rowing scenario. The short dismount mode additionally proves
native Shift press/release, a client exit and the original server player on foot
with its shift flag released. A pending server acknowledgement, another vehicle
or missing source cannot pass on key acknowledgement alone. These controls do
not add matrix cases until explicit gameplay sequences use them.
The `jump` input mode holds the native jump key for 2–5 client ticks, optionally
with directional input. It requires a grounded, dry, on-foot, non-creative owner,
with no recent hurt, climbing or active effects. The native launch witness needs
an owned grounded press, upward velocity, airborne rise over 0.05 blocks and no
vertical collision at launch. A later rise after release cannot create that
witness. The starting client/server heights must agree within 0.125 blocks.
The server-origin snapshot must be fresh within one second, and a receipt's
server observation interval must fall inside the recorded input ownership window
to confirm accepted airborne rise. Later reads cannot supply missing proof.
Minecraft accepts player movement packets; this server observation confirms its
accepted position, rather than separately computing player physics. The driver
retains both observations even if the player later lands. A safe landing and any
later collision still need scenario assertions. Read-only player ground/water,
climb/effect/hurt state, crouch/pose, collision, step-height, velocity and precise
position fields help diagnose blocked movement.

Nearby living-entity snapshots also retain native air, accumulated fall distance,
hurt timer and recent damage type for diagnosing a health change. These fields
do not change damage rules, and unavailable retained history cannot identify the
cause of an older hit.

NARwhal Together:

- target cycling selects the first target when no previous target exists
- target cycling advances to the next target
- target cycling wraps back to the first target
- target cycling recovers when the previous target left the game
- empty target lists are rejected

Mushroom the Yorkie:

- live Modrinth bridge smoke covers duplicate-claim blocking, treat taming, sit/follow, harness on/off, lead gating, exact toy/player-food effects, sheltered sleep/wake, dog food/water bowl consumption, same-day bowl refill rejection, outdoor potty relief, cleanup, screenshot capture, and lead attach
- live Modrinth home-and-squirrel bridge scenario covers doghouse sleep and lighting, squirrel tree seeking, chase start, the exact 30-second give-up, the tree-less 24-block safety recall, and focused screenshots
- live Modrinth bridge visual sweep captures sitting, leash, sleep, water, fetch, flying, bowl, wants-outside, passive chase, and hostile defense screenshots for gallery review
- live Modrinth bridge biome scout records seed, coordinate, biome, water/tree/height signals, and review screenshots for real-worldgen Yorkie staging locations
- live Modrinth bridge natural gallery stages saved real-biome coordinates and captures outdoor sitting, leashed, water, fetch, flying, bowl, chase, and hostile-defense gallery screenshots
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
- headless GameTests verify native carried-toy save/load, named item components, whole-stack return, repeated interruptions without duplication, guaranteed real-toy drops after environmental death, and real-versus-free-copy custody across owner mode changes, and full/partial creative-inventory wait-and-resume behavior
- saved-restart live runner checks the ball, chew toy, or bone across a normal client shutdown and relaunch, including player/carrier identity, jar hashes, and inventory/ground/held-item conservation
- headless GameTest verifies Mushroom's custom entity can spawn in a Minecraft test world

Cops and Robbers:

- live Modrinth bridge smoke covers item registration, all core Cops entity registrations, cruiser mounting, mounted cruiser robber capture, jail dropoff, jailed robber state, and screenshot capture
- live Modrinth bridge structures smoke covers real kit item use, generated station/fire station/bank block signatures, teller and fire crew spawning, robber vault theft, firefighter extinguishing, mounted fire truck water-cannon extinguishing, and screenshot capture
- live Modrinth bridge visual sweep captures clean mob skin, vehicle, police station, fire station, bank, and overview screenshots for visual regression review
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
- police station, fire station, and bank kits place expected structures
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
- [ ] Three copper ingots in a V shape craft a Dog Bowl; Dog Bowl plus Yorkie Treat creates a Dog Food Bowl; Dog Bowl plus Water Bucket creates a Dog Water Bowl.
- [ ] Mushroom eats one placed Dog Food Bowl per Minecraft day, drinks one placed Dog Water Bowl per Minecraft day, and each filled bowl becomes an empty Dog Bowl.
- [ ] Owner can feed Mushroom normal edible player food, and his food bar improves.
- [ ] Mushroom's food bar drains while following and drains much more slowly while sitting.
- [ ] Mushroom can starve only while the owner is nearby enough to care for him.
- [ ] A lost loaded Mushroom that has not been near the owner for a full Minecraft day returns to the player's bed after successful sleep when not already near the bed.
- [ ] Mushroom only whines for food when at least one dog bowl has been placed nearby and no filled food bowl is available.
- [ ] At night indoors, Mushroom walks to a nearby Dog Bed before curling up.
- [ ] At night, Mushroom walks fully into a nearby Mushroom's Doghouse, remains visible through the doorway, and curls up under its warm light.
- [ ] At night, waking Mushroom and then ordering him to sit leaves him seated without floor-shuffling.
- [ ] During daytime, Mushroom can rarely do a short bum-shuffle while not ordered to sit.
- [ ] When Mushroom needs outside, he relieves himself once per Minecraft day after a few seconds under open sky.
- [ ] In a cave base with a closed door, Mushroom circles the door; with an open reachable path, he searches toward outside instead.
- [ ] With debug messages enabled, the baseline state wraps into readable chat lines and outdoor relief emits `potty_relieved`.
- [ ] Calming peaceful-mob barking with a treat makes nearby passive mobs stop triggering repeat barking.
- [ ] A squirrel continually seeks a nearby reachable tree; Mushroom barks and chases it for no more than 30 seconds, then gives up without immediately restarting.
- [ ] The Squirrel Spawn Egg has its own russet, cream-speckled, bushy-tail artwork rather than reusing Mushroom's egg.
- [ ] Squirrels naturally spawn in small groups on valid peaceful-animal ground in biomes that already spawn rabbits, foxes, wolves, ocelots, pandas, or parrots.
- [ ] If a squirrel has not found a tree and gets more than 24 blocks from the player, Mushroom gives up early and returns instead of following it farther away.
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
- [ ] Bank, fire station, and police station kits place their expected structures.
- [ ] Robber capture, jail release, and gold recovery messages are understandable.
- [ ] Fire truck and fire response behavior do not spam logs or chat.
- [ ] No errors attributed to `cops_robbers` appear in the latest log.
