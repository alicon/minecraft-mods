"""Build the three Bedrock kit templates and their matching gameplay anchors."""

import argparse
import json
from pathlib import Path
from struct import pack

PACK = Path(__file__).resolve().parents[1] / "behavior_pack"
WIDTH = 13
HEIGHT = 6
BLOCK_VERSION = (1 << 24) | (26 << 16) | (60 << 8)
BLOCK_STATES = {
    "quartz_block": {"pillar_axis": "y", "chisel_type": "default"},
    "iron_bars": {f"minecraft:connection_{side}": False for side in ("north", "east", "south", "west")},
    "blue_concrete": {"color": "blue"},
    "white_concrete": {"color": "white"},
    "red_concrete": {"color": "red"},
    "yellow_concrete": {"color": "yellow"},
    "light_gray_concrete": {"color": "silver"},
    "white_wool": {"color": "white"},
    "stone_bricks": {"stone_brick_type": "default"},
    "oak_planks": {"wood_type": "oak"},
    "dark_oak_planks": {"wood_type": "dark_oak"},
    "chest": {"minecraft:cardinal_direction": "north", "facing_direction": 2},
}
DOOR_DIRECTIONS = {"south": 0, "west": 1, "north": 2, "east": 3}


class Layout:
    def __init__(self, floor, wall, roof):
        self.blocks = {}
        self.fill(floor, (0, 0, 0), (12, 0, 12))
        self.fill(wall, (0, 1, 0), (0, 3, 12))
        self.fill(wall, (12, 1, 0), (12, 3, 12))
        self.fill(wall, (1, 1, 0), (11, 3, 0))
        self.fill(wall, (1, 1, 12), (11, 3, 12))
        self.fill(roof, (0, 4, 0), (12, 4, 12))
        self.fill("sea_lantern", (5, 4, 4), (7, 4, 4))
        self.fill("sea_lantern", (5, 4, 9), (7, 4, 9))

    def fill(self, block, start, stop):
        for x in range(start[0], stop[0] + 1):
            for y in range(start[1], stop[1] + 1):
                for z in range(start[2], stop[2] + 1):
                    self.put((x, y, z), block)

    def put(self, position, block, **states):
        if block == "air":
            self.blocks.pop(position, None)
        else:
            self.blocks[position] = (block, tuple(sorted({**BLOCK_STATES.get(block, {}), **states}.items())))

    def door(self, block, x, z, direction):
        for upper in (False, True):
            self.put((x, 1 + int(upper), z), block, direction=DOOR_DIRECTIONS[direction],
                     door_hinge_bit=False, open_bit=False, upper_block_bit=upper,
                     **{"minecraft:cardinal_direction": direction})


def police_station():
    layout = Layout("smooth_stone", "quartz_block", "quartz_block")
    layout.fill("light_gray_concrete", (7, 0, 0), (11, 0, 11))
    layout.fill("yellow_concrete", (8, 0, 0), (10, 0, 0))
    layout.fill("air", (7, 1, 0), (11, 3, 0))
    layout.door("wooden_door", 3, 0, "north")
    layout.fill("glass", (1, 2, 0), (2, 2, 0))
    layout.fill("iron_bars", (1, 1, 5), (5, 3, 5))
    layout.fill("iron_bars", (1, 1, 10), (5, 3, 10))
    layout.fill("iron_bars", (5, 1, 6), (5, 3, 9))
    layout.door("iron_door", 5, 7, "east")
    layout.put((6, 1, 7), "stone_pressure_plate", redstone_signal=0)
    layout.fill("blue_concrete", (1, 5, 0), (3, 5, 0))
    layout.fill("white_concrete", (4, 5, 0), (5, 5, 0))
    layout.fill("red_concrete", (6, 5, 0), (8, 5, 0))
    return layout, {
        "crew": [["cop", 3, 2]],
        "jail": [3, 8],
        "garage": [9, 4],
    }


