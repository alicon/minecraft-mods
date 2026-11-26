"""Boot the packaged Mushroom add-on in a fresh Bedrock Dedicated Server world."""

import argparse
import hashlib
import json
import shutil
import sys
import tempfile
from contextlib import contextmanager
from zipfile import ZIP_DEFLATED, ZipFile
from pathlib import Path

from bedrock_smoke import (
    FIXTURE_FOLDER, SmokeWorld, enable_beta_test_apis, exercise_world, install_addon, install_companion_addons,
    install_probe, prepare_server,
)

WORLD = SmokeWorld(
    "Mushroom Bedrock Smoke", "mushroom_the_yorkie",
    "836a477e-ab53-4084-8ff3-600c098fb836", "74c5afd1-2ba5-49cc-af25-b9f47a6e314e",
)
PROBE_SOURCE = Path(__file__).with_name("fixtures") / "mushroom-bedrock-smoke.js"
PLAYER_PROBE_SOURCE = PROBE_SOURCE.with_name("mushroom-bedrock-player-probe.js")
ADOPTION_PROBE_SOURCE = PROBE_SOURCE.with_name("mushroom-bedrock-adoption-probe.js")
EGG_PROBE_SOURCE = PROBE_SOURCE.with_name("mushroom-bedrock-egg-probe.js")
STAY_PROBE_SOURCE = PROBE_SOURCE.with_name("mushroom-bedrock-stay-probe.js")
FLIGHT_PROBE_SOURCE = PROBE_SOURCE.with_name("mushroom-bedrock-flight-probe.js")
AUTOPLAY_SOURCE = PROBE_SOURCE.with_name("mushroom-bedrock-autoplay.js")
DAYCARE_SOURCE = PROBE_SOURCE.with_name("mushroom-bedrock-daycare.js")
PARITY_SOURCE = PROBE_SOURCE.with_name("mushroom-bedrock-parity.js")
FOOD_CASES = PROBE_SOURCE.with_name("mushroom-food-cases.json")
TREAT_CASES = PROBE_SOURCE.with_name("mushroom-treat-cases.json")
AUTOPLAY_CASES = ("survival-feed", "creative-feed", "owner-walk", "guest-walk", "fetch", "sleep-flight", "daycare")


