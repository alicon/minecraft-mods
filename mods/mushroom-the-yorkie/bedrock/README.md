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

## Verify the add-on

- Confirm that the packaged add-on imports with both packs and that Mushroom has his expected textures, name, walk and sit poses.
- In Survival, craft and use the adoption egg. Tame Mushroom, walk far enough to trigger following, and test the sit order.
- Invite a second player and confirm ownership, sit and follow are isolated. Save and reopen with Mushroom sitting. Confirm that his owner can tell him to follow after reopening.
- Upload or activate a disposable Bedrock Realm and join from the intended controller or touch device. Record the tested versions and devices. Repeat the import and save checks when upgrading from the previous test build.

[Importing Add-Ons](https://learn.microsoft.com/en-us/minecraft/creator/documents/gettingstarted?view=minecraft-bedrock-stable) · [Activating Add-Ons on a Realm](https://help.minecraft.net/hc/en-us/articles/24120525083533-How-to-activate-Minecraft-Add-On)
