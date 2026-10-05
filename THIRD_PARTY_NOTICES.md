# Third-Party Notices

## Fast Multipole Method reference

The N-body desk backdrop (an FX toggle) derives its two-dimensional logarithmic Fast Multipole Method mathematics and data-structure approach from:

- Project: Fast-Multipole-Method
- Author: Lukas Dürrenberger (`keyframe41`)
- Source: https://github.com/keyframe41/Fast-Multipole-Method
- License: dual Public Domain and MIT; this project uses the MIT grant.

Copyright (c) 2022 Lukas Dürrenberger

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, subject to inclusion of the copyright and permission notice. The software is provided “as is”, without warranty of any kind.

## Runtime libraries

- `matter-js` (https://brm.io/matter-js/) — MIT License. Physics engine for the Systems Lab drop test.

## Build-time tools (not shipped, `scripts/estate`)

The Estate pack tool (`npm run estate:pack`) runs only on a maintainer's machine, from
its own package (`scripts/estate/package.json`, exact pins, own lockfile). None of it is
installed by Vercel or the root `npm ci`, and none of it reaches the site; only the
files it writes under `public/estate/` do.

- `@gltf-transform/core`, `@gltf-transform/extensions`, `@gltf-transform/functions` 4.5.1 (https://gltf-transform.dev) — MIT License, © Don McCurdy. glTF reading, instancing, quantisation and the `EXT_meshopt_compression` writer.
- `meshoptimizer` 1.3.0 (https://github.com/zeux/meshoptimizer) — MIT License, © Arseny Kapoulkine. Vertex-cache reordering and meshopt encoding.
- `gltf-validator` 2.0.0-dev.3.10 (https://github.com/KhronosGroup/glTF-Validator) — Apache License 2.0, © The Khronos Group Inc. Every pack GLB must report 0 errors.
- `sharp` 0.35.5 (https://sharp.pixelplumbing.com), pulled in by `@gltf-transform/functions` through `ndarray-pixels` — Apache License 2.0; its prebuilt `@img/sharp-*` binaries bundle libvips under LGPL-3.0-or-later. The pack tool never calls it (the pack has no textures).
- `ffmpeg-static` 5.3.0 (https://github.com/eugeneware/ffmpeg-static) — GPL-3.0-or-later; it downloads an FFmpeg build (GPL) at install time. Used only as a command-line program to encode the poster stills, with `-map_metadata -1`; no FFmpeg code is linked into anything.
