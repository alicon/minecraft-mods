# Mushroom The Yorkie

## Expedition vest

Craft a Padded Yorkie Vest with wool, leather and string. Use it on your
harnessed Mushroom. Leather repairs the padded vest. Use an armadillo scute on
the padded vest to add plates and use another scute to repair the plated vest.
Shears unclip it and return the vest with its current wear.

The padded vest absorbs up to 30% of impact damage and the plated vest up to
50%. Falls, projectiles, melee hits, and explosions can wear it out. Lava and
other sustained hazards still hurt. Watch for cracks and an action-bar warning.
A worn-out vest stays on the harness and accepts repairs.

## Java wake-up recovery

With the default one-dog setting, sleeping keeps a known living Mushroom
even while his chunk is unloaded or he is in another dimension. In the
default respawn mode, he can be replaced after a confirmed death. Existing
companions are recorded as their chunks load after updating.

## Expedition camp and crossings

Craft a camp mat with two wool blocks and string. Put it on solid ground in
your shelter with Mushroom nearby. In Java, use the placed mat with an empty
hand. In Bedrock, placing the mat marks the camp. He remembers one camp at a
time, even when you quit or travel.

When he retreats, he looks for a safe path to the marked mat. If the mat has
been moved or the path is unsafe, he tries to stop on safe ground. He waits for
you to come back. In Java, a following Mushroom also tries to step off magma
and wait on safe ground before you have marked a mat. Magma can still hurt him.
While he follows a Survival player on foot in Java, he also checks where his
next stride would land. At a cliff bend, he can stop and bark before momentum
carries him off the ledge. Give him supported footing to continue.
In Bedrock, build his retreat path on one level. Return to
within two blocks to call him back when it is safe. In Java, you can also use
an empty hand to recall him from a few steps away.

He barks at crossings with a drop on both sides. Widen the bridge or take a
safer route. He can warn the player holding his lead as well.

In Java, Mushroom leaves neutral mobs such as zombified piglins alone until
they target him or his owner.

Hold meat, fish, or a Yorkie Treat to pause a scent trail and give Mushroom
a chance to come close for feeding.

## Field Guide and Leave it

The first Survival adoption gives the player a Field Guide. Craft a
replacement with a book and string. Hold it and use the normal Use/Interact
binding to read it. Crouch and use it to cue the closest owned Mushroom within
16 blocks. The book opens to the next exercise for that dog. The final page
records the locations where he earned his paws.

Call him while he is chasing a squirrel in sight. Wait for him to turn back
and come within two blocks, then use a Yorkie Treat on him. Try again with a
different squirrel. After two paws, stand beside him and cue him to heel.
Walk past a squirrel on a new trail, keep him close, then cue again to release
him. Earned paws belong to the dog and survive rejoining and dimension travel.

If he misses a cue, try again in the open with him awake and off the lead.
A borrowed lead stays with its handler. An unfinished cue expires or clears
when you leave the world, so you can start the exercise again on another day.

## Water and vehicle recovery

Owner-assisted dismount clears movement queued at the old seat so a sitting
Mushroom can stay on his new landing spot. The sit order and boarding grace are
preserved. Ordinary gravity, collision and fall damage still apply.

When his eyes are submerged and he makes no progress for 20 ticks beneath a
boat or other low overhang, Mushroom searches up to three blocks for a reachable
clear water column. He swims around the obstruction, resumes following once he
can breathe, and replans a stalled escape. Four failed columns or an 80-tick attempt release control
for a 40-tick cooldown before another attempt. Native collisions, buoyancy and damage
remain active. This also helps stalled recovery near a grounded creative owner;
owner-directed flight and airborne fetch retain control.

## Gameplay Configuration

`mushroom_yorkie.json` is generated in the Fabric config directory. Values that change gameplay are centralized in `MushroomYorkieConfig` and exposed through small value objects so entity code reads tuning, not raw JSON fields.

`debugMessages` is the broad playtest diagnostic switch. When enabled, Mushroom reports custom behavior states through throttled, separately wrapped chat lines and matching log lines: scenting, potty warnings, sleep/night stir, peaceful mob barking, hostile hesitation, untamed spacing, creative flight, treats, harness, sitting/following, and baseline state. Leave it off for normal play.

Structure scenting lets a tamed, following Mushroom occasionally catch a strong scent from nearby generated structures. It is intentionally a kid-readable guide, not a compass UI: Mushroom barks, leads, waits when the player falls behind, comes back if the player loses him, can optionally lose the trail around water or steep terrain, and celebrates at the destination. The default range is intentionally short, from 80 to 192 blocks, so Mushroom only nudges players toward discoveries that are just out of sight. Scenting automatically pauses for creative-mode owners so kids can build without being pulled away; an empty-hand click to make Mushroom sit still also blocks scenting.

