"""Build a deterministic visual-review candidate from the local Hunyuan proof."""

import argparse
import json
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector


MATERIALS = {
    "Shell_OffWhite": ((0.80, 0.83, 0.81, 1.0), 0.82, 0.0),
    "Graphite_Visor": ((0.025, 0.038, 0.037, 1.0), 0.42, 0.18),
    "Warm_Skin": ((0.62, 0.28, 0.16, 1.0), 0.58, 0.0),
    "Charcoal_Trousers": ((0.075, 0.088, 0.086, 1.0), 0.76, 0.0),
    "Black_GlovesBoots": ((0.009, 0.014, 0.014, 1.0), 0.66, 0.0),
    "Sole_Amber": ((0.55, 0.25, 0.025, 1.0), 0.55, 0.0),
    "Signal_Teal": ((0.01, 0.42, 0.37, 1.0), 0.28, 0.2),
}


def make_material(name):
    color, roughness, metallic = MATERIALS[name]
    material = bpy.data.materials.new(name)
    material.diffuse_color = color
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = color
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    if name == "Signal_Teal":
        shader.inputs["Emission Color"].default_value = color
        shader.inputs["Emission Strength"].default_value = 1.5
    return material


def bounds(obj):
    corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    minimum = Vector(tuple(min(corner[index] for corner in corners) for index in range(3)))
    maximum = Vector(tuple(max(corner[index] for corner in corners) for index in range(3)))
    return minimum, maximum


def components_and_non_manifold(mesh):
    bm = bmesh.new()
    bm.from_mesh(mesh)
    remaining = set(bm.verts)
    components = 0
    while remaining:
        components += 1
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
    return components, non_manifold


