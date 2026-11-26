"""Render textured Mushroom poses from packaged Bedrock resource files with Pillow."""

import argparse
import io
import json
import math
from pathlib import Path
from zipfile import ZipFile

from PIL import Image, ImageChops, ImageDraw, ImageFont


STEM = "mushroom_yorkie"
PANEL = (350, 220)
VIEWS = (
    ("Face", "idle", 0, 0, (0, 9.3, -8), 40),
    ("Face at an angle", "idle", 50, 4, (0, 9.3, -7), 36),
    ("Sitting", "sit", 82, 6, (0, 6.3, -2), 16),
    ("Sleeping", "sleep", 60, 20, (0, 4.7, -2), 16),
    ("Creative flight", "flight", 63, 7, (0, 6.3, -2), 16),
)
ZERO = (0, 0, 0)


def read_pack(path):
    with ZipFile(path) as addon:
        [resource] = [name for name in addon.namelist() if name.endswith("-resources.mcpack")]
        with ZipFile(io.BytesIO(addon.read(resource))) as pack:
            model = json.loads(pack.read(f"models/entity/{STEM}.geo.json"))["minecraft:geometry"][0]
            animations = json.loads(pack.read(f"animations/{STEM}.animation.json"))["animations"]
            texture = Image.open(io.BytesIO(pack.read(f"textures/entity/{STEM}.png"))).convert("RGBA")
            version = json.loads(pack.read("manifest.json"))["header"]["version"]
    return model["bones"], animations, texture, ".".join(map(str, version))


def rotate(point, angles):
    # Cube vertices here are Y-up. Bedrock applies pitch and roll in model space.
    x, y, z = point
    ax, ay, az = map(math.radians, angles)
    y, z = y * math.cos(ax) + z * math.sin(ax), z * math.cos(ax) - y * math.sin(ax)
    x, z = x * math.cos(ay) + z * math.sin(ay), z * math.cos(ay) - x * math.sin(ay)
    return x * math.cos(az) - y * math.sin(az), x * math.sin(az) + y * math.cos(az), z


def transform(point, bone, bones, pose):
    while bone:
        pivot = bone["pivot"]
        motion = pose.get(bone["name"], {})
        angles = tuple(a + (b if isinstance(b, (int, float)) else 0)
                       for a, b in zip(bone.get("rotation", ZERO), motion.get("rotation", ZERO)))
        point = rotate(tuple(value - axis for value, axis in zip(point, pivot)), angles)
        point = tuple(value + axis + shift
                      for value, axis, shift in zip(point, pivot, motion.get("position", ZERO)))
        bone = bones.get(bone.get("parent"))
    return point


def faces(cube):
    x, y, z = cube["origin"]
    w, h, d = cube["size"]
    far_x, top, far_z = x + w, y + h, z + d
    vertices = {
        "north": ((x, top, z), (far_x, top, z), (far_x, y, z), (x, y, z)),
        "south": ((far_x, top, far_z), (x, top, far_z), (x, y, far_z), (far_x, y, far_z)),
        "west": ((x, top, far_z), (x, top, z), (x, y, z), (x, y, far_z)),
        "east": ((far_x, top, z), (far_x, top, far_z), (far_x, y, far_z), (far_x, y, z)),
        "up": ((x, top, far_z), (far_x, top, far_z), (far_x, top, z), (x, top, z)),
        "down": ((x, y, z), (far_x, y, z), (far_x, y, far_z), (x, y, far_z)),
    }
    if isinstance(cube["uv"], dict):
        for face, uv in cube["uv"].items():
            yield vertices[face], (*uv["uv"], *uv["uv_size"])
        return
    u, v = cube["uv"]
    box_uv = {
        "north": (u + d, v + d, w, h), "south": (u + 2 * d + w, v + d, w, h),
        "west": (u, v + d, d, h), "east": (u + d + w, v + d, d, h),
        "up": (u + d, v, w, d), "down": (u + d + w, v, w, d),
    }
    for face, uv in box_uv.items():
        yield vertices[face], uv