Domestic care adds a few home objects without turning Mushroom into a chore machine. Three copper ingots in a V shape craft an empty dog bowl. Food bowls are made from a dog bowl plus a Yorkie Treat, and water bowls from a dog bowl plus a water bucket. Mushroom can eat one food bowl and drink one water bowl per Minecraft day; each filled bowl turns back into an empty bowl when used. Owners can also feed him normal edible player food in an emergency. His visible food bar counts down like the player hunger bar when he is following and much more slowly when he is sitting or sleeping. Starvation damage only applies when the owner is nearby enough to care for him; if he has been lost from his owner for a full Minecraft day and is not already near the bed/spawn area, the next successful sleep brings him back to the bed. He only whines about food after a bowl exists nearby, so new worlds do not start with surprise hunger nags. A dog bed gives him a nighttime place to curl up. Night sleep and creative naps use an exact path to a sleep spot, so navigation cannot finish on the floor beside a low bed. A starving, following Mushroom can wake for an available daily food-bowl meal and settle back to sleep afterward; an explicit sit order and the one-meal-per-day limit still apply. Night sleep only runs in dimensions with a natural sky and day/night cycle, so the Nether and fixed-time dimensions do not make him sleep. A following Mushroom transfers with his owner between dimensions, while one explicitly told to sit stays behind. White wool, lime dye and string craft the throwable ball; white wool, yellow dye and string craft the chew toy. The string keeps these recipes distinct from ordinary dyed wool. Both toys and vanilla bones can be right-click thrown, and dropped balls, chew toys, or bones are fetch targets. If a fetch is interrupted by sitting or sleep after pickup, Mushroom normally drops a carried real toy beside him instead of losing it. Real toys return even if the owner changes game mode during the fetch; if a creative owner’s inventory fills up, Mushroom holds the remainder and asks for room, then finishes the return when space is available. This also survives sitting, sleep, and reload, so vanilla creative pickup cannot immediately delete an overflow drop. A survival owner’s overflow drops beside them as usual. Creative throws retain the original inventory item; their free play copies cannot be collected into inventory and disappear when the fetch ends or is interrupted, even after mode changes. A toy in transit is stored in Minecraft’s native hand equipment, so its item data survives saving and reloading and Mushroom can resume returning it. If he dies while carrying a real toy, it drops as a guaranteed possession rather than random mob loot; a free creative copy does not add another item. Mushroom can fetch toys from open water, but skips submerged or covered water toys that do not leave air for him to surface. Shoreline paths finish close enough to collect the toy. While the creative owner is flying, Mushroom follows the active fetch route instead of hovering beside the owner. He uses collision-checked ascent routes to bring toys back from below a ledge, and keeps that safe route if the creative owner lands during the chase or return. The same safe return resumes after saving and reopening, including when the creative owner has already landed. He resumes normal following when the fetch ends. Survival fetches still refuse unsafe drops.

Mushroom wakes and refuses sitting, nighttime sleep, and creative building naps while in water or a bubble column. Nighttime sleep and creative naps wait for a dry landing with support under his feet, so a surface jump or partial bank contact cannot stop his return halfway out. When recovering from water for a grounded creative owner, he uses the same collision-checked ascent routing as fetch and aims for the owner's standing position, so a solid bank does not leave him hovering below the floor. The doghouse retains its quarter-block visual bed position over a solid floor; that anchor does not permit sleeping over unsupported water. A sheltered nighttime routine keeps outside requests quiet during water recovery and brief jumps; safe sleep still waits for dry support. Once established from dry ground, resting on its visual bed does not accumulate fall damage at dawn; awake airborne pets retain normal fall behavior. Normal airborne following keeps its usual offset.

A dry Mushroom keeps his sit order while riding a floating boat, even when his
seat position falls inside a water block. Actual immersion and bubble columns
still cancel rest. An empty-hand owner interaction helps him out without changing
his sit/follow order; if the dismount then puts him in water, wet safety releases
the order so he can swim to dry ground. Owner help or creative takeoff gives him ten seconds before
he can automatically board again, so the player has time to move away. Automatic
boarding also stays blocked while his creative owner is flying. Ordinary boarding
returns after landing and the grace period; this does not permanently disable
boats or minecarts. The short grace period is transient native state and is not
preserved across reloads.

Mushroom's Doghouse is a larger nighttime sleep spot with an open front, a red bed and white pillow, a tiny warm lamp, cherry walls, a dark-oak peaked roof, flowers, and a crossed-bone sign. It has no collision so Mushroom can walk fully inside and remain visible through the doorway. At night, a nearby doghouse is preferred like a dog bed and counts as shelter while he is curled up inside.