def assign_clean_material_regions(body):
    for name in MATERIALS:
        body.data.materials.append(make_material(name))

    region = bpy.data.materials.new("Courier_ContinuousRegionShader")
    region.use_nodes = True
    nodes = region.node_tree.nodes
    links = region.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    geometry = nodes.new("ShaderNodeNewGeometry")
    separate = nodes.new("ShaderNodeSeparateXYZ")
    links.new(geometry.outputs["Position"], separate.inputs["Vector"])
    separate_normal = nodes.new("ShaderNodeSeparateXYZ")
    links.new(geometry.outputs["Normal"], separate_normal.inputs["Vector"])

    def compare(operation, socket, threshold):
        node = nodes.new("ShaderNodeMath")
        node.operation = operation
        links.new(socket, node.inputs[0])
        node.inputs[1].default_value = threshold
        return node.outputs[0]

    def logical_and(first, second):
        node = nodes.new("ShaderNodeMath")
        node.operation = "MULTIPLY"
        links.new(first, node.inputs[0])
        links.new(second, node.inputs[1])
        return node.outputs[0]

    def mix(base, mask, role):
        node = nodes.new("ShaderNodeMixRGB")
        node.blend_type = "MIX"
        links.new(mask, node.inputs[0])
        links.new(base, node.inputs[1])
        node.inputs[2].default_value = MATERIALS[role][0]
        return node.outputs[0]

    base = nodes.new("ShaderNodeRGB")
    base.outputs[0].default_value = MATERIALS["Graphite_Visor"][0]
    color = base.outputs[0]
    trousers = compare("LESS_THAN", separate.outputs["Z"], 1.07)
    color = mix(color, trousers, "Charcoal_Trousers")
    boots = compare("LESS_THAN", separate.outputs["Z"], 0.31)
    color = mix(color, boots, "Black_GlovesBoots")
    soles = compare("LESS_THAN", separate.outputs["Z"], 0.065)
    color = mix(color, soles, "Sole_Amber")
    jacket_low = compare("GREATER_THAN", separate.outputs["Z"], 1.07)
    jacket_high = compare("LESS_THAN", separate.outputs["Z"], 1.64)
    jacket = logical_and(jacket_low, jacket_high)
    color = mix(color, jacket, "Shell_OffWhite")
    absolute_x = nodes.new("ShaderNodeMath")
    absolute_x.operation = "ABSOLUTE"
    links.new(separate.outputs["X"], absolute_x.inputs[0])
    outer_hand = compare("GREATER_THAN", absolute_x.outputs[0], 0.86)
    hand_height = compare("GREATER_THAN", separate.outputs["Z"], 1.34)
    gloves = logical_and(outer_hand, hand_height)
    color = mix(color, gloves, "Black_GlovesBoots")
    head = compare("GREATER_THAN", separate.outputs["Z"], 1.64)
    color = mix(color, head, "Warm_Skin")
    visor_low = compare("GREATER_THAN", separate.outputs["Z"], 1.69)
    visor_high = compare("LESS_THAN", separate.outputs["Z"], 1.91)
    visor_depth = compare("LESS_THAN", separate.outputs["Y"], -0.08)
    visor_facing = compare("LESS_THAN", separate_normal.outputs["Y"], -0.15)
    visor_band = logical_and(logical_and(visor_low, visor_high), logical_and(visor_depth, visor_facing))
    color = mix(color, visor_band, "Graphite_Visor")
    front_surface = compare("LESS_THAN", separate.outputs["Y"], 0.0)
    detail_low = compare("GREATER_THAN", separate.outputs["Z"], 1.16)
    detail_high = compare("LESS_THAN", separate.outputs["Z"], 1.56)
    detail_height = logical_and(detail_low, detail_high)
    zipper_width = compare("LESS_THAN", absolute_x.outputs[0], 0.006)
    zipper = logical_and(front_surface, logical_and(detail_height, zipper_width))
    color = mix(color, zipper, "Graphite_Visor")
    diagonal_scale = nodes.new("ShaderNodeMath")
    diagonal_scale.operation = "MULTIPLY"
    links.new(separate.outputs["Z"], diagonal_scale.inputs[0])
    diagonal_scale.inputs[1].default_value = 0.20
    diagonal = nodes.new("ShaderNodeMath")
    diagonal.operation = "ADD"
    links.new(absolute_x.outputs[0], diagonal.inputs[0])
    links.new(diagonal_scale.outputs[0], diagonal.inputs[1])
    pocket_inner = compare("GREATER_THAN", diagonal.outputs[0], 0.425)
    pocket_outer = compare("LESS_THAN", diagonal.outputs[0], 0.448)
    pocket_low = compare("GREATER_THAN", separate.outputs["Z"], 1.23)
    pocket_high = compare("LESS_THAN", separate.outputs["Z"], 1.39)
    pockets = logical_and(front_surface, logical_and(logical_and(pocket_inner, pocket_outer), logical_and(pocket_low, pocket_high)))
    color = mix(color, pockets, "Graphite_Visor")
    links.new(color, shader.inputs["Base Color"])
    shader.inputs["Roughness"].default_value = 0.68
    shader.inputs["Metallic"].default_value = 0.04
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    body.data.materials.append(region)
    region_index = len(body.data.materials) - 1
    for polygon in body.data.polygons:
        polygon.material_index = region_index
    body["material_boundary_mode"] = "continuous-position-masks"
    body["jacket_detail_mode"] = "bakeable-position-masks"
    body["jacket_detail_roles"] = json.dumps(["center-zipper", "paired-graphite-pocket-marks"])
    body["head_material_rule"] = "warm-skin; visor iff 1.69<z<1.91 and y<-0.08 and normalY<-0.15"


def create_signal(body):
    minimum, maximum = bounds(body)
    head_vertices = [body.matrix_world @ vertex.co for vertex in body.data.vertices if (body.matrix_world @ vertex.co).z > 1.64]
    front_y = min(vertex.y for vertex in head_vertices)
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=24,
        ring_count=12,
        location=(0, front_y - 0.008, minimum.z + (maximum.z - minimum.z) * 0.887),
    )
    signal = bpy.context.object
    signal.name = "OpticalCourier_Signal"
    signal.scale = (0.026, 0.012, 0.105)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    signal.data.materials.append(make_material("Signal_Teal"))
    signal.parent = body
    return signal


