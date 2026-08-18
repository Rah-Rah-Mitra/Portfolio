"""Generate the real rendered workstation icon, poster, and GLB package.

Run with Blender 5.x:
  blender --background --python scripts/workstation/generate_assets.py
"""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "public" / "workstation"
ICON_DIR = OUTPUT / "icons"
MODEL_DIR = OUTPUT / "models"
POSTER_DIR = OUTPUT / "posters"

INK = (0.035, 0.055, 0.050, 1.0)
GRAPHITE = (0.12, 0.16, 0.15, 1.0)
METAL = (0.57, 0.63, 0.61, 1.0)
PAPER = (0.91, 0.94, 0.92, 1.0)
WHITE = (0.985, 0.99, 0.985, 1.0)
TEAL = (0.02, 0.44, 0.39, 1.0)
AMBER = (0.76, 0.34, 0.04, 1.0)
VIOLET = (0.30, 0.20, 0.55, 1.0)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in (bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for item in list(collection):
            collection.remove(item)


def material(name: str, color: tuple[float, float, float, float], metallic: float = 0.0, roughness: float = 0.48):
    value = bpy.data.materials.new(name)
    value.diffuse_color = color
    value.use_nodes = True
    shader = value.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = color
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    return value


def palette():
    return {
        "ink": material("Ink", INK, 0.18, 0.34),
        "graphite": material("Graphite", GRAPHITE, 0.3, 0.36),
        "metal": material("Machined alloy", METAL, 0.68, 0.28),
        "paper": material("Off white shell", PAPER, 0.05, 0.62),
        "white": material("White ceramic", WHITE, 0.02, 0.5),
        "teal": material("Signal teal", TEAL, 0.22, 0.3),
        "amber": material("Survey amber", AMBER, 0.2, 0.34),
        "violet": material("Reconstruction violet", VIOLET, 0.15, 0.42),
    }


def assign(obj, mat):
    obj.data.materials.append(mat)
    return obj


def box(name: str, location, size, mat, bevel: float = 0.07):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = tuple(value / 2 for value in size)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        modifier = obj.modifiers.new("Machined edge", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
    return assign(obj, mat)


def cylinder(name: str, location, radius: float, depth: float, mat, rotation=(0, 0, 0), vertices=32):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    bevel = obj.modifiers.new("Machined rim", "BEVEL")
    bevel.width = min(radius * 0.08, 0.045)
    bevel.segments = 2
    return assign(obj, mat)


def torus(name: str, location, major_radius: float, minor_radius: float, mat, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=major_radius, minor_radius=minor_radius, major_segments=36, minor_segments=10, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    return assign(obj, mat)


def sphere(name: str, location, radius: float, mat):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=radius, location=location)
    obj = bpy.context.object
    obj.name = name
    return assign(obj, mat)


def setup_render(width: int, height: int, transparent: bool, ortho_scale: float, camera_location=(5.2, -7.0, 4.8), target=(0, 0, 0.4)):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = transparent
    scene.render.image_settings.file_format = "WEBP"
    scene.render.image_settings.color_mode = "RGBA" if transparent else "RGB"
    scene.render.image_settings.quality = 86
    scene.render.image_settings.color_depth = "8"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.world.color = (0.96, 0.975, 0.968)

    bpy.ops.object.camera_add(location=camera_location)
    camera = bpy.context.object
    camera.name = "Orthographic product camera"
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = ortho_scale
    camera.rotation_euler = (Vector(target) - camera.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = camera

    for name, energy, size, location in (
        ("Key softbox", 850, 4.0, (-4.5, -4.0, 7.5)),
        ("Fill softbox", 520, 3.0, (5.5, -1.0, 4.5)),
        ("Rim softbox", 700, 2.5, (1.5, 5.0, 6.0)),
    ):
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        light.name = name
        light.data.energy = energy
        light.data.shape = "DISK"
        light.data.size = size
        light.rotation_euler = (Vector(target) - light.location).to_track_quat("-Z", "Y").to_euler()


def base_plate(mats):
    box("Socket plate", (0, 0, -0.28), (3.2, 2.45, 0.32), mats["metal"], 0.11)
    box("Recess", (0, -0.02, -0.08), (2.75, 2.0, 0.16), mats["graphite"], 0.08)


def build_home(m):
    base_plate(m)
    box("Dossier cover", (0, 0, 0.42), (2.05, 1.55, 0.24), m["paper"], 0.09)
    box("Dossier spine", (-.92, 0, 0.53), (.18, 1.55, .36), m["graphite"], .03)
    box("Signal label", (.25, -.79, .57), (.95, .08, .23), m["teal"], .025)


def build_selected(m):
    base_plate(m)
    for idx, x in enumerate((-0.68, 0, 0.68)):
        box(f"Evidence plate {idx + 1}", (x, .05 * idx, .45 + .13 * idx), (.54, 1.35, .22), m["paper" if idx != 1 else "teal"], .06)
    torus("Inspection ring", (0, -.48, 1.03), .45, .10, m["graphite"], rotation=(math.pi / 2, 0, 0))


def build_experience(m):
    base_plate(m)
    box("Timeline rail", (0, 0, .38), (2.35, .22, .24), m["graphite"], .04)
    for idx, x in enumerate((-0.85, 0, .85)):
        cylinder(f"Milestone {idx + 1}", (x, 0, .64 + idx * .16), .25, .42, m["teal" if idx == 2 else "metal"])
        box(f"Milestone tab {idx + 1}", (x, .2, .35), (.08, .65, .08), m["amber"], .01)


def build_archive(m):
    base_plate(m)
    box("Archive cabinet", (0, 0, .55), (2.1, 1.45, 1.25), m["paper"], .11)
    for z in (.22, .58, .94):
        box("Archive drawer", (0, -.735, z), (1.78, .08, .24), m["metal"], .025)
        box("Archive pull", (0, -.81, z), (.55, .08, .08), m["graphite"], .025)


def build_systems(m):
    base_plate(m)
    for x in (-.72, .72):
        box("Machine housing", (x, .15, .52), (.82, 1.08, 1.05), m["metal"], .11)
        cylinder("Machine dial", (x, -.42, .62), .24, .12, m["graphite"], rotation=(math.pi / 2, 0, 0))
    box("Transfer rail", (0, -.34, .18), (2.35, .32, .2), m["graphite"], .04)
    for idx, x in enumerate((-.55, 0, .55)):
        box(f"Job {idx + 1}", (x, -.36, .43), (.32, .32, .28), (m["teal"], m["amber"], m["violet"])[idx], .04)


def build_camera(m):
    base_plate(m)
    box("Camera body", (0, .18, .62), (1.75, 1.1, 1.12), m["graphite"], .16)
    cylinder("Lens barrel", (0, -.62, .62), .57, .82, m["metal"], rotation=(math.pi / 2, 0, 0))
    torus("Focus ring", (0, -.95, .62), .48, .09, m["teal"], rotation=(math.pi / 2, 0, 0))
    cylinder("Lens glass", (0, -1.05, .62), .39, .08, m["ink"], rotation=(math.pi / 2, 0, 0))


def build_world(m):
    base_plate(m)
    box("Optical rail", (0, .1, .18), (2.55, .25, .2), m["graphite"], .04)
    cylinder("World lens", (-.7, .08, .72), .42, .2, m["teal"], rotation=(math.pi / 2, 0, 0))
    sphere("Calibration world", (.55, .08, .78), .58, m["metal"])
    torus("World orbit", (.55, .08, .78), .78, .035, m["amber"], rotation=(math.pi / 2, 0, 0))


def build_capabilities(m):
    base_plate(m)
    cylinder("Capability hub", (0, 0, .55), .5, .7, m["graphite"])
    for idx in range(6):
        angle = idx * math.tau / 6
        x, y = math.cos(angle) * .92, math.sin(angle) * .68
        box(f"Capability cartridge {idx + 1}", (x, y, .52), (.42, .42, .58), m["teal"] if idx == 0 else m["metal"], .07)


def build_proof(m):
    base_plate(m)
    cylinder("Vault body", (0, 0, .62), .92, .72, m["graphite"])
    cylinder("Vault door", (0, -.45, .62), .72, .16, m["metal"], rotation=(math.pi / 2, 0, 0))
    torus("Vault ring", (0, -.57, .62), .48, .07, m["amber"], rotation=(math.pi / 2, 0, 0))
    for idx in range(3):
        angle = idx * math.tau / 3
        box("Vault lug", (math.cos(angle) * .34, -.68, .62 + math.sin(angle) * .34), (.14, .1, .38), m["graphite"], .025)


def build_resumes(m):
    base_plate(m)
    for idx in range(4):
        box(f"Resume sheet {idx + 1}", (-.12 + idx * .08, .08 + idx * .05, .2 + idx * .16), (1.75, 1.35, .11), m["paper"], .045)
    box("Contact tab", (.48, -.66, .84), (.72, .12, .28), m["teal"], .035)
    cylinder("Contact signal", (-.56, -.66, .76), .15, .12, m["amber"], rotation=(math.pi / 2, 0, 0))


ICON_BUILDERS = {
    "home": build_home,
    "selected-work": build_selected,
    "experience": build_experience,
    "project-archive": build_archive,
    "systems-lab": build_systems,
    "camera-lab": build_camera,
    "world-3d": build_world,
    "capabilities": build_capabilities,
    "proof-vault": build_proof,
    "resumes-contact": build_resumes,
}


def render_icon(app_id: str, builder) -> Path:
    clear_scene()
    mats = palette()
    builder(mats)
    setup_render(256, 256, True, 4.5)
    path = ICON_DIR / f"{app_id}.webp"
    bpy.context.scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    return path


def build_optical_rail(m):
    box("Rail left", (0, -.35, .08), (5.8, .18, .16), m["graphite"], .035)
    box("Rail right", (0, .35, .08), (5.8, .18, .16), m["graphite"], .035)
    for x in (-2.35, -1.15, 0, 1.15, 2.35):
        box("Station carriage", (x, 0, .2), (.48, 1.1, .22), m["metal"], .055)
    box("Camera body", (-2.0, 0, 1.05), (1.05, .92, 1.25), m["graphite"], .13)
    cylinder("Lens barrel", (-1.35, 0, 1.05), .48, .8, m["metal"], rotation=(0, math.pi / 2, 0))
    torus("Focus ring", (-.98, 0, 1.05), .39, .08, m["teal"], rotation=(0, math.pi / 2, 0))
    torus("Aperture housing", (.2, 0, 1.05), .72, .09, m["graphite"], rotation=(0, math.pi / 2, 0))
    for idx in range(6):
        angle = idx * math.tau / 6
        blade = box("Iris blade", (.2, 0, 1.05), (.56, .045, .22), m["metal"], .02)
        blade.rotation_euler[0] = angle
    box("Image plane", (2.05, 0, 1.05), (.12, 2.2, 2.1), m["paper"], .035)
    for y in (-.65, 0, .65):
        for z in (.5, 1.05, 1.6):
            sphere("Calibration point", (1.96, y, z), .075, m["amber"] if y == 0 else m["teal"])


def build_flow_shop(m):
    box("Flow base", (0, 0, .05), (5.2, 2.3, .18), m["metal"], .07)
    box("Conveyor", (0, -.48, .36), (4.7, .62, .3), m["graphite"], .06)
    for x, label in ((-1.35, "M1"), (1.35, "M2")):
        box(label, (x, .35, 1.05), (1.45, 1.3, 1.65), m["metal"], .15)
        cylinder(f"{label} spindle", (x, -.38, 1.12), .39, .35, m["graphite"], rotation=(math.pi / 2, 0, 0))
        torus(f"{label} signal", (x, -.58, 1.12), .3, .045, m["teal"], rotation=(math.pi / 2, 0, 0))
    for idx, x in enumerate((-1.7, 0, 1.7)):
        box(f"Job {idx + 1}", (x, -.5, .7), (.55, .55, .5), (m["teal"], m["amber"], m["violet"])[idx], .06)


def build_spatial_table(m):
    box("Allocation table", (0, 0, .18), (5.2, 3.8, .35), m["paper"], .1)
    for value in (-2, -1, 0, 1, 2):
        box("Grid X", (value, 0, .39), (.025, 3.45, .025), m["metal"], 0)
    for value in (-1.5, -.75, 0, .75, 1.5):
        box("Grid Y", (0, value, .39), (4.75, .025, .025), m["metal"], 0)
    for idx, (x, y) in enumerate(((-1.5, .9), (1.4, -.9), (.85, 1.05), (-.65, -.75))):
        cylinder(f"Plot {idx + 1}", (x, y, .58), .34, .35, m["teal"] if idx < 3 else m["metal"])
    cylinder("Allocation marker", (-.2, .1, .86), .22, .92, m["amber"])
    sphere("Marker head", (-.2, .1, 1.38), .31, m["amber"])


MECHANISMS = {
    "optical-rail": build_optical_rail,
    "flow-shop-machine": build_flow_shop,
    "spatial-allocation-table": build_spatial_table,
}


def export_mechanism(asset_id: str, builder) -> Path:
    clear_scene()
    mats = palette()
    builder(mats)
    path = MODEL_DIR / f"{asset_id}.glb"
    bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", export_apply=True, export_materials="EXPORT", export_yup=True)
    return path


def render_poster(asset_id: str, builder) -> Path:
    clear_scene()
    mats = palette()
    builder(mats)
    box("Poster floor", (0, 0, -.18), (7.3, 5.0, .16), mats["white"], .08)
    setup_render(768, 512, False, 7.2, camera_location=(7.2, -9.2, 6.2), target=(0, 0, .7))
    path = POSTER_DIR / f"{asset_id}.webp"
    bpy.context.scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    return path


def main() -> None:
    for directory in (ICON_DIR, MODEL_DIR, POSTER_DIR):
        directory.mkdir(parents=True, exist_ok=True)

    icons = []
    for app_id, builder in ICON_BUILDERS.items():
        path = render_icon(app_id, builder)
        icons.append({"appId": app_id, "src": f"/workstation/icons/{path.name}", "sha256": sha256(path)})

    mechanisms = []
    for asset_id, builder in MECHANISMS.items():
        path = export_mechanism(asset_id, builder)
        mechanisms.append({"id": asset_id, "src": f"/workstation/models/{path.name}", "sha256": sha256(path)})

    posters = []
    for poster_id, builder in (
        ("optical-bench", build_optical_rail),
        ("flow-shop-machine", build_flow_shop),
        ("spatial-allocation-table", build_spatial_table),
    ):
        path = render_poster(poster_id, builder)
        posters.append({"id": poster_id, "src": f"/workstation/posters/{path.name}", "sha256": sha256(path)})
    manifest = {
        "version": 1,
        "generator": "Blender 5.x / scripted geometry",
        "icons": icons,
        "mechanisms": mechanisms,
        "posters": posters,
    }
    (OUTPUT / "assets.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
