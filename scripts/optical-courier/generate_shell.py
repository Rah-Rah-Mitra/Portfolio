"""Build the deterministic, connected pre-Mixamo Optical Courier shell in Blender 5.2."""

import argparse
import math
from pathlib import Path

import bpy
from mathutils import Vector


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def apply_transform(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.select_set(False)


def ellipsoid(name, location, scale, segments=24, rings=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    apply_transform(obj)
    return obj


def capsule_segment(name, start, end, radius, vertices=20):
    start_v, end_v = Vector(start), Vector(end)
    delta = end_v - start_v
    midpoint = (start_v + end_v) * 0.5
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=delta.length, location=midpoint)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(delta.normalized())
    apply_transform(obj)
    ellipsoid(f"{name}_start", start, (radius * 1.02,) * 3, segments=vertices, rings=12)
    ellipsoid(f"{name}_end", end, (radius * 1.02,) * 3, segments=vertices, rings=12)
    return obj


def material(name, color, metallic=0.0, roughness=0.65, emission=None):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
        bsdf.inputs["Emission Strength"].default_value = 1.2
    return mat


def assign_materials(obj):
    mats = [
        material("Shell_OffWhite", (0.82, 0.86, 0.84), roughness=0.82),
        material("Graphite_VisorPanels", (0.035, 0.055, 0.052), metallic=0.12, roughness=0.5),
        material("Charcoal_Trousers", (0.08, 0.105, 0.10), roughness=0.76),
        material("Black_GlovesBoots", (0.012, 0.018, 0.017), roughness=0.68),
        material("Signal_Teal", (0.02, 0.45, 0.40), metallic=0.18, roughness=0.34, emission=(0.01, 0.18, 0.16)),
        material("Sole_Amber", (0.58, 0.29, 0.035), roughness=0.58),
    ]
    for mat in mats:
        obj.data.materials.append(mat)
    for polygon in obj.data.polygons:
        center = polygon.center
        x, y, z = center.x, center.y, center.z
        index = 1
        if z < 0.075:
            index = 5
        elif z < 0.30:
            index = 3
        elif z < 1.10:
            index = 2
        elif 1.40 <= z <= 1.58:
            # The connected shell keeps its sleeve surface, while the material
            # split carries the approved off-white jacket into the T-pose arms.
            index = 3 if abs(x) > 0.84 else (1 if abs(x) < 0.31 else 0)
        elif 1.10 <= z <= 1.61 and abs(x) < 0.36:
            index = 0 if abs(x) < 0.245 else 1
        if abs(x) < 0.038 and y < -0.145 and 1.70 < z < 1.93:
            index = 4
        polygon.material_index = index


def build_character():
    parts = []
    parts += [
        ellipsoid("pelvis", (0, 0, 1.00), (0.24, 0.15, 0.18)),
        ellipsoid("torso", (0, 0, 1.34), (0.29, 0.17, 0.35)),
        ellipsoid("neck", (0, 0, 1.61), (0.09, 0.09, 0.12), segments=20, rings=12),
        ellipsoid("visor_head", (0, -0.006, 1.79), (0.165, 0.155, 0.205), segments=28, rings=18),
    ]
    for side in (-1, 1):
        hip_x = 0.145 * side
        shoulder_x = 0.25 * side
        parts.append(capsule_segment(f"thigh_{side}", (hip_x, 0, 0.98), (0.145 * side, 0, 0.57), 0.098))
        parts.append(capsule_segment(f"shin_{side}", (0.145 * side, 0, 0.57), (0.145 * side, -0.005, 0.18), 0.078))
        parts.append(ellipsoid(f"boot_{side}", (0.145 * side, -0.05, 0.105), (0.105, 0.185, 0.105), segments=22, rings=14))
        parts.append(capsule_segment(f"upper_arm_{side}", (shoulder_x, 0, 1.49), (0.61 * side, 0, 1.49), 0.083))
        parts.append(capsule_segment(f"forearm_{side}", (0.61 * side, 0, 1.49), (0.89 * side, 0, 1.49), 0.066))
        parts.append(ellipsoid(f"glove_{side}", (0.955 * side, 0, 1.49), (0.088, 0.072, 0.068), segments=20, rings=12))

    bpy.ops.object.select_all(action="DESELECT")
    for obj in [item for item in bpy.context.scene.objects if item.type == "MESH"]:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    body = bpy.context.object
    body.name = "OpticalCourier_Body"

    remesh = body.modifiers.new("ConnectedVoxelShell", "REMESH")
    remesh.mode = "VOXEL"
    remesh.voxel_size = 0.018
    remesh.use_smooth_shade = True
    bpy.ops.object.modifier_apply(modifier=remesh.name)
    decimate = body.modifiers.new("ProductionDecimate", "DECIMATE")
    decimate.ratio = 0.42
    bpy.ops.object.modifier_apply(modifier=decimate.name)
    bpy.ops.object.shade_smooth_by_angle()

    # Joining retains the active pelvis object's transform. Bake it before
    # measuring the sole plane so local and world bounds share one origin.
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    min_z = min(vertex.co.z for vertex in body.data.vertices)
    min_x = min(vertex.co.x for vertex in body.data.vertices)
    max_x = max(vertex.co.x for vertex in body.data.vertices)
    min_y = min(vertex.co.y for vertex in body.data.vertices)
    max_y = max(vertex.co.y for vertex in body.data.vertices)
    body.data.transform(__import__('mathutils').Matrix.Translation((-(min_x + max_x) * 0.5, -(min_y + max_y) * 0.5, -min_z)))
    body["asset_id"] = "optical-courier"
    body["design_seed"] = "optical-courier-v1-fixed"
    body["head_height_m"] = 0.276
    body["neutral_pose"] = "T"
    assign_materials(body)
    signal = ellipsoid("OpticalCourier_Signal", (0, -0.159, 1.80), (0.026, 0.012, 0.11), segments=20, rings=12)
    signal.data.materials.append(material("Signal_Teal_Lens", (0.02, 0.45, 0.40), metallic=0.18, roughness=0.3, emission=(0.01, 0.18, 0.16)))
    signal.parent = body
    bpy.context.view_layer.objects.active = body
    body.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return body


def save_scene(body, output_dir):
    output_dir.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene["coordinate_contract"] = "+Z up, +Y back, metres"
    scene["production_status"] = "pre-rig-ready"
    bpy.context.view_layer.objects.active = body
    bpy.ops.wm.save_as_mainfile(filepath=str(output_dir / "optical-courier-source.blend"))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args(__import__('sys').argv[__import__('sys').argv.index("--") + 1:])
    clear_scene()
    body = build_character()
    save_scene(body, Path(args.output_dir).resolve())


if __name__ == "__main__":
    main()