Squirrels spawn naturally anywhere the biome already supports rabbits, foxes, wolves, ocelots, pandas, or parrots, including compatible modded biomes, and are also available from a squirrel-specific creative spawn egg. They use normal peaceful-animal ground and light rules and appear in small groups of one to three. A squirrel continually searches for a reachable nearby tree, runs to the closest usable trunk, scampers several blocks upward, and clings there. When leaves cover the upper trunk, it chooses a reachable height below the canopy rather than climbing endlessly into the leaves. If a low branch or impassable wall blocks the nearest approach, it tries other faces with native ground paths before rejecting that tree. A standable face behind a wall does not count as reachable; an accessible farther tree can be chosen instead. Tree search checks reachability without replacing another goal’s active route. During approach, it rechecks the path no more than once per ten game ticks, including the last short step. A native jump or short drop keeps the existing approach until landing, when ground pathfinding can assess the route again. A failed path releases that approach for a fresh choice; a still-incomplete approach has a ten-second limit so it cannot hold control forever. It walks to the selected face, finishes the short final approach precisely, then uses slower horizontal steering into the trunk center while native collision provides the climb. It does not ask spider navigation to find a new ground route or steer toward a trunk corner during ascent. During ascent it checks the remaining corridor to the original target. A new obstruction ahead releases the climb so it can land normally and choose another reachable face. Opening a taller route or changing already-passed terrain keeps the current ascent. Changing the old route below an established supported perch does not force a needless fall. Removing the trunk releases clinging and restores normal gravity. After entity save/load, an intact perch is reclaimed from the current body and actual log collision shape. The body must be clear and off the ground, touch a log at the reached height, and have at least two continuous log blocks below that contact. Holding and restoring a perch use the same rule. A changed lower approach or a removed ground log farther below that support does not make the squirrel fall. Removing the touched log or either of the two supporting log blocks releases normal falling. A missing or blocked perch releases the saved no-gravity flag; it does not protect an ordinary fall. With AI active, a command-set no-gravity flag away from a valid perch is also released. A native hit releases squirrel climbing and clinging before steering can erase the impulse. Tree seeking waits until the hurt reaction ends and the squirrel lands; ordinary knockback, gravity and fall damage remain active. Saving immediately after a hit keeps that reaction instead of reclaiming the perch. Mushroom prioritizes squirrels over ordinary passive animals, barks while chasing for at most 600 game ticks (30 seconds), remembers a squirrel after giving up so he does not immediately restart, and returns to his owner. A squirrel that has not climbed a tree also ends the chase early if it gets more than 24 blocks from the player. Treats still calm barking at sheep, cows, axolotls, and other passive friends, but do not suppress this deliberately bounded squirrel chase.

Potty warnings happen at most until one outdoor relief per Minecraft day. If Mushroom is indoors and needs outside, he first looks for a reachable sky-visible outdoor block; a closed cave door naturally leaves him circling the door, while an open path lets him keep searching toward outside. Once outside, he waits long enough to finish before following an indoor owner back home. An already-started trip continues if ordinary need decay lowers the warning meter; sit orders and flight/sleep priorities still cancel movement. After a few seconds under the sky he resets his potty need and emits a debug `potty_relieved` state when diagnostics are enabled. Calming peaceful-mob barking with a treat remembers nearby passive animals so Mushroom does not immediately restart barking at the same axolotls, sheep, cows, or other friends.

- `structureScentingEnabled`: turns the behavior on or off.
- `structureScentMessages`: shows actionbar prompts such as `Follow Mushroom!`; keep this on for younger players.
- `structureScentDebugMessages`: legacy scent-only debug flag. New configs should use top-level `debugMessages`; this field is still read for compatibility.
- `structureScentCanLoseTrail`: allows water, steep terrain, and failed paths to interrupt the scent. This currently defaults off because losing the trail was too frustrating during kid playtests.
- `structureScentMinDistanceBlocks`: prevents Mushroom from scenting things already close enough to stumble into. Defaults to 80.
- `structureScentMaxDistanceBlocks`: caps how far structure lookup searches; higher values find rarer structures but make searches heavier. Defaults to 192.
- `structureScentCooldownTicks`: delay between structure searches per Mushroom; this protects normal server ticks from repeated locate-style work.
- `structureScentLeadAheadBlocks`: how far Mushroom runs ahead before waiting for the player; keep this short because Mushroom is tiny and easy to lose visually.
- `structureScentCircleBackIntervalTicks`: how often Mushroom breaks from leading and returns near the player so he stays visible.
- `structureScentCircleBackTicks`: how long Mushroom spends circling back before leading again.
- `structureScentCircleBackDistanceBlocks`: how close Mushroom comes back toward the player before heading off again.
- `structureScentFoundDistanceBlocks`: how close Mushroom must get before celebrating and ending the behavior. Defaults to 32.
- `structureScentBarkIntervalTicks`: bark cadence while leading, waiting, or recovering the scent.
- `structureScentRecoveryTicks`: how long Mushroom sniffs around before giving up after losing a trail.
- `structureScentMaxTrailRiseBlocks`: vertical terrain change that can break the scent, used to make mountains feel like real obstacles.
- `structureScentTargets`: enabled target ids. Defaults are `village`, `woodland_mansion`, `pillager_outpost`, `swamp_hut`, and `ruined_portal`. Underground-only structures such as `trial_chambers` are intentionally disabled by default because they do not fit the surface scent fantasy.
