"""Boot the packaged Mushroom add-on in a fresh Bedrock Dedicated Server world."""

import argparse
import hashlib
import json
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


FLIGHT_PROBE_SOURCE = PROBE_SOURCE.with_name("mushroom-bedrock-flight-probe.js")
AUTOPLAY_SOURCE = PROBE_SOURCE.with_name("mushroom-bedrock-autoplay.js")
TREAT_CASES = PROBE_SOURCE.with_name("mushroom-treat-cases.json")
AUTOPLAY_CASES = ("survival-feed", "creative-feed", "owner-walk", "guest-walk", "fetch", "sleep-flight")


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
    parser.add_argument("--verify-flight", action="store_true", help="run an opt-in simulated-player Creative flight test")
    parser.add_argument("--play-seconds", type=int, help="run seeded simulated-player gameplay for at least this many seconds")
    parser.add_argument("--play-seed", type=int, default=119, help="seed for the gameplay action order and variants")
    parser.add_argument("--play-case", choices=AUTOPLAY_CASES, help="replay one gameplay case")
    args = parser.parse_args()
    if args.play_seconds is not None and args.play_seconds <= 0:
        parser.error("--play-seconds must be positive")
    if args.play_case and args.play_seconds is None:
        parser.error("--play-case requires --play-seconds")
    with tempfile.TemporaryDirectory(prefix="mushroom-bedrock-smoke-") as directory:
        server_dir = Path(directory)
        prepare_server(args.server_zip, server_dir, WORLD)
        if args.play_seconds:
            with (server_dir / "server.properties").open("a", encoding="utf-8") as settings:
                settings.write(f"level-seed={args.play_seed}\n")
            print("MUSHROOM_PLAY_BUILD " + json.dumps({
                "archive": args.addon.name,
                "sha256": hashlib.sha256(args.addon.read_bytes()).hexdigest(),
                "server": args.server_zip.name,
                "serverSha256": hashlib.sha256(args.server_zip.read_bytes()).hexdigest(),
                "fixtureSha256": hashlib.sha256(AUTOPLAY_SOURCE.read_bytes()).hexdigest(),
                "seed": args.play_seed, "seconds": args.play_seconds, "case": args.play_case,
            }), flush=True)
        install_probe(server_dir, WORLD, PROBE_SOURCE)
        install_addon(args.upgrade_from or args.addon, server_dir, WORLD)
        install_companion_addons(args.with_addon, server_dir, WORLD)
        exercise_world(server_dir, "MUSHROOM_TEST_SPAWNED")
        if args.upgrade_from:
            install_addon(args.addon, server_dir, WORLD)
        exercise_world(server_dir, "MUSHROOM_TEST_REOPENED")
        if args.verify_care_persistence:
            exercise_world(server_dir, "MUSHROOM_TEST_CARE_PERSISTED")
        if args.verify_fetch or args.verify_adoption or args.verify_flight or args.play_seconds:
            probe = enable_beta_test_apis(server_dir, WORLD)
            if args.verify_fetch:
                examples = json.dumps(json.loads(TREAT_CASES.read_text(encoding="utf-8")))
                probe.write_text(PLAYER_PROBE_SOURCE.read_text(encoding="utf-8")
                                 + f"\nconst TREAT_EXAMPLES = {examples};\n", encoding="utf-8")
                exercise_world(server_dir, "MUSHROOM_SIM_PASS", timeout=180)
                exercise_world(server_dir, "MUSHROOM_SIM_CARGO_SAVED")
            if args.verify_adoption:
                shutil.copyfile(ADOPTION_PROBE_SOURCE, probe)
                exercise_world(server_dir, "MUSHROOM_ADOPTION_RECOVERY")
            if args.verify_flight:
                shutil.copyfile(FLIGHT_PROBE_SOURCE, probe)
                exercise_world(server_dir, "MUSHROOM_FLIGHT_PASS")
            if args.play_seconds:
                fixture = AUTOPLAY_SOURCE.read_text(encoding="utf-8")
                options = f"{args.play_seconds}, {args.play_seed}, {json.dumps(args.play_case)}"
                probe.write_text(f"{fixture}\nstartAutoplay({options});\n", encoding="utf-8")
                exercise_world(server_dir, "MUSHROOM_PLAY_PASS", play_seconds=args.play_seconds)
        print("Mushroom spawned and remained in the world after a server restart.")


if __name__ == "__main__":
    main()
