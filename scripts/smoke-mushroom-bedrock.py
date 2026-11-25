"""Boot the packaged Mushroom add-on in a fresh Bedrock Dedicated Server world."""

import argparse
import io
import json
import os
import queue
import shutil
import struct
import subprocess
import tempfile
import threading
import time
from pathlib import Path
from zipfile import ZipFile

WORLD = "Mushroom Bedrock Smoke"
PROBE_ID = "836a477e-ab53-4084-8ff3-600c098fb836"
PROBE_SOURCE = Path(__file__).with_name("fixtures") / "mushroom-bedrock-smoke.js"
PLAYER_PROBE_SOURCE = PROBE_SOURCE.with_name("mushroom-bedrock-player-probe.js")
ADOPTION_PROBE_SOURCE = PROBE_SOURCE.with_name("mushroom-bedrock-adoption-probe.js")
SERVER_PROPERTIES = {
    "level-name": WORLD,
    "gamemode": "survival",
    "allow-list": "true",
    "enable-lan-visibility": "false",
    "transport": "nethernet",
    "content-log-console-output-enabled": "true",
    "content-log-level": "warning",
}


def install_addon(addon_path, server_dir):
    world_dir = server_dir / "worlds" / WORLD
    world_dir.mkdir(parents=True, exist_ok=True)
    with ZipFile(addon_path) as addon:
        for role, kind in (("data", "behavior"), ("resources", "resource")):
            [bundle] = [name for name in addon.namelist() if name.endswith(f"-{role}.mcpack")]
            pack_dir = server_dir / f"{kind}_packs" / "mushroom_the_yorkie"
            if pack_dir.is_dir():
                shutil.rmtree(pack_dir)
            with ZipFile(io.BytesIO(addon.read(bundle))) as pack:
                pack.extractall(pack_dir)
                header = json.loads(pack.read("manifest.json"))["header"]
            link = [{"pack_id": header["uuid"], "version": header["version"]}]
            if kind == "behavior":
                link.append({"pack_id": PROBE_ID, "version": [1, 0, 0]})
            (world_dir / f"world_{kind}_packs.json").write_text(json.dumps(link), encoding="utf-8")


