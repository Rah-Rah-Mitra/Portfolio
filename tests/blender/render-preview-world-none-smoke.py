"""Blender smoke test: preview rendering must create a missing World safely."""

from pathlib import Path
import runpy
import sys
import tempfile

import bpy


repo = Path(__file__).resolve().parents[2]
with tempfile.TemporaryDirectory(prefix="courier-preview-smoke-") as temporary:
    temporary_path = Path(temporary)
    blend_path = temporary_path / "world-none.blend"
    output_path = temporary_path / "preview"

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, location=(0, 0, 1))
    bpy.context.object.name = "OpticalCourier_Body"
    bpy.context.scene.world = None
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))

    sys.argv = [
        "render_preview.py",
        "--",
        "--blend",
        str(blend_path),
        "--output-dir",
        str(output_path),
    ]
    runpy.run_path(str(repo / "scripts" / "optical-courier" / "render_preview.py"), run_name="__main__")

    expected = {
        output_path / "optical-courier-front.png",
        output_path / "optical-courier-left.png",
        output_path / "optical-courier-back.png",
        output_path / "optical-courier-three-quarter.png",
    }
    missing = [str(path) for path in expected if not path.is_file() or path.stat().st_size == 0]
    if missing:
        raise AssertionError(f"preview renderer did not create expected frames: {missing}")

print("render-preview world=None smoke passed")
