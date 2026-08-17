"""Measure review-only Courier geometry and deterministic joint-section density."""

import argparse
import hashlib
import json
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector


def topology(mesh):
    bm = bmesh.new()
    bm.from_mesh(mesh)
    remaining = set(bm.verts)
    components = 0
    while remaining:
        components += 1
        stack = [remaining.pop()]
        while stack:
            vertex = stack.pop()
            for edge in vertex.link_edges:
                other = edge.other_vert(vertex)
                if other in remaining:
                    remaining.remove(other)
                    stack.append(other)
    non_manifold = sum(1 for edge in bm.edges if not edge.is_manifold)
    bm.free()
    return components, non_manifold


def joint_section(body, name, axis, center, radius, section_axis):
    vertices = [body.matrix_world @ vertex.co for vertex in body.data.vertices]
    selected = []
    for vertex in vertices:
        if all(abs(vertex[index] - center[index]) <= radius[index] for index in range(3)):
            selected.append(vertex)
    low = center[section_axis] - radius[section_axis]
    width = (radius[section_axis] * 2) / 5
    occupied = set()
    for vertex in selected:
        occupied.add(min(4, max(0, int((vertex[section_axis] - low) / width))))
    return {"joint": name, "axis": axis, "vertices": len(selected), "crossSections": len(occupied)}


parser = argparse.ArgumentParser()
parser.add_argument("--blend", required=True)
parser.add_argument("--output", required=True)
args = parser.parse_args(__import__("sys").argv[__import__("sys").argv.index("--") + 1:])
source = Path(args.blend).resolve()
bpy.ops.wm.open_mainfile(filepath=str(source))
meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
body = max(meshes, key=lambda obj: len(obj.data.vertices))
signal = next((obj for obj in meshes if obj != body and "Signal" in obj.name), None)
corners = [body.matrix_world @ Vector(corner) for corner in body.bound_box]
minimum = [min(corner[index] for corner in corners) for index in range(3)]
maximum = [max(corner[index] for corner in corners) for index in range(3)]
components, non_manifold = topology(body.data)
triangles = sum(max(1, len(polygon.vertices) - 2) for polygon in body.data.polygons)
head_front_y = min((body.matrix_world @ vertex.co).y for vertex in body.data.vertices if (body.matrix_world @ vertex.co).z > 1.64)
signal_gap = None
if signal is not None:
    signal_max_y = max((signal.matrix_world @ Vector(corner)).y for corner in signal.bound_box)
    signal_gap = max(0.0, head_front_y - signal_max_y)
head_faces = []
graphite_visor_faces = []
for polygon in body.data.polygons:
    center = body.matrix_world @ polygon.center
    if center.z <= 1.64:
        continue
    normal = body.matrix_world.to_3x3() @ polygon.normal
    head_faces.append((center, normal))
    if 1.69 < center.z < 1.91 and center.y < -0.08 and normal.y < -0.15:
        graphite_visor_faces.append((center, normal))
skin_faces = len(head_faces) - len(graphite_visor_faces)
visor_back_faces = sum(1 for center, normal in graphite_visor_faces if center.y >= 0 or normal.y >= 0)
joint_sections = [
    joint_section(body, "left-shoulder", "X", (-0.31, 0, 1.50), (0.15, 0.24, 0.18), 0),
    joint_section(body, "right-shoulder", "X", (0.31, 0, 1.50), (0.15, 0.24, 0.18), 0),
    joint_section(body, "left-elbow", "X", (-0.63, 0, 1.50), (0.14, 0.20, 0.15), 0),
    joint_section(body, "right-elbow", "X", (0.63, 0, 1.50), (0.14, 0.20, 0.15), 0),
    joint_section(body, "left-knee", "Z", (-0.14, 0, 0.55), (0.14, 0.20, 0.17), 2),
    joint_section(body, "right-knee", "Z", (0.14, 0, 0.55), (0.14, 0.20, 0.17), 2),
]
report = {
    "schemaVersion": 1,
    "status": "upload-review-ready",
    "source": "assets/optical-courier/review-v2/optical-courier-review-v2.blend",
    "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
    "geometry": {
        "meshObjectCount": len(meshes),
        "primaryObject": body.name,
        "vertices": len(body.data.vertices),
        "triangles": triangles,
        "primaryConnectedComponents": components,
        "nonManifoldEdges": non_manifold,
        "dimensionsMeters": [round(maximum[index] - minimum[index], 6) for index in range(3)],
        "headRatio": round((maximum[2] - minimum[2]) / float(body.get("head_height_m", 0.279)), 4),
    },
    "bounds": {"min": [round(value, 6) for value in minimum], "max": [round(value, 6) for value in maximum]},
    "jointSections": joint_sections,
    "materials": sorted({slot.material.name for mesh in meshes for slot in mesh.material_slots if slot.material}),
    "retopology": json.loads(body.get("retopology_attempt", "{}")),
    "materialBoundaryMode": body.get("material_boundary_mode"),
    "signalSurfaceGapMeters": round(signal_gap, 6) if signal_gap is not None else None,
    "jacketDetailMode": body.get("jacket_detail_mode"),
    "jacketDetailRoles": json.loads(body.get("jacket_detail_roles", "[]")),
    "materialRegions": {
        "head": {
            "rule": body.get("head_material_rule"),
            "totalFaces": len(head_faces),
            "skinFaces": skin_faces,
            "graphiteVisorFaces": len(graphite_visor_faces),
            "visorBackFaceCount": visor_back_faces,
            "skinCoverage": round(skin_faces / len(head_faces), 6) if head_faces else 0,
            "graphiteCoverage": round(len(graphite_visor_faces) / len(head_faces), 6) if head_faces else 0,
        }
    },
    "rig": {"armatures": sum(1 for obj in bpy.context.scene.objects if obj.type == "ARMATURE"), "actions": len(bpy.data.actions)},
}
output = Path(args.output).resolve()
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
if components != 1 or non_manifold != 0 or triangles < 10000 or triangles > 30000:
    raise RuntimeError(f"review candidate geometry gate failed: {report['geometry']}")
if any(section["vertices"] < 24 or section["crossSections"] < 3 for section in joint_sections):
    raise RuntimeError(f"review candidate joint-section gate failed: {joint_sections}")
if not head_faces or skin_faces <= 0 or len(graphite_visor_faces) <= 0 or visor_back_faces != 0:
    raise RuntimeError(f"review candidate head material-region gate failed: {report['materialRegions']['head']}")
skin_coverage = skin_faces / len(head_faces)
graphite_coverage = len(graphite_visor_faces) / len(head_faces)
if skin_coverage <= 0.45 or not 0.05 < graphite_coverage < 0.45:
    raise RuntimeError(f"review candidate head coverage gate failed: {report['materialRegions']['head']}")