def install_probe(server_dir):
    pack_dir = server_dir / "behavior_packs" / "mushroom_smoke_test"
    scripts = pack_dir / "scripts"
    scripts.mkdir(parents=True)
    shutil.copyfile(PROBE_SOURCE, scripts / "probe.js")
    manifest = {
        "format_version": 2,
        "header": {
            "name": "Mushroom Smoke Test",
            "description": "Test fixture for a disposable world",
            "uuid": PROBE_ID,
            "version": [1, 0, 0],
            "min_engine_version": [1, 26, 60],
        },
        "modules": [{
            "type": "script",
            "language": "javascript",
            "entry": "scripts/probe.js",
            "uuid": "74c5afd1-2ba5-49cc-af25-b9f47a6e314e",
            "version": [1, 0, 0],
        }],
        "dependencies": [{"module_name": "@minecraft/server", "version": "2.11.0"}],
    }
    (pack_dir / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")


def enable_beta_test_apis(server_dir):
    # The production packs have already been exercised in a normal world.
    # This edit is limited to the newly generated, disposable GameTest world.
    level = server_dir / "worlds" / WORLD / "level.dat"
    raw = level.read_bytes()
    version, length = struct.unpack_from("<II", raw)
    payload = raw[8:]
    if len(payload) != length or payload[0] != 10 or payload[-1] != 0:
        raise ValueError("Unexpected Bedrock level.dat header or compound terminator")

    experiments = b"\x0a\x0b\x00experiments"
    game_test = b"\x01\x08\x00gametest"
    offset = payload.find(experiments)
    if offset < 0:
        payload = payload[:-1] + experiments + game_test + b"\x01\x00\x00"
    else:
        start = offset + len(experiments)
        cursor = start
        while payload[cursor] == 1:
            name_length = struct.unpack_from("<H", payload, cursor + 1)[0]
            value = cursor + 3 + name_length
            if payload[cursor:value] == game_test:
                payload = payload[:value] + b"\x01" + payload[value + 1:]
                break
            cursor = value + 1
        else:
            if payload[cursor] != 0:
                raise ValueError("Expected byte flags in the generated experiments compound")
            payload = payload[:cursor] + game_test + b"\x01" + payload[cursor:]
    level.write_bytes(struct.pack("<II", version, len(payload)) + payload)

    probe = server_dir / "behavior_packs" / "mushroom_smoke_test"
    manifest_path = probe / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["dependencies"].append({"module_name": "@minecraft/server-gametest", "version": "1.0.0-beta"})
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    return probe / "scripts" / "probe.js"


def collect_output(stream, lines):
    for line in stream:
        print(line, end="", flush=True)
        lines.put(line)
    lines.put(None)


def expect_line(lines, marker, timeout=90):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            line = lines.get(timeout=max(0, deadline - time.monotonic()))
        except queue.Empty:
            break
        if line is None:
            raise RuntimeError(f"Server exited while waiting for {marker!r}")
        if "MUSHROOM_TEST_FAIL" in line or ("ERROR" in line and any(
            part in line.lower() for part in (
                "[blocks]", "[components]", "[entity]", "[json]", "[recipes]", "[item]", "[scripting]", "mushroom"
            )
        )):
            raise RuntimeError(f"Bedrock rejected content: {line.strip()}")
        if marker in line:
            return
    raise RuntimeError(f"Server did not report {marker!r} in {timeout}s")


def exercise_world(server_dir, marker):
    with subprocess.Popen(
        [str(server_dir / "bedrock_server")],
        cwd=server_dir,
        env={**os.environ, "LD_LIBRARY_PATH": str(server_dir)},
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
    ) as server:
        lines = queue.Queue()
        reader = threading.Thread(target=collect_output, args=(server.stdout, lines), daemon=True)
        reader.start()

        try:
            expect_line(lines, marker)
        finally:
            if server.poll() is None:
                server.stdin.write("stop\n")
                server.stdin.flush()
                try:
                    server.wait(timeout=20)
                except subprocess.TimeoutExpired:
                    server.kill()
                    server.wait()
            reader.join(timeout=5)
        if server.returncode:
            raise RuntimeError(f"Bedrock exited with status {server.returncode}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("server_zip", type=Path)
    parser.add_argument("addon", type=Path)
    parser.add_argument("--upgrade-from", type=Path)
    parser.add_argument("--verify-care-persistence", action="store_true")
    parser.add_argument("--verify-fetch", action="store_true", help="run an opt-in simulated-player fetch test")
    parser.add_argument("--verify-adoption", action="store_true", help="run an opt-in simulated-player sleep adoption test")
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="mushroom-bedrock-smoke-") as directory:
        server_dir = Path(directory)
        with ZipFile(args.server_zip) as source:
            source.extractall(server_dir)
        (server_dir / "bedrock_server").chmod(0o755)
        (server_dir / "server.properties").write_text(
            "".join(f"{key}={value}\n" for key, value in SERVER_PROPERTIES.items()), encoding="utf-8"
        )
        install_probe(server_dir)
        install_addon(args.upgrade_from or args.addon, server_dir)
        exercise_world(server_dir, "MUSHROOM_TEST_SPAWNED")
        if args.upgrade_from:
            install_addon(args.addon, server_dir)
        exercise_world(server_dir, "MUSHROOM_TEST_REOPENED")
        if args.verify_care_persistence:
            exercise_world(server_dir, "MUSHROOM_TEST_CARE_PERSISTED")
        if args.verify_fetch or args.verify_adoption:
            probe = enable_beta_test_apis(server_dir)
            if args.verify_fetch:
                shutil.copyfile(PLAYER_PROBE_SOURCE, probe)
                exercise_world(server_dir, "MUSHROOM_SIM_PASS")
                exercise_world(server_dir, "MUSHROOM_SIM_CARGO_SAVED")
            if args.verify_adoption:
                shutil.copyfile(ADOPTION_PROBE_SOURCE, probe)
                exercise_world(server_dir, "MUSHROOM_ADOPTION_RECOVERY")
        print("Mushroom spawned and remained in the world after a server restart.")


if __name__ == "__main__":
    main()
