"""Validate the current Blender scene and write a deterministic JSON report."""

import argparse
import json
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector


def connected_components(mesh):
    bm = bmesh.new()
    bm.from_mesh(mesh)
    remaining = set(bm.verts)
    count = 0
    while remaining:
        count += 1
        stack = [remaining.pop()]
        while stack:
            current = stack.pop()
            for edge in current.link_edges:
                other = edge.other_vert(current)
                if other in remaining:
                    remaining.remove(other)
                    stack.append(other)
    non_manifold = sum(1 for edge in bm.edges if not edge.is_manifold)
    bm.free()
    return count, non_manifold


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--blend", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args(__import__('sys').argv[__import__('sys').argv.index("--") + 1:])
    bpy.ops.wm.open_mainfile(filepath=str(Path(args.blend).resolve()))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not meshes:
        raise RuntimeError("No mesh object found")
    body = max(meshes, key=lambda obj: len(obj.data.vertices))
    components, non_manifold = connected_components(body.data)
    corners = [body.matrix_world @ Vector(corner) for corner in body.bound_box]
    minimum = [min(corner[index] for corner in corners) for index in range(3)]
    maximum = [max(corner[index] for corner in corners) for index in range(3)]
    height = maximum[2] - minimum[2]
    head_height = float(body.get("head_height_m", 0.276))
    triangles = sum(len(polygon.vertices) - 2 for polygon in body.data.polygons)
    report = {
        "schemaVersion": 1,
        "status": "pre-rig-ready",
        "sourceBlend": "assets/optical-courier/pre-mixamo/optical-courier-source.blend",
        "geometry": {
            "meshObjectCount": len(meshes),
            "primaryObject": body.name,
            "vertices": len(body.data.vertices),
            "triangles": triangles,
            "primaryConnectedComponents": components,
            "nonManifoldEdges": non_manifold,
            "dimensionsMeters": [round(maximum[i] - minimum[i], 6) for i in range(3)],
            "headHeightMeters": head_height,
            "headRatio": round(height / head_height, 4),
        },
        "materials": [slot.material.name for slot in body.material_slots if slot.material],
        "transforms": {
            "applied": tuple(body.location) == (0.0, 0.0, 0.0) and tuple(body.scale) == (1.0, 1.0, 1.0),
            "location": [round(value, 6) for value in body.location],
            "rotationEuler": [round(value, 6) for value in body.rotation_euler],
            "scale": [round(value, 6) for value in body.scale],
            "upAxis": "+Z",
            "originCentered": abs((minimum[0] + maximum[0]) * 0.5) < 0.01 and abs((minimum[1] + maximum[1]) * 0.5) < 0.03 and abs(minimum[2]) < 0.01,
        },
        "bounds": {"min": [round(value, 6) for value in minimum], "max": [round(value, 6) for value in maximum]},
        "rig": {"armatures": sum(1 for obj in bpy.context.scene.objects if obj.type == "ARMATURE"), "actions": len(bpy.data.actions), "status": "not-rigged"},
    }
    output = Path(args.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    if components != 1 or non_manifold != 0 or not report["transforms"]["originCentered"]:
        raise RuntimeError(f"Asset validation failed: {report}")


if __name__ == "__main__":
    main()
