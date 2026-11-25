"""Boot the packaged Mushroom add-on in a fresh Bedrock Dedicated Server world."""

import argparse
import io
import json
import os
import queue
import subprocess
import tempfile
import threading
import time
from pathlib import Path
from zipfile import ZipFile

WORLD = "Mushroom Bedrock Smoke"
ENTITY = "mushroom_yorkie:mushroom_yorkie"
TAG = "mushroom_smoke"
SERVER_PROPERTIES = {
    "level-name": WORLD,
    "gamemode": "survival",
    "allow-cheats": "true",
    "allow-list": "true",
    "enable-lan-visibility": "false",
    "transport": "raknet",
    "content-log-console-output-enabled": "true",
    "content-log-level": "warning",
}


def install_addon(addon_path, server_dir):
    world_dir = server_dir / "worlds" / WORLD
    world_dir.mkdir(parents=True)
    with ZipFile(addon_path) as addon:
        for role, kind in (("data", "behavior"), ("resources", "resource")):
            [bundle] = [name for name in addon.namelist() if name.endswith(f"-{role}.mcpack")]
            pack_dir = server_dir / f"{kind}_packs" / "mushroom_the_yorkie"
            with ZipFile(io.BytesIO(addon.read(bundle))) as pack:
                pack.extractall(pack_dir)
                header = json.loads(pack.read("manifest.json"))["header"]
            link = [{"pack_id": header["uuid"], "version": header["version"]}]
            (world_dir / f"world_{kind}_packs.json").write_text(json.dumps(link), encoding="utf-8")


def collect_output(stream, lines):
    for line in stream:
        print(line, end="", flush=True)
        lines.put(line)
    lines.put(None)


def expect_line(lines, marker, timeout=45):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            line = lines.get(timeout=max(0, deadline - time.monotonic()))
        except queue.Empty:
            break
        if line is None:
            raise RuntimeError(f"Server exited while waiting for {marker!r}")
        if "ERROR" in line and any(
            part in line.lower() for part in ("[entity]", "[json]", "[recipes]", "[item]", "mushroom")
        ):
            raise RuntimeError(f"Bedrock rejected content: {line.strip()}")
        if marker in line:
            return
    raise RuntimeError(f"Server did not report {marker!r} in {timeout}s")


def exercise_world(server_dir, first_boot):
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

        def command(value):
            print(f"> {value}", flush=True)
            server.stdin.write(value + "\n")
            server.stdin.flush()

        try:
            expect_line(lines, "Server started.")
            if first_boot:
                command("tickingarea add circle 0 300 0 1 mushroom_smoke true")
                expect_line(lines, "ticking area", timeout=15)
                command("fill -4 300 -4 4 300 4 stone")
                expect_line(lines, "blocks filled", timeout=15)
                command(f"summon {ENTITY} 0 301 0 0 0 minecraft:entity_spawned")
                expect_line(lines, "summoned", timeout=15)
                command(f"tag @e[type={ENTITY},c=1] add {TAG}")
                expect_line(lines, TAG, timeout=15)
            command(f"testfor @e[type={ENTITY},tag={TAG}]")
            expect_line(lines, "Found ", timeout=15)
        finally:
            if server.poll() is None:
                command("stop")
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
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="mushroom-bedrock-smoke-") as directory:
        server_dir = Path(directory)
        with ZipFile(args.server_zip) as source:
            source.extractall(server_dir)
        (server_dir / "bedrock_server").chmod(0o755)
        (server_dir / "server.properties").write_text(
            "".join(f"{key}={value}\n" for key, value in SERVER_PROPERTIES.items()), encoding="utf-8"
        )
        install_addon(args.addon, server_dir)
        exercise_world(server_dir, first_boot=True)
        exercise_world(server_dir, first_boot=False)
        print("Mushroom spawned and remained in the world after a server restart.")


if __name__ == "__main__":
    main()
