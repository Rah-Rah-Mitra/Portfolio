"""Build the reviewed Optical Courier animation package from untouched Mixamo FBX files."""

import argparse
import hashlib
import json
from pathlib import Path
import sys

import bpy


FAMILY_ORDER = [
    "idle", "walk", "run", "jump", "land", "vault", "climb",
    "hang", "roll", "inspect", "point", "success", "puzzled",
]
TRIM_END = {"idle": 121, "vault": 76, "inspect": 150, "success": 112}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--rig", required=True)
    parser.add_argument("--clips", required=True)
    parser.add_argument("--blend", required=True)
    parser.add_argument("--glb", required=True)
    parser.add_argument("--report", required=True)
    parser.add_argument("--meshopt", action="store_true")
    return parser.parse_args(sys.argv[sys.argv.index("--") + 1 :])


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def action_fcurves(action):
    for layer in action.layers:
        for strip in layer.strips:
            for channelbag in strip.channelbags:
                yield from channelbag.fcurves


def trim_action(action, start: int, end: int) -> None:
    offset = start - 1
    for fcurve in action_fcurves(action):
        for index in range(len(fcurve.keyframe_points) - 1, -1, -1):
            point = fcurve.keyframe_points[index]
            frame = point.co[0]
            if frame < start or frame > end:
                fcurve.keyframe_points.remove(point, fast=True)
        for point in fcurve.keyframe_points:
            point.co[0] -= offset
            point.handle_left[0] -= offset
            point.handle_right[0] -= offset
        fcurve.update()
    action.frame_start = 1
    action.frame_end = end - start + 1


def reduce_curve(fcurve, tolerance: float) -> int:
    points = list(fcurve.keyframe_points)
    if len(points) <= 2:
        return 0
    xy = [(float(point.co[0]), float(point.co[1])) for point in points]
    keep = {0, len(points) - 1}
    pending = [(0, len(points) - 1)]
    while pending:
        left, right = pending.pop()
        if right - left <= 1:
            continue
        x0, y0 = xy[left]
        x1, y1 = xy[right]
        span = x1 - x0
        maximum = -1.0
        maximum_index = -1
        for index in range(left + 1, right):
            x, y = xy[index]
            expected = y0 if abs(span) < 1e-9 else y0 + (y1 - y0) * ((x - x0) / span)
            error = abs(y - expected)
            if error > maximum:
                maximum = error
                maximum_index = index
        if maximum > tolerance:
            keep.add(maximum_index)
            pending.append((left, maximum_index))
            pending.append((maximum_index, right))
    removed = 0
    for index in range(len(points) - 2, 0, -1):
        if index not in keep:
            fcurve.keyframe_points.remove(fcurve.keyframe_points[index], fast=True)
            removed += 1
    fcurve.update()
    return removed


def simplify_action(action) -> tuple[int, int]:
    before = sum(len(fcurve.keyframe_points) for fcurve in action_fcurves(action))
    for fcurve in action_fcurves(action):
        path = fcurve.data_path.lower()
        if "rotation_quaternion" in path or "rotation_euler" in path:
            tolerance = 0.00065
        elif "location" in path:
            tolerance = 0.012
        else:
            tolerance = 0.0005
        reduce_curve(fcurve, tolerance)
    after = sum(len(fcurve.keyframe_points) for fcurve in action_fcurves(action))
    return before, after


def strip_mixamo_prefix(action) -> None:
    for fcurve in action_fcurves(action):
        fcurve.data_path = fcurve.data_path.replace('pose.bones["mixamorig:', 'pose.bones["')


args = parse_args()
rig_path = Path(args.rig).resolve()
clips_path = Path(args.clips).resolve()
blend_path = Path(args.blend).resolve()
glb_path = Path(args.glb).resolve()
report_path = Path(args.report).resolve()

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=str(rig_path), automatic_bone_orientation=False)
base_armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
if len(base_armatures) != 1:
    raise RuntimeError(f"Expected one skinned source armature, found {len(base_armatures)}")
armature = base_armatures[0]
armature.name = "OpticalCourier_Rig"
armature.data.name = "OpticalCourier_Skeleton"
armature.animation_data_create()
armature.animation_data.action = None
for action in list(bpy.data.actions):
    bpy.data.actions.remove(action)

meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
if len(meshes) != 2:
    raise RuntimeError(f"Expected body and signal meshes, found {len(meshes)}")
for mesh in meshes:
    mesh.name = "OpticalCourier_Signal" if "Signal" in mesh.name else "OpticalCourier_Body"
for pose_bone in armature.pose.bones:
    pose_bone.rotation_mode = "QUATERNION"

clip_files = {}
for source in clips_path.glob("*.fbx"):
    family = source.name.split("--", 1)[0]
    clip_files[family] = source
missing = [family for family in FAMILY_ORDER if family not in clip_files]
if missing:
    raise RuntimeError(f"Missing Mixamo motion families: {', '.join(missing)}")

