import importlib.util
import io
import json
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

    def test_mismatched_dependency_cannot_be_packaged(self):
        manifests = {
            kind: builder.read_json(ADDON / kind / "manifest.json") for kind in builder.PACK_TYPES
        }
        manifests["behavior_pack"]["dependencies"][0]["version"] = [99, 0, 0]
        with self.assertRaisesRegex(ValueError, "matching resource pack UUID and version"):
            builder.validate_manifests(manifests)

    def test_treat_recipe_matches_java(self):
        java = builder.read_json(MOD / "src/main/resources/data/mushroom_yorkie/recipe/yorkie_treat.json")
        bedrock = builder.read_json(ADDON / "behavior_pack/recipes/yorkie_treat.json")[
            "minecraft:recipe_shapeless"
        ]
        self.assertEqual(Counter(java["ingredients"]), Counter(entry["item"] for entry in bedrock["ingredients"]))
        self.assertEqual(java["result"]["id"], bedrock["result"]["item"])
        self.assertEqual(java["result"]["count"], bedrock["result"]["count"])


if __name__ == "__main__":
    unittest.main()
