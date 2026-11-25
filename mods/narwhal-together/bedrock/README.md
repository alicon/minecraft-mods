# NARwhal Together for Bedrock

## Install for a world

Open the `.mcaddon` in Minecraft for Windows, iPhone, or iPad. Activate **NARwhal Together (Behavior)** in the world's Behavior Packs and check that **NARwhal Together (Resources)** is active. Make a test world first. The planned Switch path is to join a Bedrock multiplayer world or Realm that already has both packs active.

## Regroup during play

1. Craft a **Regroup Charm** at a crafting table with one paper and one copper ingot. The same recipe replaces a lost charm. Creative players can get one from the item inventory.
2. Select the charm in the hotbar, aim away from blocks you can interact with, and press the normal Use button. On touch, use the **Regroup** action while holding the charm.
3. Wait two seconds between successful uses. Each use goes to the next online player in alphabetical order, skipping spectators and wrapping to the first name. The charm stays in your hotbar.

Regroup looks for clear, solid ground beside the other player, searching up to three blocks in each horizontal direction and two blocks up or down. If there's no safe landing where they are, wait for them to move. The same feature uses `G` or the configured Controlify shortcut on Java. Bedrock uses its built-in controller inventory and crafting controls.

## Build and test

```shell
python3 scripts/build-bedrock-addon.py narwhal-together
npm --prefix tools/bedrock ci
npm --prefix tools/bedrock run check
python3 scripts/smoke-narwhal-bedrock.py /path/to/bedrock-server.zip build/bedrock/narwhal-together-bedrock-0.1.0.mcaddon
```

The disposable server test reopens a saved charm and exercises native use with simulated Survival players. Pass `--upgrade-from` with an older archive to test a pack upgrade in the same save. Controller, touch, crafting menus, and Realm delivery need client playtests. [Device controls](https://github.com/alicon/minecraft-mods/issues/139) · [Multiplayer regroup](https://github.com/alicon/minecraft-mods/issues/140)
