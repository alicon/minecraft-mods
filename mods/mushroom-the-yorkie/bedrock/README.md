# Mushroom the Yorkie for Bedrock

This development add-on targets Bedrock 26.60 and newer. Verify the current stable patch on an official Windows or mobile client before publishing a supported version. Use a new Survival world or a disposable copy for test builds.

## Build and import

From the repository root:

```shell
python3 scripts/build-bedrock-addon.py mushroom-the-yorkie
python3 -m unittest discover -s scripts/tests -p 'test_build_bedrock_addon.py'
```

Open the generated `build/bedrock/mushroom-the-yorkie-bedrock-*.mcaddon` on a Bedrock device that supports file import. In the test world's settings, activate **Mushroom the Yorkie (Behavior)** and check that **Mushroom the Yorkie (Resources)** is active. Enable the content log when testing on a device that exposes the creator settings.

## Meet Mushroom

1. Craft eight Yorkie Treats from raw mutton and two bones.
2. Craft a Mushroom Adoption Egg from a treat, a chicken egg, and paper. Use it on grass or dirt. Creative players can use the Mushroom Spawn Egg.
3. Hold a Yorkie Treat and interact with Mushroom to tame him. Interact empty-handed to tell him to sit or follow.
4. Craft a Yorkie Harness from string, leather, and black dye. Use the harness on Mushroom before attaching a lead. To remove it in Bedrock, use shears and pick up the harness.

## Verify the add-on

- Confirm that the packaged add-on imports with both packs and that Mushroom has his expected textures, name, walk and sit poses.
- In Survival, craft and use the adoption egg. Tame Mushroom, walk far enough to trigger following, and test the sit order.
- Invite a second player and confirm ownership, sit and follow are isolated. Save and reopen with Mushroom sitting. Confirm that his owner can tell him to follow after reopening.
- Check that only the owner can equip or remove the harness, that a lead attaches once the harness is on, and that removing it returns one harness. Verify the visible harness and lead gate after reopening or upgrading the world.
- Upload or activate a disposable Bedrock Realm and join from the intended controller or touch device. Record the tested versions and devices. Repeat the import and save checks when upgrading from the previous test build.

The development pack also includes craftable food and water bowls, a dog bed, and a doghouse. Verify placement, facing, lighting, and the visual models on a client. Mushroom's scripted feeding and sleeping routines are still in development.

For an automated smoke test on Linux x64, download the official Bedrock Dedicated Server for 26.66 and pass its ZIP and the generated add-on to the test command:

```shell
python3 scripts/smoke-mushroom-bedrock.py /path/to/bedrock-server.zip /path/to/mushroom.mcaddon
```

Use `--upgrade-from /path/to/earlier-mushroom.mcaddon` to spawn the Yorkie in an earlier build and reopen the same disposable world with the newer pack. The probe checks server-side registrations, entity events and persistence. Client import, visuals, ordinary player interactions and Realm delivery require the in-game checks above.

[Importing Add-Ons](https://learn.microsoft.com/en-us/minecraft/creator/documents/gettingstarted?view=minecraft-bedrock-stable) · [Activating Add-Ons on a Realm](https://help.minecraft.net/hc/en-us/articles/24120525083533-How-to-activate-Minecraft-Add-On)
