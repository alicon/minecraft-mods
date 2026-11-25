# Cops and Robbers for Bedrock

## Build the kit playtest

From the repository root:

```shell
python3 mods/cops-and-robbers/bedrock/tools/build-structures.py --check
python3 scripts/build-bedrock-addon.py cops-and-robbers
npm --prefix tools/bedrock ci
npm --prefix tools/bedrock run check
```

Open the `.mcaddon` in Minecraft Bedrock on Windows, iPhone, or iPad. Activate **Cops and Robbers (Behavior)** in a disposable world and confirm its resource pack is active.

## Place a kit

1. Take a Bank Kit, Police Station Kit, or Fire Station Kit from the Creative inventory.
2. Clear a level 13-by-13 area with six blocks of headroom. Stand just outside the site, face inward, and use the kit on the top of the center ground block along the entrance edge.
3. Check the four corner markers. Use the kit again on the same block without turning to place the building. Everyone should be outside the marked area. A blocked site leaves the kit in your inventory.

The bank has a vault chest with eight gold ingots and three tellers. The police station has a jail, cruiser garage, and a police officer. The fire station has a truck bay and three firefighters. The Bedrock buildings are compact versions of the Java layouts. Driving and the patrol round are tracked separately. [Vehicle controls](https://github.com/alicon/minecraft-mods/issues/136) · [Patrol round](https://github.com/alicon/minecraft-mods/issues/137)

## Verify the layouts

Add the official Bedrock Dedicated Server ZIP for 26.66 or a compatible patch, then run:

```shell
python3 scripts/smoke-cops-bedrock.py /path/to/bedrock-server.zip build/bedrock/cops-and-robbers-bedrock-0.1.0.mcaddon
```

The server checks the registered templates, then exercises native placement with two simulated players. It covers obstructed and uneven ground, another player in the footprint, rotation, survival item use, vault contents, crew counts, and save/reopen. GameTest is enabled in the disposable test world. Device visuals, controller and touch inputs, and Realm placement need separate checks.
