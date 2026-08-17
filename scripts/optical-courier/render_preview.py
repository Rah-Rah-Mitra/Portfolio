"""Render four deterministic inspection frames of the pre-Mixamo shell."""

import argparse
import math
from pathlib import Path
import bpy
from mathutils import Vector

parser = argparse.ArgumentParser()
parser.add_argument("--blend", required=True)
parser.add_argument("--output-dir", required=True)
args = parser.parse_args(__import__('sys').argv[__import__('sys').argv.index("--") + 1:])
bpy.ops.wm.open_mainfile(filepath=str(Path(args.blend).resolve()))
output = Path(args.output_dir).resolve(); output.mkdir(parents=True, exist_ok=True)
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 640; scene.render.resolution_y = 640; scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
if scene.world is None:
    scene.world = bpy.data.worlds.new("OpticalCourier_PreviewWorld")
scene.world.use_nodes = True
background = scene.world.node_tree.nodes.get("Background")
background.inputs["Color"].default_value = (0.88, 0.90, 0.89, 1.0)
background.inputs["Strength"].default_value = 0.9
bpy.ops.object.light_add(type="AREA", location=(3, -4, 5)); bpy.context.object.data.energy = 900; bpy.context.object.data.shape = "DISK"; bpy.context.object.data.size = 5
bpy.ops.object.light_add(type="AREA", location=(-3, -1, 3)); bpy.context.object.data.energy = 450; bpy.context.object.data.size = 4
bpy.ops.object.camera_add(); camera = bpy.context.object; scene.camera = camera; camera.data.lens = 58

def point_camera(location, target=(0, 0, 1.0)):
    camera.location = location
    camera.rotation_euler = (Vector(target) - camera.location).to_track_quat('-Z', 'Y').to_euler()

for name, location in (("front", (0, -4.2, 1.15)), ("left", (-4.2, 0, 1.15)), ("back", (0, 4.2, 1.15)), ("three-quarter", (3.2, -3.2, 1.35))):
    point_camera(location)
    scene.render.filepath = str(output / f"optical-courier-{name}.png")
    bpy.ops.render.render(write_still=True)
