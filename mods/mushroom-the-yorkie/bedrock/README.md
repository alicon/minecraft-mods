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
2. Craft a Mushroom Adoption Egg from a treat, a chicken egg, and paper. Use it on grass or dirt. Creative players can use the Mushroom Spawn Egg.
3. Hold a Yorkie Treat and interact with Mushroom to tame him. Interact empty-handed to tell him to sit or follow.
4. Craft a Yorkie Harness from string, leather, and black dye. Use the harness on Mushroom before attaching a lead. To remove it in Bedrock, use shears and pick up the harness.
5. Craft a copper bowl and combine it with a Yorkie Treat or a water bucket. Place the full bowl nearby. Mushroom can finish one food bowl and one water bowl each Minecraft day, and returns each to an empty bowl.
6. Set a dog bed or doghouse on solid ground. A following Mushroom seeks a clear, dry spot at night and prefers the doghouse. Keep the entrance open so he can reach the mattress.
7. Craft a Yorkie Ball with white wool, lime dye, and string, or use yellow dye for a Yorkie Chew Toy. Use either toy to throw it. You can also use Minecraft's Drop Item action to toss a bone. Play while Mushroom is following on safe terrain.

## Verify the add-on

- Confirm that the packaged add-on imports with both packs and that Mushroom has his expected textures, name, walk and sit poses.
- In Survival, craft and use the adoption egg. Tame Mushroom, walk far enough to trigger following, and test the sit order.
- Invite a second player and confirm ownership, sit and follow are isolated. Save and reopen with Mushroom sitting. Confirm that his owner can tell him to follow after reopening.
- Check that only the owner can equip or remove the harness, that a lead attaches once the harness is on, and that removing it returns one harness. Verify the visible harness and lead gate after reopening or upgrading the world.
- Upload or activate a disposable Bedrock Realm and join from the intended controller or touch device. Record the tested versions and devices. Repeat the import and save checks when upgrading from the previous test build.
- Record the game version shown on each device and the route used to join. Test a clean import on Windows, iPhone, and iPad. Test joining from Switch as a regular player, including the pack download. On each device, verify Mushroom's appearance, adoption, tame, sit, follow, care and fetch using its usual controls. Leave and rejoin with an existing pet. Repeat after the host imports the next version.
- Verify furniture placement, facing, lighting and the visible models. Check that an obstructed or wet doghouse does not leave Mushroom stuck, that he wakes at dawn, and that a nearby nighttime threat interrupts sleep.
- Refill both bowls on the same Minecraft day, reopen the world and check the daily limits. Keep both tamed pets in the world during a multiplayer test and verify that the care messages go to their own players.
- Throw and recover each toy in Survival and Creative. Verify the original item comes back once, then test a full inventory, multiplayer throws, interrupted fetch and covered water or unsafe terrain.

The development build also attempts adoption after a full night in an Overworld bed. It can bring a loaded, following Yorkie back after a full day apart. Test both routes with two players and check that a second adoption does not replace an existing pet. The outdoor request routine is tracked in [the home routine issue](https://github.com/alicon/minecraft-mods/issues/129).

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

Add `--verify-fetch` to exercise interaction with two simulated players on Bedrock Dedicated Server 26.66. The fixture enables GameTest in its disposable world after the ordinary add-on checks. The add-on uses the stable Script API.

[Importing Add-Ons](https://learn.microsoft.com/en-us/minecraft/creator/documents/gettingstarted?view=minecraft-bedrock-stable) · [Activating Add-Ons on a Realm](https://help.minecraft.net/hc/en-us/articles/24120525083533-How-to-activate-Minecraft-Add-On)
