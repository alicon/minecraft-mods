"""Check player-visible Mushroom contracts in a built Bedrock add-on."""

import argparse
import io
import json
from pathlib import Path
from zipfile import ZipFile


STEM = "mushroom_yorkie"
HOME_GOAL = f"{STEM}:home_goal"
LOOK_GOALS = {"minecraft:behavior.look_at_player", "minecraft:behavior.random_look_around"}
# Geometry is in model pixels (16 per block). These bounds preserve the face
# detail and strap contact of the corrected model at an oblique camera angle.
FACE_CLEARANCE = {"left_eye": 0.30, "right_eye": 0.30, "nose": 0.50}
LEAD_CONTACT_TOLERANCE = 0.15


def local_bounds(cube, axis):
    origin = cube["origin"][axis]
    inflate = cube.get("inflate", 0)
    return origin - inflate, origin + cube["size"][axis] + inflate


def covers(cube, axis, value):
    minimum, maximum = local_bounds(cube, axis)
    return minimum <= value <= maximum


def face_clearance(bones, name, required):
    detail = bones.get(name, {})
    if detail.get("parent") != "head" or not detail.get("cubes"):
        return f"{name} needs geometry attached to the head"
    for cube in detail["cubes"]:
        x = sum(local_bounds(cube, 0)) / 2
        y = sum(local_bounds(cube, 1)) / 2
        face = [local_bounds(shell, 2)[0] for shell in bones["head"]["cubes"]
                if covers(shell, 0, x) and covers(shell, 1, y)]
        if not face:
            return f"{name} has no head surface behind it"
        clearance = min(face) - local_bounds(cube, 2)[0]
        if clearance < required:
            return f"{name} extends {clearance:.2f} model pixels (need {required:.2f})"
    return None


def nose_uv(bones):
    for cube in bones.get("nose", {}).get("cubes", ()):
        uv = cube.get("uv")
        if not isinstance(uv, dict) or any(
            face not in uv or len(uv[face].get("uv_size", ())) != 2
            or any(size < 1 for size in uv[face]["uv_size"])
            for face in ("north", "east", "west", "up", "down")
        ):
            return "the fractional nose cube needs at least one texel on each exposed face"
    return None


def lead_contact(bones):
    locators = [(bone, bone["locators"]["lead"]) for bone in bones.values()
                if "lead" in bone.get("locators", {})]
    if len(locators) != 1:
        return f"expected one lead locator, found {len(locators)}"
    bone, offset = locators[0]
    harness = bones.get("harness", {})
    if bone["name"] not in {harness.get("name"), harness.get("parent")}:
        return "lead locator does not move with the harness"
    x, y, z = offset["offset"] if isinstance(offset, dict) else offset
    if not any(covers(cube, 0, x) and covers(cube, 2, z)
               and abs(y - local_bounds(cube, 1)[1]) <= LEAD_CONTACT_TOLERANCE
               for cube in harness.get("cubes", ())):
        return "lead locator does not make contact with the top of the harness"
    return None


def sleep_pose(entity, animations):
    sleep = entity["events"][f"{STEM}:home_sleep"]
    active = set(entity["components"]) & LOOK_GOALS
    removed = set(sleep.get("remove", {}).get("component_groups", ()))
    looking_groups = {name for name, components in entity["component_groups"].items()
                      if set(components) & LOOK_GOALS}
    if active or not looking_groups or looking_groups - removed:
        return "sleep must remove the awake look goals without disabling awake facing"
    if (not entity["description"]["properties"][HOME_GOAL].get("client_sync")
            or sleep.get("set_property", {}).get(HOME_GOAL) != "sleep"):
        return "sleep state must reach the client"
    pose = animations[f"animation.{STEM}.sleep"]
    rotation = pose.get("bones", {}).get("head", {}).get("rotation", ())
    if not pose.get("override_previous_animation") or len(rotation) != 3:
        return "sleep must override the earlier head pose"
    if any("query.target_" in str(angle) for angle in rotation):
        return "sleep head rotation reads the look target"
    return None


def check_assets(path):
    with ZipFile(path) as addon:
        [data] = [name for name in addon.namelist() if name.endswith("-data.mcpack")]
        [resources] = [name for name in addon.namelist() if name.endswith("-resources.mcpack")]
        with ZipFile(io.BytesIO(addon.read(data))) as behavior:
            entity = json.loads(behavior.read(f"entities/{STEM}.json"))["minecraft:entity"]
        with ZipFile(io.BytesIO(addon.read(resources))) as resource:
            [geometry] = json.loads(resource.read(f"models/entity/{STEM}.geo.json"))["minecraft:geometry"]
            bones = {bone["name"]: bone for bone in geometry["bones"]}
            animations = json.loads(resource.read(f"animations/{STEM}.animation.json"))["animations"]
    return {
        **{name: face_clearance(bones, name, minimum) for name, minimum in FACE_CLEARANCE.items()},
        "nose_uv": nose_uv(bones),
        "lead": lead_contact(bones),
        "sleep_look": sleep_pose(entity, animations),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("addon", type=Path)
    checks = check_assets(parser.parse_args().addon)
    for name, problem in checks.items():
        print(f"FAIL {name}: {problem}" if problem else f"PASS {name}")
    raise SystemExit(any(checks.values()))


if __name__ == "__main__":
    main()
