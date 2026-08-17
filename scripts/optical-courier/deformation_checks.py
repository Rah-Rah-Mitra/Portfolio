"""Emit clip review samples at required playback scales after Mixamo normalization."""

import argparse
import json
from pathlib import Path
import bpy

parser = argparse.ArgumentParser()
parser.add_argument("--blend", required=True)
parser.add_argument("--output", required=True)
args = parser.parse_args(__import__('sys').argv[__import__('sys').argv.index("--") + 1:])
bpy.ops.wm.open_mainfile(filepath=str(Path(args.blend).resolve()))
report = {"schemaVersion": 1, "reviewed": False, "playbackScales": [0.65, 1.0, 1.25], "clips": []}
for action in bpy.data.actions:
    report["clips"].append({"name": action.name, "frameRange": list(action.frame_range), "checks": {"footSliding": None, "jointInversion": None, "clothingPenetration": None, "loopBoundary": None}})
Path(args.output).resolve().write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
