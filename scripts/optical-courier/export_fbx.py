"""Export the reviewed pre-Mixamo shell using a stable axis and scale contract."""

import argparse
from pathlib import Path
import bpy

parser = argparse.ArgumentParser()
parser.add_argument("--blend", required=True)
parser.add_argument("--output", required=True)
args = parser.parse_args(__import__('sys').argv[__import__('sys').argv.index("--") + 1:])
bpy.ops.wm.open_mainfile(filepath=str(Path(args.blend).resolve()))
bpy.ops.object.select_all(action="DESELECT")
for obj in bpy.context.scene.objects:
    if obj.type == "MESH":
        obj.select_set(True)
bpy.ops.export_scene.fbx(
    filepath=str(Path(args.output).resolve()),
    use_selection=True,
    global_scale=1.0,
    apply_unit_scale=True,
    axis_forward="-Y",
    axis_up="Z",
    add_leaf_bones=False,
    bake_anim=False,
)
