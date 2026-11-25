# Cops and Robbers for Bedrock

## Build the patrol playtest

From the repository root:

```shell
python3 mods/cops-and-robbers/bedrock/tools/build-structures.py --check
python3 mods/cops-and-robbers/bedrock/tools/build-vehicles.py --check
python3 scripts/build-bedrock-addon.py cops-and-robbers
npm --prefix tools/bedrock ci
npm --prefix tools/bedrock run check
```

Open the `.mcaddon` in Minecraft Bedrock on Windows, iPhone, or iPad. Activate **Cops and Robbers (Behavior)** in a disposable world and confirm its resource pack is active.

## Place a kit

1. Take a Bank Kit, Police Station Kit, or Fire Station Kit from the Creative inventory.
2. Clear a level 13-by-13 area with six blocks of headroom. Stand just outside the site, face inward, and use the kit on the top of the center ground block along the entrance edge.
3. Check the four corner markers. Use the kit again on the same block without turning to place the building. Everyone should be outside the marked area. A blocked site leaves the kit in your inventory.

The bank has a vault chest with eight gold ingots and three tellers. The police station has a jail, cruiser garage, and a police officer. The fire station has a truck bay and three firefighters. The Bedrock buildings are compact versions of the Java layouts. [Patrol round](https://github.com/alicon/minecraft-mods/issues/137)

## Drive and use the signals

Place a Police Cruiser or Fire Truck with its Creative spawn egg. Use the normal ride interaction. The first rider drives from the front seat, and a second player can ride behind them. Use the usual movement and look controls to drive and steer. Stop before using the game's dismount control.

Craft **Vehicle Controls** from a comparator and a copper ingot, or get it from the Creative inventory. Hold it and use the usual item action from the driver's seat. Each press cycles through **Off**, **Lights**, and **Lights and siren**. The siren sounds while the vehicle is occupied.

The Bedrock vehicles use ground driving. Creative flight, loops, and barrel rolls remain Java features at this point. [Vehicle controls and parity](https://github.com/alicon/minecraft-mods/issues/136)

## Play a bank patrol

Set the bank and police station within 64 blocks of each other, with a clear street between the bank doors and the station's yellow garage entrance. Place a cruiser outside and give the players **Vehicle Controls**. Several teams can play independently when each bank has a nearby station with a free jail.

1. Use **Vehicle Controls** on foot beside a bank teller to start a robbery. The robber takes the gold from the first slot of the bank vault chest and appears outside the bank.
2. Follow the robber in the police cruiser. Drive close enough with a clear path to capture them. A passenger can help spot the robber.
3. Drive into the assigned station's yellow garage entrance. The game moves the captive to jail.
4. Either player can use **Vehicle Controls** on foot beside a teller at the original bank to put the gold back in the vault. Keep its first slot empty. Use the controls again after the completion message to start the next round.

After a restart, get back into the same cruiser to continue a capture in progress. If the robber is defeated before jail, use the controls at the bank to restart the chase. [Patrol round](https://github.com/alicon/minecraft-mods/issues/137)

## Verify the kits, vehicles, and patrol

Add the official Bedrock Dedicated Server ZIP for 26.66 or a compatible patch, then run:

```shell
python3 scripts/smoke-cops-bedrock.py /path/to/bedrock-server.zip build/bedrock/cops-and-robbers-bedrock-0.1.2.mcaddon --verify-vehicles --verify-patrol
```

The server checks the registered templates, then exercises native placement with two simulated players. It covers obstructed and uneven ground, another player in the footprint, rotation, survival item use, vault contents, crew counts, and save/reopen. GameTest is enabled in the disposable test world. Device visuals, controller and touch inputs, and Realm placement need separate checks.

Pass `--upgrade-from` with a prior archive to verify the placed kits survive the update. The vehicle test checks two seats, driver-only signals, steering, stopping, a wall collision, safe ejection, and saved vehicle identities and signal settings. The patrol test uses two simulated players at the bank, restarts during capture, checks jail and gold return, and reopens independent patrols after replay. Verify the dismount button and the visible and audible feedback on each client.
