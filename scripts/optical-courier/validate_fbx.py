"""Round-trip the Mixamo upload FBX and report its imported geometry contract."""

import argparse
import hashlib
import json
from pathlib import Path

import bmesh
import bpy


def mesh_facts(obj):
    bm = bmesh.new(); bm.from_mesh(obj.data)
    remaining = set(bm.verts); components = 0
    while remaining:
        components += 1; stack = [remaining.pop()]
        while stack:
            vertex = stack.pop()
            for edge in vertex.link_edges:
                other = edge.other_vert(vertex)
                if other in remaining:
                    remaining.remove(other); stack.append(other)
    non_manifold = sum(1 for edge in bm.edges if not edge.is_manifold)
    bm.free()
    return {"vertices": len(obj.data.vertices), "triangles": sum(len(poly.vertices) - 2 for poly in obj.data.polygons), "components": components, "nonManifoldEdges": non_manifold}


parser = argparse.ArgumentParser()
parser.add_argument("--input", required=True)
parser.add_argument("--output", required=True)
parser.add_argument("--status", default="pre-rig-ready")
parser.add_argument("--source-label", default="assets/optical-courier/pre-mixamo/optical-courier-upload.fbx")
args = parser.parse_args(__import__('sys').argv[__import__('sys').argv.index("--") + 1:])
source = Path(args.input).resolve()
bpy.ops.object.select_all(action="SELECT"); bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.fbx(filepath=str(source), automatic_bone_orientation=False)
meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
primary = max(meshes, key=lambda obj: len(obj.data.vertices))
facts = mesh_facts(primary)
report = {
    "schemaVersion": 1,
    "status": args.status,
    "source": args.source_label,
    "sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
    "bytes": source.stat().st_size,
    "meshObjectCount": len(meshes),
    "primaryObject": primary.name,
    "geometry": facts,
    "armatureCount": sum(1 for obj in bpy.context.scene.objects if obj.type == "ARMATURE"),
    "animationCount": len(bpy.data.actions),
    "materials": sorted({slot.material.name for mesh in meshes for slot in mesh.material_slots if slot.material}),
    "coordinateContract": {"forward": "-Y", "up": "+Z", "units": "metres"},
}
Path(args.output).resolve().write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
if facts["components"] != 1 or facts["nonManifoldEdges"] != 0:
    raise RuntimeError(f"FBX round-trip validation failed: {report}")
