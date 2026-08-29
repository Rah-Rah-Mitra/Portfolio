"""Round-trip inspect the compressed Optical Courier GLB."""

import argparse
import hashlib
import json
from pathlib import Path
import sys

import bpy


FAMILIES = ["idle", "walk", "run", "jump", "land", "vault", "climb", "hang", "roll", "inspect", "point", "success", "puzzled"]


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
bpy.ops.import_scene.gltf(filepath=str(source))

armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
actions = sorted(bpy.data.actions, key=lambda action: FAMILIES.index(action.name) if action.name in FAMILIES else 999)
if len(armatures) != 1:
    raise RuntimeError(f"Expected one production armature, found {len(armatures)}")
if [action.name for action in actions] != FAMILIES:
    raise RuntimeError(f"Production motion inventory mismatch: {[action.name for action in actions]}")

armature = armatures[0]
report = {
    "schemaVersion": 1,
    "status": "roundtrip-valid",
    "path": "public/models/optical-courier-production.glb",
    "bytes": source.stat().st_size,
    "sha256": sha256(source),
    "armature": {
        "count": 1,
        "boneCount": len(armature.data.bones),
        "rootBones": [bone.name for bone in armature.data.bones if bone.parent is None],
    },
    "meshes": [
        {
            "name": mesh.name,
            "vertices": len(mesh.data.vertices),
            "triangles": sum(len(polygon.vertices) - 2 for polygon in mesh.data.polygons),
            "materials": [slot.material.name for slot in mesh.material_slots if slot.material],
        }
        for mesh in meshes
    ],
    "clips": [
        {"family": action.name, "frameRange": [round(value, 4) for value in action.frame_range]}
        for action in actions
    ],
}
destination.parent.mkdir(parents=True, exist_ok=True)
destination.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print(json.dumps(report, indent=2))