def normalize(body):
    bpy.context.view_layer.objects.active = body
    body.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    minimum, maximum = bounds(body)
    scale = 2.02 / (maximum.z - minimum.z)
    body.scale = (scale, scale, scale)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    minimum, maximum = bounds(body)
    translation = Vector((-(minimum.x + maximum.x) * 0.5, -(minimum.y + maximum.y) * 0.5, -minimum.z))
    body.data.transform(Matrix.Translation(translation))
    body.location = (0, 0, 0)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--target-faces", type=int, default=12000)
    args = parser.parse_args(__import__("sys").argv[__import__("sys").argv.index("--") + 1:])

    source = Path(args.input).resolve()
    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    body = max(meshes, key=lambda obj: len(obj.data.vertices))
    for obj in list(bpy.context.scene.objects):
        if obj != body:
            bpy.data.objects.remove(obj, do_unlink=True)
    body.name = "OpticalCourier_ReviewBody"
    normalize(body)

    bpy.context.view_layer.objects.active = body
    body.select_set(True)
    voxel = body.modifiers.new("DeterministicManifoldUnion", "REMESH")
    voxel.mode = "VOXEL"
    voxel.voxel_size = 0.0075
    voxel.use_smooth_shade = True
    bpy.ops.object.modifier_apply(modifier=voxel.name)

    attempt = {
        "method": "QuadriFlow",
        "targetFaces": args.target_faces,
        "seed": 231119,
        "succeeded": False,
        "inputFaces": len(body.data.polygons),
    }
    try:
        result = bpy.ops.object.quadriflow_remesh(
            mode="FACES",
            target_faces=args.target_faces,
            use_mesh_symmetry=True,
            use_preserve_sharp=True,
            use_preserve_boundary=True,
            preserve_attributes=False,
            smooth_normals=True,
            seed=231119,
        )
        attempt["operatorResult"] = sorted(result)
        if "FINISHED" not in result:
            raise RuntimeError(f"QuadriFlow returned {sorted(result)}")
        attempt["succeeded"] = True
    except Exception as exception:
        attempt["error"] = f"{type(exception).__name__}: {exception}"

    if not attempt["succeeded"]:
        # QuadriFlow rejects this source despite the preceding voxel union
        # measuring as one closed manifold. Preserve that failure verbatim and
        # use a deterministic collapse retopology instead of claiming quads.
        target_triangles = args.target_faces * 2
        current_triangles = sum(max(1, len(polygon.vertices) - 2) for polygon in body.data.polygons)
        decimate = body.modifiers.new("ControlledCollapseRetopology", "DECIMATE")
        decimate.decimate_type = "COLLAPSE"
        decimate.ratio = min(1.0, target_triangles / current_triangles)
        decimate.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=decimate.name)
        attempt["fallback"] = {
            "method": "voxel-union-controlled-collapse",
            "targetTriangles": target_triangles,
            "outputTriangles": sum(max(1, len(polygon.vertices) - 2) for polygon in body.data.polygons),
        }

    normalize(body)
    body.data.update(calc_edges=True)
    components, non_manifold = components_and_non_manifold(body.data)
    if components != 1 or non_manifold != 0:
        raise RuntimeError(f"retopology is not a connected manifold: components={components}, nonManifold={non_manifold}")
    assign_clean_material_regions(body)
    create_signal(body)
    body["asset_id"] = "optical-courier-visual-review-v2"
    body["design_seed"] = 231119
    body["head_height_m"] = 0.279
    body["retopology_attempt"] = json.dumps(attempt, sort_keys=True)
    body["visual_status"] = "visual-review-required"
    bpy.context.scene["production_status"] = "visual-review-required"
    bpy.context.scene["coordinate_contract"] = "+Z up, +Y back, metres"
    bpy.ops.wm.save_as_mainfile(filepath=str(output_dir / "optical-courier-review-v2.blend"))
    (output_dir / "retopology-attempt.json").write_text(json.dumps(attempt, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
