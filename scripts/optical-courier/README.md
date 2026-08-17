# Optical Courier asset pipeline

These Blender 5.2 scripts create and validate the deterministic pre-Mixamo
checkpoint. They do not claim that the character has been rigged or animated.

1. `generate_shell.py` builds one manifold primary body plus the related visor
   signal and saves the source blend.
2. `validate_asset.py` measures the source geometry and transform contract.
3. `export_fbx.py` creates the origin-centred `-Y` forward, `+Z` up Mixamo
   upload FBX.
4. `validate_fbx.py` imports that FBX into a clean Blender scene and verifies
   the connected-component and manifold results survived the round trip.
5. `render_preview.py` renders the front, left, back, and three-quarter
   inspection views.

`normalize_mixamo.py`, `deformation_checks.py`, `package_clips.py`, and
`export_glb.py` are deliberately dormant until the required browser-controlled
Mixamo session is complete. Untouched downloads belong in the gitignored
`assets/optical-courier/raw-mixamo/` directory. A production GLB must not be
exported until all required motion families and deformation checks pass.
