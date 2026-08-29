"""Render deterministic contact frames for manual Optical Courier deformation review."""

import argparse
from mathutils import Vector
from pathlib import Path
import sys

import bpy


FAMILIES = ["idle", "walk", "run", "jump", "land", "vault", "climb", "hang", "roll", "inspect", "point", "success", "puzzled"]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--blend", required=True)
    parser.add_argument("--output", required=True)
    return parser.parse_args(sys.argv[sys.argv.index("--") + 1 :])


def look_at(camera, target: Vector) -> None:
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()


args = parse_args()
blend_path = Path(args.blend).resolve()
output_directory = Path(args.output).resolve()
output_directory.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(blend_path))

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 320
scene.render.resolution_y = 320
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.film_transparent = False
if scene.world is None:
    scene.world = bpy.data.worlds.new("ReviewWorld")
scene.world.color = (0.94, 0.96, 0.95)
scene.view_settings.look = "AgX - Medium High Contrast"

camera_data = bpy.data.cameras.new("ReviewCamera")
camera_data.type = "ORTHO"
camera = bpy.data.objects.new("ReviewCamera", camera_data)
scene.collection.objects.link(camera)
scene.camera = camera

key_data = bpy.data.lights.new("ReviewKey", "AREA")
key_data.energy = 950
key_data.shape = "DISK"
key_data.size = 4.0
key = bpy.data.objects.new("ReviewKey", key_data)
key.location = (4.0, -4.0, 6.0)
scene.collection.objects.link(key)
fill_data = bpy.data.lights.new("ReviewFill", "AREA")
fill_data.energy = 650
fill_data.size = 5.0
fill = bpy.data.objects.new("ReviewFill", fill_data)
fill.location = (-4.0, -1.5, 3.0)
scene.collection.objects.link(fill)

armature = next(obj for obj in scene.objects if obj.type == "ARMATURE")
meshes = [obj for obj in scene.objects if obj.type == "MESH"]
armature.animation_data_create()

for family_index, family in enumerate(FAMILIES):
    action = bpy.data.actions.get(family)
    if action is None:
        raise RuntimeError(f"Missing production action: {family}")
    armature.animation_data.action = action
    armature.animation_data.action_slot = action.slots[0]
    first = int(round(action.frame_start))
    last = int(round(action.frame_end))
    sample_frames = sorted({int(round(first + (last - first) * fraction)) for fraction in (0, 0.25, 0.5, 0.75, 1)})
    while len(sample_frames) < 5:
        sample_frames.append(last)

    for sample_index, frame in enumerate(sample_frames[:5]):
        scene.frame_set(frame)
        bpy.context.view_layer.update()
        corners = []
        for mesh in meshes:
            evaluated = mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
            corners.extend(evaluated.matrix_world @ Vector(corner) for corner in evaluated.bound_box)
        minimum = Vector((min(corner.x for corner in corners), min(corner.y for corner in corners), min(corner.z for corner in corners)))
        maximum = Vector((max(corner.x for corner in corners), max(corner.y for corner in corners), max(corner.z for corner in corners)))
        center = (minimum + maximum) * 0.5
        extent = maximum - minimum
        camera.location = center + Vector((3.2, -5.8, 2.5))
        look_at(camera, center + Vector((0, 0, extent.z * 0.04)))
        camera.data.ortho_scale = max(extent.x, extent.y, extent.z) * 1.28
        scene.render.filepath = str(output_directory / f"{family_index:02d}-{family}-{sample_index:02d}.png")
        bpy.ops.render.render(write_still=True)

print(f"Rendered {len(FAMILIES) * 5} deformation-review frames to {output_directory}")
