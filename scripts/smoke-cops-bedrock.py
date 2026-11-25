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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("server_zip", type=Path)
    parser.add_argument("addon", type=Path)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="cops-bedrock-smoke-") as directory:
        server_dir = Path(directory)
        prepare_server(args.server_zip, server_dir, WORLD)
        install_probe(server_dir, WORLD, PROBE_SOURCE)
        install_addon(args.addon, server_dir, WORLD)
        exercise_world(server_dir, "COPS_KITS_REGISTERED")
        probe = enable_beta_test_apis(server_dir, WORLD)
        shutil.copyfile(KIT_PROBE_SOURCE, probe)
        exercise_world(server_dir, "COPS_KITS_PLACED")
        exercise_world(server_dir, "COPS_KITS_PERSISTED")
        print("All three Bedrock kits placed and persisted across a server restart.")


if __name__ == "__main__":
    main()
