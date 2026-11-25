import importlib.util
import io
import json
import subprocess
import sys
import tempfile
import unittest
from collections import Counter
from pathlib import Path
from zipfile import ZipFile

SPEC = importlib.util.spec_from_file_location(
    "build_bedrock_addon", Path(__file__).resolve().parents[1] / "build-bedrock-addon.py"
)
builder = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(builder)

MOD = builder.ROOT / "mods" / "mushroom-the-yorkie"
ADDON = MOD / "bedrock"
ASSETS = MOD / "src/main/resources/assets/mushroom_yorkie"


class BedrockPackageTests(unittest.TestCase):
    def test_artifact_has_linked_packs_and_reuses_java_art(self):
        with tempfile.TemporaryDirectory() as directory:
            first = builder.build(MOD, Path(directory) / "first")
            second = builder.build(MOD, Path(directory) / "second")
            self.assertEqual(first.read_bytes(), second.read_bytes())
            with ZipFile(first) as addon:
                self.assertIsNone(addon.testzip())
                self.assertEqual(len(addon.namelist()), 2)
                with (
                    ZipFile(io.BytesIO(addon.read(f"{MOD.name}-data.mcpack"))) as behavior,
                    ZipFile(io.BytesIO(addon.read(f"{MOD.name}-resources.mcpack"))) as resource,
                ):
                    for pack in (behavior, resource):
                        self.assertIsNone(pack.testzip())
                        self.assertIn("manifest.json", pack.namelist())
                        self.assertEqual(pack.read("pack_icon.png"), (ASSETS / "icon.png").read_bytes())
                    self.assertEqual(
                        resource.read("textures/entity/mushroom_yorkie.png"),
                        (ASSETS / "textures/entity/mushroom_yorkie.png").read_bytes(),
                    )
                    status = {"behavior_pack": json.loads(behavior.read("manifest.json")),
                              "resource_pack": json.loads(resource.read("manifest.json"))}
                    builder.validate_manifests(status)
                    [script] = [module for module in status["behavior_pack"]["modules"] if module["type"] == "script"]
                    expected = (ADDON / "behavior_pack" / script["entry"]).read_bytes()
                    self.assertEqual(behavior.read(script["entry"]), expected)

    def test_cops_archive_uses_current_java_assets_and_separate_ids(self):
        cops = builder.ROOT / "mods" / "cops-and-robbers"
        bedrock = cops / "bedrock"
        subprocess.run([sys.executable, str(bedrock / "tools/build-structures.py"), "--check"], check=True)
        subprocess.run([sys.executable, str(bedrock / "tools/build-vehicles.py"), "--check"], check=True)
        with tempfile.TemporaryDirectory() as directory:
            archive = builder.build(cops, Path(directory))
            self.assertEqual(archive.read_bytes(), builder.build(cops, Path(directory) / "again").read_bytes())
            with ZipFile(archive) as addon:
                with (
                    ZipFile(io.BytesIO(addon.read(f"{cops.name}-data.mcpack"))) as behavior,
                    ZipFile(io.BytesIO(addon.read(f"{cops.name}-resources.mcpack"))) as resource,
                ):
                    for name in ("bank", "police_station", "fire_station"):
                        path = f"structures/cops_robbers/{name}.mcstructure"
                        self.assertEqual(behavior.read(path), (bedrock / "behavior_pack" / path).read_bytes())
                        self.assertIn(f"items/{name}_kit.json", behavior.namelist())
                        art = cops / "src/main/resources/assets/cops_robbers" / f"textures/item/{name}_kit.png"
                        self.assertEqual(resource.read(f"textures/items/{name}_kit.png"), art.read_bytes())
                    for name in ("police_cruiser", "fire_truck"):
                        self.assertIn(f"entities/{name}.json", behavior.namelist())
                        art = cops / "src/main/resources/assets/cops_robbers" / f"textures/entity/{name}.png"
                        self.assertEqual(resource.read(f"textures/entity/{name}.png"), art.read_bytes())

        identifiers = []
        for addon in (ADDON, bedrock):
            for kind in builder.PACK_TYPES:
                manifest = builder.read_json(addon / kind / "manifest.json")
                identifiers.extend(entry["uuid"] for entry in (manifest["header"], *manifest["modules"]))
        self.assertEqual(len(identifiers), len(set(identifiers)))

    def test_mismatched_dependency_cannot_be_packaged(self):
        manifests = {
            kind: builder.read_json(ADDON / kind / "manifest.json") for kind in builder.PACK_TYPES
        }
        manifests["behavior_pack"]["dependencies"][0]["version"] = [99, 0, 0]
        with self.assertRaisesRegex(ValueError, "matching resource pack UUID and version"):
            builder.validate_manifests(manifests)

    def test_shared_recipes_match_java(self):
        java_recipes = MOD / "src/main/resources/data/mushroom_yorkie/recipe"
        bedrock_recipes = ADDON / "behavior_pack/recipes"
        for name in (
            "yorkie_treat", "yorkie_harness", "dog_bowl", "dog_food_bowl", "dog_water_bowl",
            "dog_bed", "doghouse", "yorkie_ball", "yorkie_chew_toy",
        ):
            with self.subTest(recipe=name):
                java = builder.read_json(java_recipes / f"{name}.json")
                bedrock = builder.read_json(bedrock_recipes / f"{name}.json")
                if "pattern" in java:
                    actual = bedrock["minecraft:recipe_shaped"]
                    self.assertEqual(java["pattern"], actual["pattern"])
                    self.assertEqual(java["key"], {symbol: entry["item"] for symbol, entry in actual["key"].items()})
                else:
                    actual = bedrock["minecraft:recipe_shapeless"]
                    self.assertEqual(
                        Counter(java["ingredients"]),
                        Counter(entry["item"] for entry in actual["ingredients"]),
                    )
                self.assertEqual(java["result"]["id"], actual["result"]["item"])
                self.assertEqual(java["result"]["count"], actual["result"]["count"])


if __name__ == "__main__":
    unittest.main()
