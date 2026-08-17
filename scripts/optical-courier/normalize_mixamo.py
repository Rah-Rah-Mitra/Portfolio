"""Normalize a future Mixamo FBX without touching untouched downloads."""

import argparse
from pathlib import Path
import bpy

parser = argparse.ArgumentParser()
parser.add_argument("--input", required=True)
parser.add_argument("--output", required=True)
args = parser.parse_args(__import__('sys').argv[__import__('sys').argv.index("--") + 1:])
bpy.ops.object.select_all(action="SELECT"); bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.fbx(filepath=str(Path(args.input).resolve()), automatic_bone_orientation=False)
armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
if len(armatures) != 1:
    raise RuntimeError(f"Expected one Mixamo armature, found {len(armatures)}")
armature = armatures[0]; armature.name = "OpticalCourier_Rig"
for obj in bpy.context.scene.objects:
    if obj.type in {"MESH", "ARMATURE"}:
        obj.select_set(True)
bpy.ops.export_scene.fbx(filepath=str(Path(args.output).resolve()), use_selection=True, axis_forward="-Y", axis_up="Z", add_leaf_bones=False, bake_anim=True, bake_anim_use_all_actions=True)
