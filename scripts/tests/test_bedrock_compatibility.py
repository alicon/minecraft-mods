"""Check that existing worlds can still resolve the content shipped in earlier packs."""

import hashlib
import importlib.util
import io
import json
import tempfile
import unittest
from pathlib import Path, PurePosixPath
from zipfile import ZipFile

SCRIPTS = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("builder", SCRIPTS / "build-bedrock-addon.py")
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)
BASELINES = SCRIPTS / "fixtures/bedrock-pack-baselines.json"
DEFINITIONS = {"entities": "minecraft:entity", "blocks": "minecraft:block", "items": "minecraft:item"}


def read_pack_identity(archive):
    result = {"sha256": hashlib.sha256(archive.read_bytes()).hexdigest(), "packs": {}}
    with ZipFile(archive) as addon:
        for name in addon.namelist():
            with ZipFile(io.BytesIO(addon.read(name))) as pack:
                manifest = json.loads(pack.read("manifest.json"))
                kind = next(m["type"] for m in manifest["modules"] if m["type"] in ("data", "resources"))
                header = manifest["header"]
                result["packs"][kind] = {
                    "header": header["uuid"],
                    "modules": {module["type"]: module["uuid"] for module in manifest["modules"]},
                }
                if kind == "data":
                    result["version"] = header["version"]
                    identifiers = {folder: [] for folder in DEFINITIONS}
                    for entry in pack.namelist():
                        path = PurePosixPath(entry)
                        folder = path.parts[0]
                        if folder in DEFINITIONS and path.suffix == ".json":
                            definition = json.loads(pack.read(entry))[DEFINITIONS[folder]]
                            identifiers[folder].append(definition["description"]["identifier"])
                    result["identifiers"] = {key: sorted(values) for key, values in identifiers.items()}
    return result


class BedrockCompatibilityTests(unittest.TestCase):
    def test_built_packs_preserve_world_identifiers(self):
        baselines = json.loads(BASELINES.read_text(encoding="utf-8"))
        with tempfile.TemporaryDirectory() as output:
            for mod, baseline in baselines.items():
                with self.subTest(mod=mod):
                    archive = builder.build(builder.ROOT / "mods" / mod, Path(output))
                    current = read_pack_identity(archive)
                    for kind, old in baseline["packs"].items():
                        self.assertEqual(old["header"], current["packs"][kind]["header"], kind)
                        for role, identifier in old["modules"].items():
                            self.assertEqual(identifier, current["packs"][kind]["modules"].get(role), role)
                    for kind, identifiers in baseline["identifiers"].items():
                        actual = current["identifiers"][kind]
                        self.assertEqual(len(actual), len(set(actual)), f"Duplicate {kind} identifiers")
                        self.assertFalse(set(identifiers) - set(actual), f"Missing {kind}: {set(identifiers) - set(actual)}")
                    if current["sha256"] != baseline["sha256"]:
                        self.assertGreater(current["version"], baseline["version"],
                                           "Changed bytes require a higher linked pack version")


if __name__ == "__main__":
    unittest.main()