@contextmanager
def disposable_run(failure_evidence):
    with tempfile.TemporaryDirectory(prefix="mushroom-bedrock-smoke-") as directory:
        server_dir = Path(directory)
        try:
            yield server_dir
        except (Exception, KeyboardInterrupt):
            if failure_evidence:
                try:
                    failure_evidence.parent.mkdir(parents=True, exist_ok=True)
                    with ZipFile(failure_evidence, "x", compression=ZIP_DEFLATED) as archive:
                        # Bundled vanilla content comes from the pinned server ZIP.
                        paths = [
                            server_dir / "server.properties",
                            server_dir / "worlds" / WORLD.name,
                            server_dir / "behavior_packs" / FIXTURE_FOLDER,
                            *server_dir.glob(f"behavior_packs/{WORLD.addon_folder}*"),
                            *server_dir.glob(f"resource_packs/{WORLD.addon_folder}*"),
                        ]
                        for source in paths:
                            files = (source,) if source.is_file() else source.rglob("*")
                            for file in files:
                                if file.is_file():
                                    archive.write(file, file.relative_to(server_dir))
                    print(f"Bedrock failure world and packs saved to {failure_evidence}", file=sys.stderr, flush=True)
                except OSError as error:
                    print(f"Could not retain Bedrock failure evidence: {error}", file=sys.stderr, flush=True)
            raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("server_zip", type=Path)
    parser.add_argument("addon", type=Path)
    parser.add_argument("--upgrade-from", type=Path)
    parser.add_argument("--with-addon", action="append", type=Path, default=[],
                        help="keep another .mcaddon active during this test; repeat to add more")
    parser.add_argument("--verify-care-persistence", action="store_true")
    parser.add_argument("--verify-parity", action="store_true", help="check grass fetch and ordinary food against Java")
    parser.add_argument("--verify-fetch", action="store_true", help="run an opt-in simulated-player fetch test")
    parser.add_argument("--verify-adoption", action="store_true", help="run an opt-in simulated-player sleep adoption test")
    parser.add_argument("--verify-egg-adoption", action="store_true", help="check repeated Creative and Survival egg use")
    parser.add_argument("--verify-stay-walk", action="store_true", help="check open and closed daycare exits and tethering")
    parser.add_argument("--verify-flight", action="store_true", help="run an opt-in simulated-player Creative flight test")
    parser.add_argument("--play-seconds", type=int, help="run seeded simulated-player gameplay for at least this many seconds")
    parser.add_argument("--play-seed", type=int, default=119, help="seed for the gameplay action order and variants")
    parser.add_argument("--play-case", choices=AUTOPLAY_CASES, help="replay one gameplay case")
    parser.add_argument("--failure-evidence", type=Path,
                        help="write a ZIP of the temporary world and active packs if the run fails")
    args = parser.parse_args()
    if args.failure_evidence and args.failure_evidence.exists():
        parser.error("--failure-evidence must name a new path")
    if args.play_seconds is not None and args.play_seconds <= 0:
        parser.error("--play-seconds must be positive")
    if args.play_case and args.play_seconds is None:
        parser.error("--play-case requires --play-seconds")
    with disposable_run(args.failure_evidence) as server_dir:
        prepare_server(args.server_zip, server_dir, WORLD)
        if args.play_seconds:
            with (server_dir / "server.properties").open("a", encoding="utf-8") as settings:
                settings.write(f"level-seed={args.play_seed}\n")
            print("MUSHROOM_PLAY_BUILD " + json.dumps({
                "archive": args.addon.name,
                "sha256": hashlib.sha256(args.addon.read_bytes()).hexdigest(),
                "server": args.server_zip.name,
                "serverSha256": hashlib.sha256(args.server_zip.read_bytes()).hexdigest(),
                "fixtures": {path.name: hashlib.sha256(path.read_bytes()).hexdigest()
                             for path in ([AUTOPLAY_SOURCE, DAYCARE_SOURCE] if args.play_case == "daycare"
                                          else [AUTOPLAY_SOURCE])},
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
        if any((args.verify_fetch, args.verify_adoption, args.verify_egg_adoption,
                args.verify_stay_walk, args.verify_flight, args.verify_parity, args.play_seconds)):
            probe = enable_beta_test_apis(server_dir, WORLD)
            if args.verify_parity or args.verify_fetch:
                examples = json.dumps(json.loads(FOOD_CASES.read_text(encoding="utf-8")))
                probe.write_text(PARITY_SOURCE.read_text(encoding="utf-8")
                                 + f"\nconst FOOD_EXAMPLES = {examples};\n", encoding="utf-8")
                exercise_world(server_dir, "MUSHROOM_PARITY_PASS", timeout=90)
            if args.verify_fetch:
                examples = json.dumps(json.loads(TREAT_CASES.read_text(encoding="utf-8")))
                probe.write_text(PLAYER_PROBE_SOURCE.read_text(encoding="utf-8")
                                 + f"\nconst TREAT_EXAMPLES = {examples};\n", encoding="utf-8")
                exercise_world(server_dir, "MUSHROOM_SIM_PASS", timeout=180)
                exercise_world(server_dir, "MUSHROOM_SIM_CARGO_SAVED")
            if args.verify_adoption:
                shutil.copyfile(ADOPTION_PROBE_SOURCE, probe)
                exercise_world(server_dir, "MUSHROOM_ADOPTION_RECOVERY")
            if args.verify_egg_adoption:
                shutil.copyfile(EGG_PROBE_SOURCE, probe)
                exercise_world(server_dir, "MUSHROOM_EGG_PASS")
            if args.verify_stay_walk:
                shutil.copyfile(STAY_PROBE_SOURCE, probe)
                exercise_world(server_dir, "MUSHROOM_STAY_WALK_PASS")
            if args.verify_flight:
                shutil.copyfile(FLIGHT_PROBE_SOURCE, probe)
                exercise_world(server_dir, "MUSHROOM_FLIGHT_PASS")
            if args.play_seconds:
                shutil.copyfile(AUTOPLAY_SOURCE, probe.with_name(AUTOPLAY_SOURCE.name))
                if args.play_case == "daycare":
                    shutil.copyfile(DAYCARE_SOURCE, probe.with_name(DAYCARE_SOURCE.name))
                    script = f'import {{ startDaycare }} from "./{DAYCARE_SOURCE.name}";\n'
                    script += f"startDaycare({args.play_seconds}, {args.play_seed});\n"
                else:
                    script = f'import {{ startAutoplay }} from "./{AUTOPLAY_SOURCE.name}";\n'
                    script += f"startAutoplay({args.play_seconds}, {args.play_seed}, {json.dumps(args.play_case)});\n"
                probe.write_text(script, encoding="utf-8")
                exercise_world(server_dir, "MUSHROOM_PLAY_PASS", play_seconds=args.play_seconds)
        print("Mushroom spawned and remained in the world after a server restart.")


if __name__ == "__main__":
    main()