def bank():
    layout = Layout("oak_planks", "white_wool", "dark_oak_planks")
    layout.door("wooden_door", 6, 0, "north")
    for x in (2, 3, 9, 10):
        layout.put((x, 2, 0), "glass")
        layout.put((x, 1, 4), "oak_planks")
    layout.fill("oak_planks", (4, 1, 4), (8, 1, 4))
    layout.fill("stone_bricks", (7, 1, 7), (11, 3, 7))
    layout.fill("stone_bricks", (7, 1, 8), (7, 3, 11))
    layout.fill("stone_bricks", (11, 1, 8), (11, 3, 11))
    layout.fill("stone_bricks", (7, 1, 11), (11, 3, 11))
    layout.door("iron_door", 9, 7, "north")
    for z in (6, 8):
        layout.put((9, 1, z), "stone_pressure_plate", redstone_signal=0)
    layout.put((9, 1, 10), "gold_block")
    layout.put((9, 2, 10), "chest")
    layout.fill("yellow_concrete", (3, 5, 0), (9, 5, 0))
    return layout, {
        "crew": [["teller", x, 5] for x in (3, 6, 9)],
        "vault": [9, 2, 10],
    }


def fire_station():
    layout = Layout("smooth_stone", "brick_block", "stone_bricks")
    layout.fill("light_gray_concrete", (3, 0, 0), (9, 0, 11))
    layout.fill("yellow_concrete", (4, 0, 0), (8, 0, 0))
    layout.fill("air", (3, 1, 0), (9, 3, 0))
    layout.door("wooden_door", 10, 0, "north")
    layout.put((11, 2, 0), "glass")
    layout.fill("red_concrete", (3, 5, 0), (5, 5, 0))
    layout.put((6, 5, 0), "white_concrete")
    layout.fill("red_concrete", (7, 5, 0), (9, 5, 0))
    return layout, {
        "crew": [["fireman", x, 9] for x in (2, 6, 10)],
        "garage": [6, 4],
    }


def integer(value):
    return pack("<i", value)


def string(value):
    encoded = value.encode("utf-8")
    return pack("<H", len(encoded)) + encoded


def tag(kind, name, value):
    return bytes([kind]) + string(name) + value


def compound(*children):
    return b"".join(children) + b"\0"


def sequence(kind, values):
    return bytes([kind]) + integer(len(values)) + b"".join(values)


def palette_entry(block, states):
    return compound(
        tag(8, "name", string("minecraft:" + block)),
        tag(10, "states", compound(*(
            tag(1, key, bytes([value])) if isinstance(value, bool)
            else tag(3, key, integer(value)) if isinstance(value, int)
            else tag(8, key, string(value))
            for key, value in states
        ))),
        tag(3, "version", integer(BLOCK_VERSION)),
    )


def structure(layout):
    palette = {}
    layers = []
    for x in range(WIDTH):
        for y in range(HEIGHT):
            for z in range(WIDTH):
                block = layout.blocks.get((x, y, z))
                layer = -1 if block is None else palette.setdefault(block, len(palette))
                layers.append(integer(layer))
    contents = compound(
        tag(9, "block_indices", sequence(9, [
            sequence(3, layers), sequence(3, [integer(-1)] * len(layers)),
        ])),
        tag(9, "entities", sequence(10, [])),
        tag(10, "palette", compound(tag(10, "default", compound(
            tag(9, "block_palette", sequence(10, [palette_entry(*entry) for entry in palette])),
            tag(10, "block_position_data", compound()),
        )))),
    )
    return tag(10, "", compound(
        tag(3, "format_version", integer(1)),
        tag(9, "size", sequence(3, [integer(WIDTH), integer(HEIGHT), integer(WIDTH)])),
        tag(10, "structure", contents),
        tag(9, "structure_world_origin", sequence(3, [integer(0)] * 3)),
    ))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    check = parser.parse_args().check
    metadata = {}
    payloads = {}
    for builder in (police_station, bank, fire_station):
        layout, anchors = builder()
        name = builder.__name__
        metadata[f"cops_robbers:{name}_kit"] = {
            "structure": f"cops_robbers:{name}",
            **anchors,
            "crew": [{"type": entity, "x": x, "z": z} for entity, x, z in anchors["crew"]],
        }
        payloads[PACK / "structures" / "cops_robbers" / f"{name}.mcstructure"] = structure(layout)
    generated = "// Generated by tools/build-structures.py.\n"
    generated += f"export const FOOTPRINT = {WIDTH};\nexport const HEIGHT = {HEIGHT};\n"
    generated += "export const SITES = " + json.dumps(metadata, indent=2) + ";\n"
    payloads[PACK / "scripts" / "sites.js"] = generated.encode("utf-8")
    for path, data in payloads.items():
        if check:
            if not path.is_file() or path.read_bytes() != data:
                parser.error(f"{path.name} is stale. Rerun build-structures.py.")
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)


if __name__ == "__main__":
    main()
