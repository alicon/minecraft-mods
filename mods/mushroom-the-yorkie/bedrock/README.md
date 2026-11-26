# Mushroom the Yorkie for Bedrock

This development add-on targets Bedrock 26.60 and newer. Verify the current stable patch on an official Windows or mobile client before publishing a supported version. Use a new Survival world or a disposable copy for test builds.

## Build and import

From the repository root:

```shell
python3 scripts/build-bedrock-addon.py mushroom-the-yorkie
python3 -m unittest discover -s scripts/tests -p 'test_build_bedrock_addon.py'
```

Open the generated `build/bedrock/mushroom-the-yorkie-bedrock-*.mcaddon` on a Bedrock device that supports file import. In the test world's settings, activate **Mushroom the Yorkie (Behavior)** and check that **Mushroom the Yorkie (Resources)** is active. Enable the content log when testing on a device that exposes the creator settings.

## Play on Windows, iPhone, iPad, or Nintendo Switch

On Windows, open the downloaded `.mcaddon` with **Minecraft for Windows**. On iPhone or iPad, open the downloaded file and choose **Open in Minecraft**. In a new Survival world, activate **Mushroom the Yorkie (Behavior)** and confirm **Mushroom the Yorkie (Resources)** activates with it. [Importing Add-Ons](https://learn.microsoft.com/en-us/minecraft/creator/documents/gettingstarted?view=minecraft-bedrock-stable)

On Switch, join the world hosted from Windows, iPhone, or iPad. While a friend is hosting, open **Play → Friends** and select their world. If the family already has a Realm, an adult can upload the test world to a spare slot or activate the imported packs in its world settings. Invited players join through **Play → Realms** and receive its active packs. Switch online play requires Nintendo Switch Online and a linked Microsoft account. A parent manages multiplayer permissions for child accounts. [Joining a hosted world](https://help.minecraft.net/hc/en-us/articles/24122512131213) · [Realm activation](https://help.minecraft.net/hc/en-us/articles/24120525083533-How-to-activate-Minecraft-Add-On) · [Accepting an invitation](https://help.minecraft.net/hc/en-us/articles/36776460334477-Accept-a-Minecraft-Bedrock-Edition-Realms-Invitation) · [Multiplayer requirements](https://help.minecraft.net/hc/en-us/articles/35930809028749-Minecraft-Requirements-to-Play-Minecraft-Multiplayer-Games)

Use **right-click** on Windows, the touch layout's **Interact/Use** action on iPhone or iPad, and **ZL** on Switch to interact with Mushroom or use a toy. To toss a bone, use **Q** on Windows, hold the bone in the hotbar on a touch screen, or press **Down on the D-pad** on Switch. [Minecraft controls](https://www.minecraft.net/en-us/article/minecraft-controls)

## Meet Mushroom

1. Craft eight Yorkie Treats from raw mutton and two bones.
2. Craft a Mushroom Adoption Egg from a treat, a chicken egg, and paper. Use it on grass or dirt to adopt Mushroom. Creative players can adopt him with the Mushroom Spawn Egg. Each player can adopt one Mushroom. A second egg use leaves the existing dog and the egg in place.
3. Hold a Yorkie Treat and interact with Mushroom to feed him or tame an untamed dog from an older world. A treat restores up to three health, and he accepts one at full health too. Interact empty-handed to tell him to sit or follow.
4. Craft a Yorkie Harness from string, leather, and black dye. Use the harness on Mushroom before attaching a lead. To remove it in Bedrock, use shears and pick up the harness.
5. Craft a copper bowl and combine it with a Yorkie Treat or a water bucket. Place the full bowl nearby. Mushroom can finish one food bowl and one water bowl each Minecraft day, and returns each to an empty bowl.
6. Set a dog bed or doghouse on solid ground. A following Mushroom seeks a clear, dry spot at night and prefers the doghouse. Keep the entrance open so he can reach the mattress.
7. Craft a Yorkie Ball with white wool, lime dye, and string, or use yellow dye for a Yorkie Chew Toy. Use either toy to throw it. You can also use Minecraft's Drop Item action to toss a bone. Play while Mushroom is following on safe terrain.

In Creative, take off while Mushroom is following and nearby. He trails behind you in the air and comes down when you leave flight. He stays put when sitting or asleep and can follow again after waking. Fetch resumes on the ground.

If you leave a sitting Mushroom more than 32 blocks behind on foot, he can get up and come after you when there is a walkable route through loaded terrain. Close the daycare door or tie his lead to a fence to keep him there.

## Verify the add-on

### First-time players and daycare

Use the release candidate in a disposable Survival world. Invite a Switch player as a regular member and let them meet, feed, and walk Mushroom, then play fetch using the in-game controls and recipe book. Note the first step where they need help.

Have two players adopt one dog each, take turns walking each other's dogs, then save, leave, and rejoin. Check that each dog still follows the right owner when the lead comes off, and check how the lead sits on the harness. At night, watch Mushroom's head and pose while the owner flies nearby.

Record the add-on version, Minecraft version, device, and join route with any issue. Capture a short Bedrock clip of the daycare, lead handoff, and a fetch return. Use the Java family short in the creator portfolio. Show only actions available in the Bedrock build in the Marketplace footage.

### Full test pass

- Confirm that the packaged add-on imports with both packs and that Mushroom has his expected textures, name, walk and sit poses.
- In Survival, craft and use the adoption egg. Tame Mushroom, walk far enough to trigger following, and test the sit order.
- Invite a second player and confirm ownership, sit and follow are isolated. Save and reopen with Mushroom sitting. Confirm that his owner can tell him to follow after reopening.
- Check that only the owner can equip or remove the harness, that a lead attaches once the harness is on, and that removing it returns one harness. Verify the visible harness and lead gate after reopening or upgrading the world.
- Upload or activate a disposable Bedrock Realm and join from the intended controller or touch device. Record the tested versions and devices. Repeat the import and save checks when upgrading from the previous test build.
- Record the game version shown on each device and the route used to join. Test a clean import on Windows, iPhone, and iPad. Test joining from Switch as a regular player, including the pack download. On each device, verify Mushroom's appearance, adoption, tame, sit, follow, care and fetch using its usual controls. Leave and rejoin with an existing pet. Repeat after the host imports the next version.
- Verify furniture placement, facing, lighting and the visible models. Check that an obstructed or wet doghouse does not leave Mushroom stuck, that he wakes at dawn, and that a nearby nighttime threat interrupts sleep.
- Refill both bowls on the same Minecraft day, reopen the world and check the daily limits. Keep both tamed pets in the world during a multiplayer test and verify that the care messages go to their own players.
- Throw and recover each toy in Survival and Creative. Verify the original item comes back once, then test a full inventory, multiplayer throws, interrupted fetch and covered water or unsafe terrain.
- Check for two visible eyes and a visible nose from the front and at an angle. Look for the lead ending on the harness, a still head during sleep, and the sitting pose from the side. In Creative, take off, hover, move horizontally and land with Mushroom following. Repeat takeoff while he is sitting and asleep.

Players can also adopt Mushroom by sleeping through a full night in an Overworld bed. A loaded, following Yorkie can return after a full day apart. The server test covers both paths in the Overworld. Test them with two players on the release devices and verify that a second adoption preserves the existing pet. [Home routine and outdoor requests](https://github.com/alicon/minecraft-mods/issues/129)

## Edition differences

Java Mushroom can scent nearby generated structures. On Bedrock 26.66.1, the stable scripting surface has no bounded way to locate a nearby generated structure and get its coordinates. The Bedrock build covers adoption, care, ground fetch, and Creative flight follow. Airborne fetch, flight tricks, structure scenting, vehicle and portal behavior, and squirrels still need parity work. [Structure scenting](https://github.com/alicon/minecraft-mods/issues/133) · [Travel and recovery](https://github.com/alicon/minecraft-mods/issues/131) · [Squirrels](https://github.com/alicon/minecraft-mods/issues/132)

## Preview the model on the Mac

With Pillow 10.1 or newer installed, render the geometry, texture atlas, static poses and the harness with its lead locator directly from a built package. Add `--reference` with an earlier package for a side-by-side comparison.

```shell
python3 scripts/render-mushroom-bedrock.py build/bedrock/mushroom-the-yorkie-bedrock-0.1.11.mcaddon \
  --reference build/bedrock/mushroom-the-yorkie-bedrock-0.1.9.mcaddon \
  --output build/bedrock/mushroom-model-preview.png
```

Use a Bedrock client to verify the in-game renderer, lighting and animation transitions.

## Automated checks

Check the scripts against the same stable API version used by the behavior pack:

```shell
npm --prefix tools/bedrock ci
npm --prefix tools/bedrock run check
```

For an automated smoke test on Linux x64, download the official Bedrock Dedicated Server for 26.66 and pass its ZIP and the generated add-on to the test command:

```shell
python3 scripts/smoke-mushroom-bedrock.py /path/to/bedrock-server.zip /path/to/mushroom.mcaddon
```

Use `--upgrade-from /path/to/earlier-mushroom.mcaddon` to spawn the Yorkie in an earlier build and reopen the same disposable world with the newer pack. Add `--verify-care-persistence` to verify that the food limit and the tamed component state survive a further restart. Client import, visuals, ordinary player interactions and Realm delivery require the in-game checks above.

Add `--verify-fetch` to exercise interaction with two simulated players on Bedrock Dedicated Server 26.66. It checks treat feeding, ownership, interruption during a carry, inventory limits, cargo persistence, shallow-water returns, covered pools and an unsafe ledge. The fixture enables GameTest in its disposable world after the ordinary add-on checks. The add-on uses the stable Script API.

Add `--verify-adoption` to check that two Survival players can sleep in ordinary beds and wake up with one independently owned Yorkie each. It also checks that a loaded following Yorkie returns after a day away and a Yorkie told to sit stays put.

Add `--verify-egg-adoption` to check Creative and Survival egg use with two players. Repeated uses preserve both owned dogs, Creative keeps its original egg, and Survival spends an egg only on successful adoption.

Add `--verify-stay-walk` to test a closed daycare door, a leashed dog, an owner within 32 blocks, and an open route to a distant owner. The test checks that Mushroom walks out, keeps the same owner, and can sit again.

Add `--verify-flight` to test that a simulated Creative owner can take off, hover and move with Mushroom following. The test checks the sit order, landing after a switch to Survival, staying asleep as the owner flies away, and flight follow at dawn.

[Importing Add-Ons](https://learn.microsoft.com/en-us/minecraft/creator/documents/gettingstarted?view=minecraft-bedrock-stable) · [Activating Add-Ons on a Realm](https://help.minecraft.net/hc/en-us/articles/24120525083533-How-to-activate-Minecraft-Add-On)

### Autonomous two-player session

Run the exact candidate on a Linux x64 Bedrock Dedicated Server. The script creates its own world. Put the console log outside that world. Add `--failure-evidence build/bedrock/repro-119.zip` to keep the disposable save and active add-on files on a failed run. Keep that ZIP with the console log and the pinned server archive used for the test. The game-test module is installed only in this temporary save.

```bash
set -o pipefail
python3 -u scripts/smoke-mushroom-bedrock.py build/bedrock/server-1.26.66.1.zip \
  build/bedrock/mushroom-the-yorkie-bedrock-0.1.11.mcaddon --play-seconds 1800 --play-seed 119 \
  2>&1 | tee build/bedrock/mushroom-seed119.log
```

Two native simulated players tame and harness their dogs, then take turns feeding, fetching, walking each other's dogs, and flying while a dog sleeps. The test records the archive checksum, action sequence, game ticks and completed rounds. A sustained run needs a successful process exit, all cases in the final count, and at least the requested wall time in `MUSHROOM_PLAY_OBSERVED_SECONDS`. A timeout or stopped run earns no clean time. Repeat with the same seed to replay the action order. Use `--play-case guest-walk` or another case name to isolate one behavior. For overnight play, set `--play-seconds 28800` and use a new log for each seed.

The mixed arena resets fixture positions and moves the clock for the sleep and flight scenario. Add `--play-case daycare` for a persistent two-player session that uses the natural clock and keeps each dog's ownership and each player's inventory across walks, feeding, fetch, and overnight rest. The report counts dawns and measures elapsed game ticks in 24,000-tick days. Use the device playtest for rendering, controller or touch input, and Realm delivery.
