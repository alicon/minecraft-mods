from collections import deque
from io import BytesIO
import json
from pathlib import Path
import queue
import sys
import tempfile
import unittest
from unittest.mock import patch
from zipfile import ZipFile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bedrock_smoke import SmokeWorld, expect_line, install_addon, install_companion_addons


def write_addon(path, behavior_id, resource_id, version):
    with ZipFile(path, "w") as bundle:
        for role, identifier in (("data", behavior_id), ("resources", resource_id)):
            content = BytesIO()
            with ZipFile(content, "w") as pack:
                pack.writestr("manifest.json", json.dumps({"header": {"uuid": identifier, "version": version}}))
            bundle.writestr(f"example-{role}.mcpack", content.getvalue())
    return path


class BedrockSmokeInstallerTests(unittest.TestCase):
    def setUp(self):
        self.world = SmokeWorld("Pack Test", "main", "smoke-fixture", "smoke-script")
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        self.server = self.root / "server"
        self.main = write_addon(self.root / "main.mcaddon", "main-behavior", "main-resources", [0, 1, 0])
        install_addon(self.main, self.server, self.world)

    def links(self, kind):
        path = self.server / "worlds" / self.world.name / f"world_{kind}_packs.json"
        links = json.loads(path.read_text(encoding="utf-8"))
        versions = {link["pack_id"]: link["version"] for link in links}
        self.assertEqual(len(links), len(versions), f"duplicate {kind} pack link")
        return versions

    def test_upgrade_preserves_both_companions_and_the_fixture(self):
        first = write_addon(self.root / "first.mcaddon", "first-behavior", "first-resources", [0, 9, 2])
        second = write_addon(self.root / "second.mcaddon", "second-behavior", "second-resources", [0, 4, 1])
        install_companion_addons([first, second], self.server, self.world)
        upgraded = write_addon(self.root / "updated.mcaddon", "main-behavior", "main-resources", [0, 1, 1])
        install_addon(upgraded, self.server, self.world)

        self.assertEqual(self.links("behavior"), {
            "main-behavior": [0, 1, 1], "smoke-fixture": [1, 0, 0],
            "first-behavior": [0, 9, 2], "second-behavior": [0, 4, 1],
        })
        self.assertEqual(self.links("resource"), {
            "main-resources": [0, 1, 1], "first-resources": [0, 9, 2], "second-resources": [0, 4, 1],
        })

    def test_resource_id_collision_does_not_partly_install_a_companion(self):
        collision = write_addon(self.root / "collision.mcaddon", "other-behavior", "main-resources", [0, 2, 0])
        with self.assertRaisesRegex(ValueError, "duplicates an installed resource pack ID"):
            install_companion_addons([collision], self.server, self.world)
        self.assertNotIn("other-behavior", self.links("behavior"))
        self.assertEqual(self.links("resource"), {"main-resources": [0, 1, 0]})
        self.assertFalse((self.server / "behavior_packs" / "main_companion_1").exists())

    def test_upgrade_with_a_new_pack_id_is_rejected_before_installation(self):
        invalid = write_addon(self.root / "invalid.mcaddon", "main-behavior", "new-resource-id", [0, 1, 1])
        with self.assertRaisesRegex(ValueError, "changes the installed resource pack ID"):
            install_addon(invalid, self.server, self.world)
        self.assertEqual(self.links("behavior")["main-behavior"], [0, 1, 0])
        self.assertEqual(self.links("resource"), {"main-resources": [0, 1, 0]})


class ScriptedServerOutput:
    def __init__(self, *lines):
        self.lines = deque(lines)
        self.now = 0

    def get(self, *, timeout):
        if self.lines and self.lines[0][0] <= self.now + timeout:
            self.now, line = self.lines.popleft()
            return line
        self.now += timeout
        raise queue.Empty

    def monotonic(self):
        return self.now


class BedrockSmokeTimingTests(unittest.TestCase):
    STARTED = "[2026-11-25 17:02:04:049 INFO] Server started.\n"

    def test_gameplay_gets_its_full_timeout_after_a_slow_start(self):
        output = ScriptedServerOutput((9, self.STARTED), (13, "PLAYABLE"))
        with patch("bedrock_smoke.time.monotonic", output.monotonic):
            expect_line(output, "PLAYABLE", startup_timeout=10, timeout=5)

    def test_repeated_startup_line_does_not_extend_the_gameplay_timeout(self):
        output = ScriptedServerOutput((9, self.STARTED), (12, self.STARTED), (15, "PLAYABLE"))
        with patch("bedrock_smoke.time.monotonic", output.monotonic):
            with self.assertRaisesRegex(RuntimeError, "within 5s after startup"):
                expect_line(output, "PLAYABLE", startup_timeout=10, timeout=5)

    def test_startup_stays_bounded_when_the_server_never_becomes_ready(self):
        output = ScriptedServerOutput((11, self.STARTED))
        with patch("bedrock_smoke.time.monotonic", output.monotonic):
            with self.assertRaisesRegex(RuntimeError, "did not start .* within 10s"):
                expect_line(output, "PLAYABLE", startup_timeout=10, timeout=5)


if __name__ == "__main__":
    unittest.main()
