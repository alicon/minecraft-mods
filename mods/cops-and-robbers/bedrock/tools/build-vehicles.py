"""Convert the original Java vehicle cuboids and UV offsets to Bedrock geometry."""

import argparse
import json
from pathlib import Path
import re

MOD = Path(__file__).resolve().parents[2]
JAVA = MOD / "src/client/java/dev/alicon/copsrobbers/client/render/PoliceCruiserModel.java"
TARGET = MOD / "bedrock/resource_pack/models/entity/vehicle.geo.json"
NUMBER = r"[-+]?(?:\d+\.\d+|\d+)"
BOX = re.compile(
    r'root\.addOrReplaceChild\("([^"]+)",\s*CubeListBuilder\.create\(\)\s*'
    r'\.texOffs\((\d+),\s*(\d+)\)\s*'
    r'\.addBox\(([^)]*)\),\s*PartPose\.offset\(([^)]*)\)\);'
)
WHEEL = re.compile(r'addWheel\(root,\s*"([^"]+)",\s*(' + NUMBER + r')F,\s*(' + NUMBER + r')F\);')


def numbers(source):
    return [float(value) for value in re.findall(r"(" + NUMBER + r")F", source)]


def bone(name, uv, box, offset):
    x, y, z, width, height, depth = box
    px, py, pz = offset
    # Java cuboids start at the top of their Y interval. Bedrock starts at the bottom.
    origin = [px + x, 22.5 - py - y - height, pz + z]
    return {
        "name": name,
        "parent": "root",
        "pivot": [px, 22.5 - py, pz],
        "cubes": [{"origin": origin, "size": [width, height, depth], "uv": uv}],
    }


def build():
    source = JAVA.read_text(encoding="utf-8")
    bones = [{"name": "root", "pivot": [0, 0, 0]}]
    for name, u, v, box, offset in BOX.findall(source):
        bones.append(bone(name, [int(u), int(v)], numbers(box), numbers(offset)))
    for name, x, z in WHEEL.findall(source):
        bones.append(bone(name, [104, 56], [-2.5, -4.5, -4.5, 5, 9, 9], [float(x), 18, float(z)]))
    if len(bones) != 27:
        raise ValueError("The Java vehicle model changed. Verify the Bedrock conversion.")
    return {
        "format_version": "1.12.0",
        "minecraft:geometry": [{
            "description": {
                "identifier": "geometry.cops_robbers.vehicle",
                "texture_width": 160, "texture_height": 96,
                "visible_bounds_width": 5, "visible_bounds_height": 4,
                "visible_bounds_offset": [0, 1, 0],
            },
            "bones": bones,
        }],
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    data = json.dumps(build(), indent=2) + "\n"
    if args.check:
        if not TARGET.is_file() or TARGET.read_text(encoding="utf-8") != data:
            parser.error("Generated vehicle geometry is stale. Rerun build-vehicles.py.")
    else:
        TARGET.write_text(data, encoding="utf-8")
