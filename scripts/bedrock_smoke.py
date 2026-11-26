"""Shared runner for Bedrock Dedicated Server tests in disposable worlds."""

from dataclasses import dataclass, replace
import io
import json
import os
import queue
import shlex
import shutil
import struct
import subprocess
import threading
import time
from zipfile import ZipFile

FIXTURE_FOLDER = "bedrock_smoke_test"


@dataclass(frozen=True)
class SmokeWorld:
    name: str
    addon_folder: str
    probe_id: str
    script_id: str


def prepare_server(server_zip, server_dir, world):
    with ZipFile(server_zip) as source:
        source.extractall(server_dir)
    (server_dir / "bedrock_server").chmod(0o755)
    properties = {
        "level-name": world.name,
        "gamemode": "survival",
        "allow-list": "true",
        "enable-lan-visibility": "false",
        "transport": "nethernet",
        "content-log-console-output-enabled": "true",
        "content-log-level": "warning",
    }
    (server_dir / "server.properties").write_text(
        "".join(f"{key}={value}\n" for key, value in properties.items()), encoding="utf-8"
    )


def install_addon(addon_path, server_dir, world):
    world_dir = server_dir / "worlds" / world.name
    world_dir.mkdir(parents=True, exist_ok=True)
    installation = []
    with ZipFile(addon_path) as addon:
        for role, kind in (("data", "behavior"), ("resources", "resource")):
            [bundle] = [name for name in addon.namelist() if name.endswith(f"-{role}.mcpack")]
            pack_dir = server_dir / f"{kind}_packs" / world.addon_folder
            content = addon.read(bundle)
            with ZipFile(io.BytesIO(content)) as pack:
                header = json.loads(pack.read("manifest.json"))["header"]
            manifest_path = pack_dir / "manifest.json"
            links_path = world_dir / f"world_{kind}_packs.json"
            links = json.loads(links_path.read_text(encoding="utf-8")) if links_path.exists() else []
            version = {"pack_id": header["uuid"], "version": header["version"]}
            index = next((i for i, link in enumerate(links) if link["pack_id"] == header["uuid"]), None)
            if header["uuid"] == world.probe_id:
                raise ValueError(f"{addon_path} conflicts with the test fixture pack ID")
            if manifest_path.exists():
                installed = json.loads(manifest_path.read_text(encoding="utf-8"))["header"]
                if installed["uuid"] != header["uuid"]:
                    raise ValueError(f"{addon_path} changes the installed {kind} pack ID")
            elif index is not None:
                raise ValueError(f"{addon_path} duplicates an installed {kind} pack ID")

            if index is None:
                links.append(version)
            else:
                links[index] = version
            if kind == "behavior" and not any(link["pack_id"] == world.probe_id for link in links):
                links.append({"pack_id": world.probe_id, "version": [1, 0, 0]})
            installation.append((pack_dir, content, links_path, links))

    for pack_dir, content, links_path, links in installation:
        if pack_dir.is_dir():
            shutil.rmtree(pack_dir)
        with ZipFile(io.BytesIO(content)) as pack:
            pack.extractall(pack_dir)
        links_path.write_text(json.dumps(links), encoding="utf-8")


def install_companion_addons(addon_paths, server_dir, world):
    for number, addon_path in enumerate(addon_paths, start=1):
        companion = replace(world, addon_folder=f"{world.addon_folder}_companion_{number}")
        install_addon(addon_path, server_dir, companion)


def install_probe(server_dir, world, source):
    pack_dir = server_dir / "behavior_packs" / FIXTURE_FOLDER
    scripts = pack_dir / "scripts"
    scripts.mkdir(parents=True)
    shutil.copyfile(source, scripts / "probe.js")
    manifest = {
        "format_version": 2,
        "header": {
            "name": world.name + " Fixture",
            "description": "Test fixture for a disposable world",
            "uuid": world.probe_id,
            "version": [1, 0, 0],
            "min_engine_version": [1, 26, 60],
        },
        "modules": [{
            "type": "script",
            "language": "javascript",
            "entry": "scripts/probe.js",
            "uuid": world.script_id,
            "version": [1, 0, 0],
        }],
        "dependencies": [{"module_name": "@minecraft/server", "version": "2.11.0"}],
    }
    (pack_dir / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")


def enable_beta_test_apis(server_dir, world):
    # The production packs have already been exercised in a normal world.
    # This edit is limited to the newly generated, disposable GameTest world.
    level = server_dir / "worlds" / world.name / "level.dat"
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

    probe = server_dir / "behavior_packs" / FIXTURE_FOLDER
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


def expect_line(lines, marker, *, startup_timeout=180, timeout=150, heartbeat=None):
    started = heartbeat is not None
    deadline = time.monotonic() + (timeout if started else startup_timeout)
    next_progress = time.monotonic() + 60 if heartbeat else float("inf")
    while time.monotonic() < deadline:
        try:
            if time.monotonic() >= next_progress:
                raise RuntimeError(f"Gameplay stopped reporting {heartbeat} while waiting for {marker}")
            line = lines.get(timeout=max(0, min(deadline, next_progress) - time.monotonic()))
        except queue.Empty:
            if next_progress < deadline:
                raise RuntimeError(f"Gameplay stopped reporting {heartbeat} while waiting for {marker}")
            break
        if line is None:
            raise RuntimeError(f"Server exited while waiting for {marker!r}")
        if "_TEST_FAIL" in line:
            raise RuntimeError(f"Bedrock scenario failed: {line.strip()}")
        if "ERROR" in line and any(
            part in line.lower() for part in (
                "[blocks]", "[components]", "[entity]", "[json]", "[recipes]", "[item]", "[scripting]", "mushroom", "cops_robbers"
            )
        ):
            raise RuntimeError(f"Bedrock rejected content: {line.strip()}")
        if marker in line:
            return
        if heartbeat and heartbeat in line:
            next_progress = time.monotonic() + 60
        if not started and line.rstrip().endswith(" INFO] Server started."):
            started = True
            deadline = time.monotonic() + timeout
    if started:
        raise RuntimeError(f"Server did not report {marker!r} within {timeout}s after startup")
    raise RuntimeError(f"Server did not start or report {marker!r} within {startup_timeout}s")


def exercise_world(server_dir, marker, *, timeout=150, play_seconds=None):
    prefix = shlex.split(os.environ.get("MUSHROOM_BEDROCK_SERVER_PREFIX", ""))
    with subprocess.Popen(
        [*prefix, str(server_dir / "bedrock_server")],
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
            if play_seconds is None:
                expect_line(lines, marker, timeout=timeout)
            else:
                expect_line(lines, "MUSHROOM_PLAY_START", timeout=timeout)
                started = time.monotonic()
                expect_line(lines, marker, timeout=play_seconds + 180, heartbeat="MUSHROOM_PLAY_RESULT")
                observed = time.monotonic() - started
                if observed < play_seconds:
                    raise RuntimeError(f"Only observed {observed:.1f}s of continuous Bedrock play")
                print(f"MUSHROOM_PLAY_OBSERVED_SECONDS {observed:.1f}", flush=True)
        finally:
            if server.poll() is None:
                server.stdin.write("stop\n")
                server.stdin.flush()
                try:
                    server.wait(timeout=45)
                except subprocess.TimeoutExpired:
                    server.kill()
                    server.wait()
            reader.join(timeout=5)
        if server.returncode:
            raise RuntimeError(f"Bedrock exited with status {server.returncode}")