def project(point, center, yaw, pitch, zoom):
    x, y, z = (value - axis for value, axis in zip(point, center))
    across = x * math.cos(yaw) + z * math.sin(yaw)
    near = x * math.sin(yaw) - z * math.cos(yaw)
    height = y * math.cos(pitch) - near * math.sin(pitch)
    return PANEL[0] / 2 + zoom * across, PANEL[1] / 2 - zoom * height, near * math.cos(pitch) + y * math.sin(pitch)


def paint_face(canvas, texture, points, uv):
    x, y = points[0]
    across_x, across_y = points[1][0] - x, points[1][1] - y
    down_x, down_y = points[3][0] - x, points[3][1] - y
    signed_area = across_x * down_y - across_y * down_x
    if signed_area <= 0.01:
        return

    left = max(0, math.floor(min(p[0] for p in points)))
    top = max(0, math.floor(min(p[1] for p in points)))
    right = min(PANEL[0], math.ceil(max(p[0] for p in points)))
    bottom = min(PANEL[1], math.ceil(max(p[1] for p in points)))
    if right <= left or bottom <= top:
        return

    u, v, width, height = uv
    a, b = width * down_y / signed_area, -width * down_x / signed_area
    d, e = -height * across_y / signed_area, height * across_x / signed_area
    sampling = (a, b, u + a * (left - x) + b * (top - y), d, e, v + d * (left - x) + e * (top - y))
    size = (right - left, bottom - top)
    patch = texture.transform(size, Image.Transform.AFFINE, sampling, Image.Resampling.NEAREST)
    mask = Image.new("L", size)
    ImageDraw.Draw(mask).polygon([(px - left, py - top) for px, py in points], fill=255)
    canvas.paste(patch, (left, top), ImageChops.multiply(mask, patch.getchannel("A")))


def render(bones, animations, texture, view):
    _, pose, yaw, pitch, center, zoom = view
    animation = animations.get(f"animation.{STEM}.{pose}", {})
    by_name = {bone["name"]: bone for bone in bones}
    panel = Image.new("RGB", PANEL, "#e2e5e7")
    if pose == "flight" and not animation:
        ImageDraw.Draw(panel).text((PANEL[0] / 2, PANEL[1] / 2), "No flight pose", fill="#343c3d", anchor="mm")
        return panel
    rendered = []
    for bone in bones:
        if bone["name"] == "harness" or (pose == "sleep" and bone["name"] in {"right_eye", "left_eye"}):
            continue
        for cube in bone.get("cubes", []):
            for vertices, uv in faces(cube):
                points = [project(transform(point, bone, by_name, animation.get("bones", {})),
                                  center, math.radians(yaw), math.radians(pitch), zoom) for point in vertices]
                depth = sum(point[2] for point in points) / 4
                rendered.append((depth, [point[:2] for point in points], uv))
    for _, points, uv in sorted(rendered, key=lambda face: face[0]):
        paint_face(panel, texture, points, uv)
    return panel


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("addon", type=Path)
    parser.add_argument("--reference", type=Path, help="older add-on to show above the current one")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    paths = [args.reference, args.addon] if args.reference else [args.addon]
    gap = 14
    row_height = PANEL[1] + 35
    sheet = Image.new("RGB", (len(VIEWS) * (PANEL[0] + gap) + gap, len(paths) * row_height + 55), "#f7f8f8")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default(size=17)
    draw.text((gap, 10), "Mushroom the Yorkie · Bedrock model preview", font=font, fill="#1a2829")
    for column, view in enumerate(VIEWS):
        draw.text((gap + column * (PANEL[0] + gap), 36), view[0], font=font, fill="#1a2829")
    for row, path in enumerate(paths):
        bones, animations, texture, version = read_pack(path)
        for column, view in enumerate(VIEWS):
            left, top = gap + column * (PANEL[0] + gap), 60 + row * row_height
            sheet.paste(render(bones, animations, texture, view), (left, top))
        draw.text((gap, top + PANEL[1] + 3), version, font=font, fill="#1a2829")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(args.output)


if __name__ == "__main__":
    main()