records = []
actions = []
for family in FAMILY_ORDER:
    source = clip_files[family]
    objects_before = set(bpy.data.objects)
    actions_before = set(bpy.data.actions)
    bpy.ops.import_scene.fbx(filepath=str(source), automatic_bone_orientation=False)
    imported_armatures = [obj for obj in set(bpy.data.objects) - objects_before if obj.type == "ARMATURE"]
    imported_actions = list(set(bpy.data.actions) - actions_before)
    if len(imported_armatures) != 1 or len(imported_actions) != 1:
        raise RuntimeError(f"{source.name}: expected one armature/action, found {len(imported_armatures)}/{len(imported_actions)}")
    imported_armature = imported_armatures[0]
    source_action = imported_armature.animation_data.action if imported_armature.animation_data else None
    if source_action is None:
        raise RuntimeError(f"{source.name}: imported armature has no active action")
    if len(imported_armature.data.bones) != len(armature.data.bones):
        raise RuntimeError(f"{source.name}: skeleton bone count differs from the skin source")

    source_start, source_end = (int(round(value)) for value in source_action.frame_range)
    trim_end = min(TRIM_END.get(family, source_end), source_end)
    action = bpy.data.actions.new(family)
    action.use_fake_user = True
    armature.animation_data.action = action
    source_bones = {pose_bone.name: pose_bone for pose_bone in imported_armature.pose.bones}
    target_bones = list(armature.pose.bones)
    missing_bones = [pose_bone.name for pose_bone in target_bones if pose_bone.name not in source_bones]
    if missing_bones:
        raise RuntimeError(f"{source.name}: missing retarget bones: {', '.join(missing_bones)}")
    target_inverse = armature.matrix_world.inverted()
    for source_frame in range(source_start, trim_end + 1):
        output_frame = source_frame - source_start + 1
        bpy.context.scene.frame_set(source_frame)
        bpy.context.view_layer.update()
        source_world = {
            name: imported_armature.matrix_world @ pose_bone.matrix.copy()
            for name, pose_bone in source_bones.items()
        }
        for pose_bone in target_bones:
            pose_bone.matrix = target_inverse @ source_world[pose_bone.name]
        for pose_bone in target_bones:
            pose_bone.keyframe_insert(data_path="location", frame=output_frame, group=pose_bone.name)
            pose_bone.keyframe_insert(data_path="rotation_quaternion", frame=output_frame, group=pose_bone.name)
            pose_bone.keyframe_insert(data_path="scale", frame=output_frame, group=pose_bone.name)
    action.frame_start = 1
    action.frame_end = trim_end - source_start + 1
    before_keys, after_keys = simplify_action(action)
    strip_mixamo_prefix(action)
    actions.append(action)
    records.append(
        {
            "family": family,
            "source": str(source.relative_to(rig_path.parents[3])).replace("\\", "/"),
            "sourceSha256": sha256(source),
            "sourceFrames": [source_start, source_end],
            "productionFrames": [1, trim_end - source_start + 1],
            "trimmed": trim_end != source_end,
            "keyframesBefore": before_keys,
            "keyframesAfter": after_keys,
        }
    )
    bpy.data.objects.remove(imported_armature, do_unlink=True)
    bpy.data.actions.remove(source_action)

# Normalize skeleton and vertex-group names after every action is imported.
for bone in armature.data.bones:
    bone.name = bone.name.removeprefix("mixamorig:")
for mesh in meshes:
    for group in mesh.vertex_groups:
        group.name = group.name.removeprefix("mixamorig:")

armature["assetRole"] = "Optical Courier production rig"
armature["motionFamilies"] = json.dumps(FAMILY_ORDER)
for mesh in meshes:
    mesh["assetRole"] = "courier-signal" if "Signal" in mesh.name else "courier-body"

# Bind and evaluate every action on the production armature before export.
for action in actions:
    armature.animation_data.action = action
    if action.slots:
        armature.animation_data.action_slot = action.slots[0]
    bpy.context.scene.frame_set(int(action.frame_start))
    bpy.context.view_layer.update()
armature.animation_data.action = actions[0]
armature.animation_data.action_slot = actions[0].slots[0]

bpy.context.scene.render.fps = 30
bpy.context.scene.frame_start = 1
bpy.context.scene.frame_end = max(int(action.frame_end) for action in actions)
blend_path.parent.mkdir(parents=True, exist_ok=True)
glb_path.parent.mkdir(parents=True, exist_ok=True)
report_path.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))

export_kwargs = {
    "filepath": str(glb_path),
    "export_format": "GLB",
    "export_animations": True,
    "export_animation_mode": "ACTIONS",
    "export_anim_single_armature": True,
    "export_force_sampling": False,
    "export_frame_range": False,
    "export_optimize_animation_size": True,
    "export_optimize_animation_keep_anim_armature": True,
    "export_yup": True,
    "export_materials": "EXPORT",
    "export_image_format": "NONE",
    "export_cameras": False,
    "export_lights": False,
    "export_extras": True,
}
if args.meshopt:
    export_kwargs.update(
        {
            "export_meshopt_compression_enable": True,
            "export_meshopt_extension": "EXT_meshopt_compression",
        }
    )
bpy.ops.export_scene.gltf(**export_kwargs)

report = {
    "schemaVersion": 1,
    "status": "normalized-review-required",
    "rig": {
        "source": str(rig_path.relative_to(rig_path.parents[3])).replace("\\", "/"),
        "sourceSha256": sha256(rig_path),
        "armatureCount": 1,
        "boneCount": len(armature.data.bones),
        "rootBones": [bone.name for bone in armature.data.bones if bone.parent is None],
        "meshCount": len(meshes),
    },
    "clips": records,
    "blend": {"path": str(blend_path), "bytes": blend_path.stat().st_size, "sha256": sha256(blend_path)},
    "glb": {"path": str(glb_path), "bytes": glb_path.stat().st_size, "sha256": sha256(glb_path), "meshopt": bool(args.meshopt)},
    "productionApproved": False,
}
report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print(json.dumps(report, indent=2))
