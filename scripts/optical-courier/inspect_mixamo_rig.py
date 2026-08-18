"""Inspect an untouched Mixamo skin download and emit a truthful rig report."""

import argparse
import hashlib
import json
from pathlib import Path
import sys

import bpy


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    return parser.parse_args(sys.argv[sys.argv.index("--") + 1 :])


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


args = parse_args()
source = Path(args.input).resolve()
destination = Path(args.output).resolve()

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=str(source), automatic_bone_orientation=False)

armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
actions = list(bpy.data.actions)
if len(armatures) != 1:
    raise RuntimeError(f"Expected exactly one Mixamo armature, found {len(armatures)}")
if not meshes:
    raise RuntimeError("The authoritative skin download contains no mesh")

armature = armatures[0]
bones = [bone.name for bone in armature.data.bones]
required_bone_tokens = {
    "hips": "Hips",
    "spine": "Spine",
    "head": "Head",
    "left_arm": "LeftArm",
    "right_arm": "RightArm",
    "left_leg": "LeftLeg",
    "right_leg": "RightLeg",
}
lower_bones = [name.lower() for name in bones]
required_bones = {
    key: next((name for name in bones if token.lower() in name.lower()), None)
    for key, token in required_bone_tokens.items()
}
if any(value is None for value in required_bones.values()):
    missing = [key for key, value in required_bones.items() if value is None]
    raise RuntimeError(f"Mixamo armature is missing required bone families: {', '.join(missing)}")

weighted_meshes = []
for mesh in meshes:
    modifiers = [modifier.object.name for modifier in mesh.modifiers if modifier.type == "ARMATURE" and modifier.object]
    weighted_vertices = sum(1 for vertex in mesh.data.vertices if vertex.groups)
    weighted_meshes.append(
        {
            "name": mesh.name,
            "vertices": len(mesh.data.vertices),
            "triangles": sum(len(poly.vertices) - 2 for poly in mesh.data.polygons),
            "weightedVertices": weighted_vertices,
            "armatureModifiers": modifiers,
            "materials": [slot.material.name for slot in mesh.material_slots if slot.material],
        }
    )

if not any(mesh["weightedVertices"] > 0 for mesh in weighted_meshes):
    raise RuntimeError("No skinned vertices were found in the authoritative download")

report = {
    "schemaVersion": 1,
    "status": "rigged-skin-source",
    "source": source.name,
    "bytes": source.stat().st_size,
    "sha256": sha256(source),
    "armature": {
        "name": armature.name,
        "count": len(armatures),
        "boneCount": len(bones),
        "requiredBones": required_bones,
        "rootBones": [bone.name for bone in armature.data.bones if bone.parent is None],
    },
    "meshes": weighted_meshes,
    "actions": [
        {"name": action.name, "frameRange": list(action.frame_range), "frameRate": bpy.context.scene.render.fps}
        for action in actions
    ],
    "productionApproved": False,
    "notes": "Authoritative Mixamo T-pose skin source. Production approval requires reviewed clip inventory, deformation checks, normalized package, optimized GLB, and browser load verification.",
}

destination.parent.mkdir(parents=True, exist_ok=True)
destination.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print(json.dumps(report, indent=2))
