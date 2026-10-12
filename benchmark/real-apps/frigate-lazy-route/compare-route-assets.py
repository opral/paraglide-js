#!/usr/bin/env python3
"""Compare requested route assets by logical output basename, ignoring JS hashes."""
from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from pathlib import Path


def load(path: str) -> dict[str, dict[str, int]]:
    manifest = json.loads(Path(path).read_text())
    groups: dict[str, dict[str, int]] = defaultdict(lambda: {"raw": 0, "brotli": 0})
    for asset in manifest["assets"]:
        name = Path(asset["path"]).name
        if name.endswith(".js"):
            name = re.sub(r"-[A-Za-z0-9_-]{8}(?=\.js$)", "", name)
        group = groups[name]
        group["raw"] += asset.get("rawBytes", 0)
        group["brotli"] += asset.get("brotliQ4Bytes", 0)
    return groups


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: compare-route-assets.py NATIVE.json CANDIDATE.json")
    native = load(sys.argv[1])
    candidate = load(sys.argv[2])
    names = sorted(native.keys() | candidate.keys())
    native_q4 = sum(group["brotli"] for group in native.values())
    candidate_q4 = sum(group["brotli"] for group in candidate.values())
    added = [(candidate[name]["brotli"], name) for name in names if name not in native]
    removed = [(native[name]["brotli"], name) for name in names if name not in candidate]
    shared_delta = sum(
        candidate[name]["brotli"] - native[name]["brotli"]
        for name in names
        if name in native and name in candidate
    )
    print(f"native_q4={native_q4} candidate_q4={candidate_q4} delta={candidate_q4 - native_q4}")
    print(f"candidate_only_groups={len(added)} q4={sum(value for value, _ in added)}")
    print(f"native_only_groups={len(removed)} q4={sum(value for value, _ in removed)}")
    print(f"shared_group_delta_q4={shared_delta}")
    print("largest_candidate_only:")
    for value, name in sorted(added, reverse=True)[:20]:
        print(f"  {value:>8}  {name}")
    print("native_only:")
    for value, name in sorted(removed, reverse=True):
        print(f"  {value:>8}  {name}")
    print("largest_shared_deltas:")
    shared = [
        (candidate[name]["brotli"] - native[name]["brotli"], name)
        for name in names
        if name in native and name in candidate
    ]
    for value, name in sorted(shared, reverse=True)[:10]:
        print(f"  {value:+8}  {name}")
    for value, name in sorted(shared)[:10]:
        print(f"  {value:+8}  {name}")


if __name__ == "__main__":
    main()
