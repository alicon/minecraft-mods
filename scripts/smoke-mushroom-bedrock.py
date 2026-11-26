"""Boot the packaged Mushroom add-on in a fresh Bedrock Dedicated Server world."""

import argparse
import shutil
import tempfile
from pathlib import Path

from bedrock_smoke import (
    SmokeWorld, enable_beta_test_apis, exercise_world, install_addon, install_companion_addons, install_probe, prepare_server,
)

WORLD = SmokeWorld(
    "Mushroom Bedrock Smoke", "mushroom_the_yorkie",
    "836a477e-ab53-4084-8ff3-600c098fb836", "74c5afd1-2ba5-49cc-af25-b9f47a6e314e",
)
PROBE_SOURCE = Path(__file__).with_name("fixtures") / "mushroom-bedrock-smoke.js"
PLAYER_PROBE_SOURCE = PROBE_SOURCE.with_name("mushroom-bedrock-player-probe.js")
ADOPTION_PROBE_SOURCE = PROBE_SOURCE.with_name("mushroom-bedrock-adoption-probe.js")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("server_zip", type=Path)
    parser.add_argument("addon", type=Path)
    parser.add_argument("--upgrade-from", type=Path)
    parser.add_argument("--with-addon", action="append", type=Path, default=[],
                        help="keep another .mcaddon active during this test; repeat to add more")
    parser.add_argument("--verify-care-persistence", action="store_true")
    parser.add_argument("--verify-fetch", action="store_true", help="run an opt-in simulated-player fetch test")
    parser.add_argument("--verify-adoption", action="store_true", help="run an opt-in simulated-player sleep adoption test")
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="mushroom-bedrock-smoke-") as directory:
        server_dir = Path(directory)
        prepare_server(args.server_zip, server_dir, WORLD)
        install_probe(server_dir, WORLD, PROBE_SOURCE)
        install_addon(args.upgrade_from or args.addon, server_dir, WORLD)
        install_companion_addons(args.with_addon, server_dir, WORLD)
        exercise_world(server_dir, "MUSHROOM_TEST_SPAWNED")
        if args.upgrade_from:
            install_addon(args.addon, server_dir, WORLD)
        exercise_world(server_dir, "MUSHROOM_TEST_REOPENED")
        if args.verify_care_persistence:
            exercise_world(server_dir, "MUSHROOM_TEST_CARE_PERSISTED")
        if args.verify_fetch or args.verify_adoption:
            probe = enable_beta_test_apis(server_dir, WORLD)
            if args.verify_fetch:
                shutil.copyfile(PLAYER_PROBE_SOURCE, probe)
                exercise_world(server_dir, "MUSHROOM_SIM_PASS", timeout=180)
                exercise_world(server_dir, "MUSHROOM_SIM_CARGO_SAVED")
            if args.verify_adoption:
                shutil.copyfile(ADOPTION_PROBE_SOURCE, probe)
                exercise_world(server_dir, "MUSHROOM_ADOPTION_RECOVERY")
        print("Mushroom spawned and remained in the world after a server restart.")


if __name__ == "__main__":
    main()
