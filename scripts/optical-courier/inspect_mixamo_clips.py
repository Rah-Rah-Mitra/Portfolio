"""Inspect untouched animation-only Mixamo FBX files before packaging."""

import argparse
import hashlib
import json
from pathlib import Path
import sys

import bpy


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--clips", required=True)
    parser.add_argument("--output", required=True)
    return parser.parse_args(sys.argv[sys.argv.index("--") + 1 :])


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


args = parse_args()
clips_directory = Path(args.clips).resolve()
destination = Path(args.output).resolve()
records = []

for source in sorted(clips_directory.glob("*.fbx")):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=str(source), automatic_bone_orientation=False)
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    actions = list(bpy.data.actions)
    if len(armatures) != 1:
        raise RuntimeError(f"{source.name}: expected one animation armature, found {len(armatures)}")
    armature = armatures[0]
    records.append(
        {
            "file": source.name,
            "bytes": source.stat().st_size,
            "sha256": sha256(source),
            "armature": armature.name,
            "boneCount": len(armature.data.bones),
            "rootBones": [bone.name for bone in armature.data.bones if bone.parent is None],
            "meshCount": len(meshes),
            "objectTransform": {
                "location": list(armature.location),
                "rotationEuler": list(armature.rotation_euler),
                "scale": list(armature.scale),
            },
            "actions": [
                {
                    "name": action.name,
                    "frameRange": list(action.frame_range),
                    "slotCount": len(action.slots) if hasattr(action, "slots") else None,
                }
                for action in actions
            ],
            "activeAction": armature.animation_data.action.name if armature.animation_data and armature.animation_data.action else None,
            "frameRate": bpy.context.scene.render.fps,
        }
    )

report = {"schemaVersion": 1, "clips": records}
destination.parent.mkdir(parents=True, exist_ok=True)
destination.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print(json.dumps(report, indent=2))
