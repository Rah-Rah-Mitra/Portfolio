"""Name and package reviewed actions; refuses incomplete motion-family sets."""

import argparse
from pathlib import Path
import bpy

REQUIRED = {"idle", "walk", "run", "jump", "land", "vault", "climb", "hang", "roll", "inspect", "point", "success", "puzzled"}
parser = argparse.ArgumentParser(); parser.add_argument("--blend", required=True); parser.add_argument("--output", required=True)
args = parser.parse_args(__import__('sys').argv[__import__('sys').argv.index("--") + 1:])
bpy.ops.wm.open_mainfile(filepath=str(Path(args.blend).resolve()))
available = {action.name.lower().split('_')[0] for action in bpy.data.actions}
missing = sorted(REQUIRED - available)
if missing:
    raise RuntimeError(f"Motion families not ready: {', '.join(missing)}")
bpy.ops.wm.save_as_mainfile(filepath=str(Path(args.output).resolve()))
