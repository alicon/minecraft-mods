# Mushroom gameplay across Java and Bedrock

Use these outcomes when reviewing a gameplay change, investigating a family playtest report, or adding a regression. The player actions and expected results are shared. Java Fabric GameTests and the live-client bridge drive Java, and Bedrock GameTest simulated players drive Bedrock. The [compatibility matrix](COMPATIBILITY.md#gameplay-checks-by-edition) shows which checks already exist.

## Behaviors to check

| Scenario | Set up and act | Expected result |
| --- | --- | --- |
| Adopt one Mushroom | Two players each adopt a dog in the same world using the edition's normal interaction. Each tries to adopt again. | Each player owns exactly one dog. A rejected adoption preserves the original dog and any unspent item. |
| Sit and follow | Use the usual empty-hand interaction. Walk away, come back, and ask him to follow again. Have another player try to change the order. | The owner can switch between sit and follow. A guest cannot change ownership or the sit order. Check daycare and Creative separately. |
| Share a walk | The owner fits a harness. An invited guest attaches a lead, walks Mushroom, feeds him while he is leashed, and releases the lead. | The lead stays attached through feeding. The guest can walk and release him. Owner, harness, and dog identity survive the handoff. |
| Stay at daycare | Leave him seated beyond 32 blocks on foot. Try a closed door, an open door with a clear route, and a lead tied to a fence. | A closed door or tied lead keeps him in place. In Bedrock, an awake, unleashed Mushroom can walk out through the open door and accepts the sit command again afterward. |
| Feed and water | Feed a treat at full and partial health in Creative and Survival. Use the food and water bowls twice in one game day and again the next day. | Use the [shared treat expectations](../scripts/fixtures/mushroom-treat-cases.json) for health and item counts. Each filled bowl is used once per day and becomes empty. The next day's refill works. |
| Sleep and wake | Give him a clear, dry dog bed or doghouse. Play through dusk and dawn. Walk or fly past him while he sleeps. Repeat with the bed blocked or wet. | He settles on the supported bed, rests with his head still, and wakes at dawn. A blocked or wet bed never becomes a sleep spot. Check the current Creative takeoff difference below. |
| Follow by air | With Mushroom following and awake, take off near him in Creative and fly on a clear route. Land and continue on foot. Repeat while he is seated or leashed. | A free dog follows nearby flight and lands safely. A seated or leashed dog stays put. Exercise distance and catch-up separately from nearby flight. |
| Fetch | Throw a ball, chew toy, or bone. Let him finish, then repeat and interrupt after pickup by asking him to sit or rejoining. | A real toy survives interruption and can be recovered exactly once. A Creative practice throw leaves the original in inventory and never creates an extra collectible. |
| Reopen and update | Save while two players have adopted dogs. Reopen the same disposable world, then upgrade it from the previous shipped build. | Ownership, sit orders, harnesses, inventory, and existing dogs survive. Each player can still command their own Mushroom. |

Use regular player interactions for the action under test. Commands can set up terrain, time, and camera views. Check application state after the action, such as the dog ID, owner, position, pose, and item counts. A successful button press alone does not establish the outcome.

## Differences and missing cases

- **Creative catch-up.** Java can fly to a grounded Creative owner when ground navigation stalls. Bedrock 0.1.13 follows only a flying Creative owner within 48 blocks and starts landing when the owner leaves that range. For [recovery parity](https://github.com/alicon/minecraft-mods/issues/131), replay separations just inside and outside the current cutoff with a safe route, then have the owner land. An awake dog already following should be able to catch up on a safe route. Exercise a seated dog, a tied dog, and an unloaded dog separately. Any recall must preserve the same dog and must never create a duplicate.
- **Creative flight tricks.** Java renders a loop-the-loop and a barrel roll while Mushroom follows a flying Creative owner. Bedrock still needs both. Start in open air and select each trick deterministically in the test fixture. The loop is a full forward flip in the model's pitch. The roll is a full rotation around his nose-to-tail axis. The dog should finish upright and keep following the same owner. Have the owner land mid-trick and check that the trick pose clears. Validate the rotation on a rendered client and keep the ordinary flight test separate. [Flight parity](https://github.com/alicon/minecraft-mods/issues/131)
- **Daycare exit.** The automatic open-door behavior is currently a Bedrock case. The closed door and tied lead are separate checks. Verify an actual crossing and arrival near the owner after the stand animation.
- **Creative flight during sleep.** The Bedrock party expectation is that flying past a sleeping Mushroom leaves him asleep. Java currently wakes him on owner takeoff. Confirm the intended Java behavior before making that scenario a shared release check.
- **Travel and airborne fetch.** Java covers portal following, vehicles, and airborne toy retrieval. Keep separate Bedrock cases for each capability as it lands. The bedtime recall in Bedrock requires the original dog to be loaded, following, and unleashed after a full Minecraft day apart.

## Running the checks

1. Start with the regression closest to the change. Add a shared fixture when both editions can assert the same values, using the treat cases as the pattern. Where a scenario depends on real navigation, run the same setup and outcome on each native runner.
2. Put the short cases in CI and run mixed play sessions for transitions between them. Record the exact build and game version, seed, actions, elapsed time, and failing observation. Replay a family report on the affected build before using a new build to prove the fix.
3. Check appearance and ordinary input on a real client. For a face change, keep the same camera and lighting and compare front and oblique views. Look for ears that lean away from the center of the head, visible eyes, and a solid nose. In gameplay, check the seated legs, lead attachment at the harness, and still head during sleep. Record Switch, mobile, and Realm results by device and build.

Use the [cross-edition test plan](https://github.com/alicon/minecraft-mods/issues/147) and [rendered-client checks](https://github.com/alicon/minecraft-mods/issues/148) to record new evidence and coverage gaps.
