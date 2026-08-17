"""Measure a Hunyuan3D GLB proof and make a conservative deformation decision."""

import argparse
import hashlib
import json
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector


def facts(obj):
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
    return components, non_manifold


parser = argparse.ArgumentParser(); parser.add_argument("--input", required=True); parser.add_argument("--output", required=True)
args = parser.parse_args(__import__('sys').argv[__import__('sys').argv.index("--") + 1:])
source = Path(args.input).resolve()
bpy.ops.object.select_all(action="SELECT"); bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(source))
meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
if not meshes:
    raise RuntimeError("Hunyuan proof did not contain a mesh")
components = 0; non_manifold = 0; vertices = 0; triangles = 0; corners = []
for obj in meshes:
    object_components, object_non_manifold = facts(obj)
    components += object_components; non_manifold += object_non_manifold
    vertices += len(obj.data.vertices); triangles += sum(len(poly.vertices) - 2 for poly in obj.data.polygons)
    corners.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
minimum = [min(corner[i] for corner in corners) for i in range(3)]
maximum = [max(corner[i] for corner in corners) for i in range(3)]
width = max(maximum[0] - minimum[0], 1e-6)
reasons = []
if len(meshes) != 1: reasons.append(f"proof contains {len(meshes)} mesh objects")
if components != 1: reasons.append(f"proof contains {components} connected components")
if non_manifold: reasons.append(f"proof contains {non_manifold} non-manifold edges")
reasons.append("voxel extraction has no authored shoulder, hip, knee, elbow, or wrist deformation loops; manual retopology would be required before Mixamo")
report = {
    "schemaVersion": 1,
    "source": "artifacts/optical-courier/proofs/hunyuan-selected.glb",
    "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
    "sourceBytes": source.stat().st_size,
    "inspection": {
        "meshObjects": len(meshes), "vertices": vertices, "triangles": triangles,
        "connectedComponents": components, "nonManifoldEdges": non_manifold,
        "bounds": {"min": [round(v, 6) for v in minimum], "max": [round(v, 6) for v in maximum]},
        "xSymmetryErrorRatio": round(abs(minimum[0] + maximum[0]) / width, 6),
        "armatures": sum(1 for obj in bpy.context.scene.objects if obj.type == "ARMATURE"),
    },
    "decision": "rejected-for-deformation",
    "reasons": reasons,
    "fallback": "assets/optical-courier/pre-mixamo/optical-courier-upload.fbx",
}
destination = Path(args.output).resolve(); destination.parent.mkdir(parents=True, exist_ok=True)
destination.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
