"""Exercise the Cops and Robbers kits in a fresh Bedrock Dedicated Server world."""

import argparse
import shutil
import tempfile
from pathlib import Path

from bedrock_smoke import SmokeWorld, enable_beta_test_apis, exercise_world, install_addon, install_probe, prepare_server

WORLD = SmokeWorld(
    "Cops and Robbers Bedrock Smoke", "cops_robbers",
    "01bbcf3a-5724-4e70-a303-b77218eac037", "a5e53215-09ca-44de-b87a-aaa92d45010a",
)
PROBE_SOURCE = Path(__file__).with_name("fixtures") / "cops-bedrock-smoke.js"
KIT_PROBE_SOURCE = PROBE_SOURCE.with_name("cops-bedrock-kits-probe.js")
VEHICLE_PROBE_SOURCE = PROBE_SOURCE.with_name("cops-bedrock-vehicles-probe.js")
PATROL_PROBE_SOURCE = PROBE_SOURCE.with_name("cops-bedrock-patrol-probe.js")
FIRE_PROBE_SOURCE = PROBE_SOURCE.with_name("cops-bedrock-fire-probe.js")
JAIL_PROBE_SOURCE = PROBE_SOURCE.with_name("cops-bedrock-jail-probe.js")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("server_zip", type=Path)
    parser.add_argument("addon", type=Path)
    parser.add_argument("--upgrade-from", type=Path)
    parser.add_argument("--verify-vehicles", action="store_true")
    parser.add_argument("--verify-patrol", action="store_true")
    parser.add_argument("--verify-fire", action="store_true")
    parser.add_argument("--verify-jail", action="store_true")
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="cops-bedrock-smoke-") as directory:
        server_dir = Path(directory)
        prepare_server(args.server_zip, server_dir, WORLD)
        install_probe(server_dir, WORLD, PROBE_SOURCE)
        install_addon(args.upgrade_from or args.addon, server_dir, WORLD)
        exercise_world(server_dir, "COPS_KITS_REGISTERED")
        probe = enable_beta_test_apis(server_dir, WORLD)
        shutil.copyfile(KIT_PROBE_SOURCE, probe)
        exercise_world(server_dir, "COPS_KITS_PLACED")
        if args.upgrade_from:
            install_addon(args.addon, server_dir, WORLD)
        exercise_world(server_dir, "COPS_KITS_PERSISTED")
        print("All three Bedrock kits placed and persisted across a server restart.")
        if args.verify_vehicles:
            shutil.copyfile(VEHICLE_PROBE_SOURCE, probe)
            exercise_world(server_dir, "COPS_VEHICLES_PLAYABLE")
            exercise_world(server_dir, "COPS_VEHICLES_PERSISTED")
            print("Both vehicles drove and persisted across a server restart.")
        if args.verify_patrol:
            shutil.copyfile(PATROL_PROBE_SOURCE, probe)
            exercise_world(server_dir, "COPS_PATROL_CONTESTED_CAPTURE")
            exercise_world(server_dir, "COPS_PATROL_REPLAYED", timeout=150)
            exercise_world(server_dir, "COPS_PATROL_REPLAY_PERSISTED")
            print("The patrol was completed and replayed across server restarts.")
        if args.verify_fire:
            shutil.copyfile(FIRE_PROBE_SOURCE, probe)
            exercise_world(server_dir, "COPS_FIRE_RESPONSE_PLAYABLE")
            print("Firefighters and the fire truck extinguished reachable fires.")
        if args.verify_jail:
            shutil.copyfile(JAIL_PROBE_SOURCE, probe)
            exercise_world(server_dir, "COPS_JAIL_SENTENCES_SAVED")
            exercise_world(server_dir, "COPS_JAIL_RELEASE_AND_ESCAPE")
            print("Saved sentences led to a normal release and an overnight jailbreak.")


if __name__ == "__main__":
    main()
