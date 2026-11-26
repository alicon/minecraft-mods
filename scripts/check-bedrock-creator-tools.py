"""Run Mojang's validation suites on each built archive and retain reviewable reports."""

import argparse
import json
import subprocess
import tempfile
from pathlib import Path

TOOLS = Path(__file__).resolve().parents[1] / "tools/bedrock/node_modules/@minecraft/creator-tools"


def validate(archive, suite, output):
    # A fresh directory prevents an older, successful report satisfying a failed invocation.
    directory = Path(tempfile.mkdtemp(prefix=f"{archive.stem}-{suite}-", dir=output))
    result = subprocess.run([
        "node", str(TOOLS / "cli/index.mjs"), "validate", suite,
        "--if", str(archive.resolve()), "-o", str(directory.resolve()), "--ot", "json",
    ], check=False)
    report = directory / f"{archive.stem}.mcr.json"
    if not report.is_file():
        raise RuntimeError(f"Creator Tools did not produce {report} (exit {result.returncode})")
    data = json.loads(report.read_text(encoding="utf-8"))
    info = data["info"]
    if suite == "main" and (info.get("behaviorPackManifestCount"), info.get("resourcePackManifestCount")) != (1, 1):
        raise RuntimeError(f"Creator Tools did not inspect both manifests in {archive}: {report}")
    if suite == "addon":
        executed = {item.get("gId") for item in data["items"] if item.get("iTp") in (0, 1)}
        if not {"CADDONREQ", "CADDONIREQ"} <= executed or info["overallSize"] <= 0:
            raise RuntimeError(f"Cooperative Add-On validation did not examine {archive}: {report}")
    print(f"{archive.name} {suite}: {info['errorCount']} errors, {info['warningCount']} warnings. {report}", flush=True)
    return result.returncode == 0 and info["errorCount"] == 0 and info["internalProcessingErrorCount"] == 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archives", nargs="+", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    outcomes = [validate(archive, suite, args.output) for archive in args.archives for suite in ("main", "addon")]
    return 0 if all(outcomes) else 1


if __name__ == "__main__":
    raise SystemExit(main())
