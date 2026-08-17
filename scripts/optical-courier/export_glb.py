"""Export the reviewed animation package; external Meshopt/KTX2 optimization follows."""

import argparse
from pathlib import Path
import bpy

parser = argparse.ArgumentParser(); parser.add_argument("--blend", required=True); parser.add_argument("--output", required=True)
args = parser.parse_args(__import__('sys').argv[__import__('sys').argv.index("--") + 1:])
bpy.ops.wm.open_mainfile(filepath=str(Path(args.blend).resolve()))
bpy.ops.export_scene.gltf(filepath=str(Path(args.output).resolve()), export_format="GLB", export_animations=True, export_apply=True, export_yup=True)
size = Path(args.output).resolve().stat().st_size
if size > 1_500_000:
    raise RuntimeError(f"GLB exceeds 1.5 MB production budget: {size} bytes")
