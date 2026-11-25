"""Exercise the packaged NARwhal Together add-on in a disposable Bedrock world."""

import argparse
import shutil
from pathlib import Path
from tempfile import TemporaryDirectory

from bedrock_smoke import SmokeWorld, enable_beta_test_apis, exercise_world, install_addon, install_probe, prepare_server

WORLD = SmokeWorld(
    "NARwhal Together Bedrock Smoke", "narwhal_together",
    "9a1baf76-a18b-4c86-8374-dc6fc020088a", "ec9b7c64-62fd-4c91-bff0-06cfa15d55cd",
)
PROBE = Path(__file__).with_name("fixtures") / "narwhal-bedrock-smoke.js"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("server_zip", type=Path)
    parser.add_argument("addon", type=Path)
    args = parser.parse_args()
    with TemporaryDirectory(prefix="narwhal-bedrock-smoke-") as directory:
        server_dir = Path(directory)
        prepare_server(args.server_zip, server_dir, WORLD)
        install_probe(server_dir, WORLD, PROBE)
        install_addon(args.addon, server_dir, WORLD)
        exercise_world(server_dir, "NARWHAL_CHARM_REGISTERED")
        runtime_probe = enable_beta_test_apis(server_dir, WORLD)
        shutil.copyfile(PROBE.with_name("narwhal-bedrock-regroup-probe.js"), runtime_probe)
        exercise_world(server_dir, "NARWHAL_REGROUP_PLAYABLE")


if __name__ == "__main__":
    main()
