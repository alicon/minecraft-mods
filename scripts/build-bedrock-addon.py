"""Validate and package a mod's Bedrock behavior and resource packs."""

import argparse
import io
import json
import sys
from pathlib import Path, PurePosixPath
from uuid import UUID
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parents[1]
PACK_TYPES = {"behavior_pack": "data", "resource_pack": "resources"}


def read_json(source):
    with source.open(encoding="utf-8") as stream:
        return json.load(stream)


def version(value):
    if not isinstance(value, list) or len(value) != 3:
        raise ValueError(f"Expected a three-part manifest version, got {value!r}")
    if any(type(part) is not int or part < 0 for part in value):
        raise ValueError(f"Invalid manifest version {value!r}")
    return tuple(value)


def pack_path(value):
    path = PurePosixPath(value)
    if path.is_absolute() or not path.parts or ".." in path.parts or "\\" in value:
        raise ValueError(f"Unsafe pack path {value!r}")
    return path


def pack_files(mod, kind, asset_paths):
    folder = mod / "bedrock" / kind
    files = {}
    for source in sorted(folder.rglob("*")):
        if not source.is_file() or any(part.startswith(".") for part in source.relative_to(folder).parts):
            continue
        if source.suffix == ".json":
            read_json(source)
        files[source.relative_to(folder).as_posix()] = source.read_bytes()
    for destination, relative in asset_paths.items():
        destination = pack_path(destination).as_posix()
        if destination in files:
            raise ValueError(f"{kind} already provides {destination}")
        source = mod / pack_path(relative)
        files[destination] = source.read_bytes()
    return files


def validate_manifests(manifests):
    headers = {}
    all_uuids = set()
    for kind, manifest in manifests.items():
        if manifest["format_version"] != 2:
            raise ValueError(f"{kind} requires stable manifest format 2")
        header = manifest["header"]
        headers[kind] = header
        pack_version = version(header["version"])
        version(header["min_engine_version"])
        modules = manifest["modules"]
        if sum(module["type"] == PACK_TYPES[kind] for module in modules) != 1:
            raise ValueError(f"{kind} must contain one {PACK_TYPES[kind]} module")
        for entry in [header, *modules]:
            identifier = UUID(entry["uuid"])
            if identifier in all_uuids:
                raise ValueError(f"Duplicate manifest UUID {identifier}")
            all_uuids.add(identifier)
            if version(entry["version"]) != pack_version:
                raise ValueError(f"{kind} module and header versions must match")
        for dependency in manifest.get("dependencies", []):
            dependency_version = dependency["version"]
            if isinstance(dependency_version, str) and dependency_version.endswith("-beta"):
                raise ValueError(f"{kind} uses a beta dependency")

    behavior = headers["behavior_pack"]
    resource = headers["resource_pack"]
    if behavior["version"] != resource["version"]:
        raise ValueError("Behavior and resource pack versions must match")
    if behavior["min_engine_version"] != resource["min_engine_version"]:
        raise ValueError("Behavior and resource packs must target the same Bedrock version")
    resource_link = {"uuid": resource["uuid"], "version": resource["version"]}
    if resource_link not in manifests["behavior_pack"].get("dependencies", []):
        raise ValueError("The behavior pack must depend on the matching resource pack UUID and version")
    return version(behavior["version"])


def archive(files):
    output = io.BytesIO()
    with ZipFile(output, mode="w", compression=ZIP_DEFLATED) as bundle:
        for name, content in sorted(files.items()):
            entry = ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            entry.create_system = 3
            entry.external_attr = 0o100644 << 16
            bundle.writestr(entry, content, compress_type=ZIP_DEFLATED, compresslevel=9)
    return output.getvalue()


def build(mod, output_dir):
    bedrock = mod / "bedrock"
    manifests = {kind: read_json(bedrock / kind / "manifest.json") for kind in PACK_TYPES}
    addon_version = ".".join(map(str, validate_manifests(manifests)))

    asset_index = bedrock / "shared-assets.json"
    shared_assets = read_json(asset_index) if asset_index.is_file() else {}
    if shared_assets.keys() - PACK_TYPES.keys():
        raise ValueError("Shared assets must target a behavior or resource pack")
    packed = {}
    for kind, role in PACK_TYPES.items():
        files = pack_files(mod, kind, shared_assets.get(kind, {}))
        for module in manifests[kind]["modules"]:
            if module["type"] == "script" and pack_path(module["entry"]).as_posix() not in files:
                raise ValueError(f"{kind} script entry {module['entry']} is missing")
        packed[f"{mod.name}-{role}.mcpack"] = archive(files)
    destination = output_dir / f"{mod.name}-bedrock-{addon_version}.mcaddon"
    output_dir.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(archive(packed))
    return destination


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mod", choices=sorted(path.parent.parent.name for path in (ROOT / "mods").glob("*/bedrock/behavior_pack")))
    parser.add_argument("--output", type=Path, default=ROOT / "build" / "bedrock")
    arguments = parser.parse_args()
    try:
        print(build(ROOT / "mods" / arguments.mod, arguments.output))
    except (KeyError, OSError, TypeError, ValueError) as error:
        print(f"Bedrock build failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
