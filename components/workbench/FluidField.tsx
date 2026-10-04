import React, { useEffect, useRef } from 'react';
import type { FluidPreferences } from '../../types';
import {
  FLUID_DYE, FLUID_GRID, FLUID_PRESSURE_ITERATIONS, hexToRgb, type BackdropPalette,
} from '../../lib/desktopBackgroundPolicy';

// The fluid desk backdrop: Stam's "stable fluids" on the GPU (semi-Lagrangian
// advection, vorticity confinement, Jacobi pressure projection) in WebGL2.
// Lazy-loaded by DeskBackdrop, which decides when it mounts and runs.
//
// What changed for the light technical ground:
//  - the dye is ONE scalar (smoke density in .r), not an RGB rainbow. The
//    display pass maps it through an accent ramp — thin smoke in --color-accent,
//    dense smoke toward --color-accent-700 — with Beer–Lambert coverage
//    (1 - e^-kd), so it thickens like smoke instead of clipping like paint;
//  - output is premultiplied alpha on a transparent canvas, so the desk grid
//    shows through and the smoke can only shade the paper. The FX opacity
//    setting caps coverage (default 28%);
//  - the canvas and the pointer are DESK-relative (ResizeObserver on the canvas,
//    listeners on the desk), not window-relative.
//
// Signed velocity needs float render targets; a GPU without
// EXT_color_buffer_float gets no fluid (RGBA8 would clamp negative velocity to
// zero and corrupt advection), and onUnavailable says so.

type Fbo = {
  texture: WebGLTexture;
  fbo: WebGLFramebuffer;
  width: number;
  height: number;
  texelSizeX: number;
  texelSizeY: number;
};

type DoubleFbo = {
  read: Fbo;
  write: Fbo;
  swap: () => void;
};

type Splat = {
  x: number;
  y: number;
  dx: number;
  dy: number;
  /** Smoke density added at the centre of the splat. */
  amount: number;
  radius: number;
};

const vertexShader = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPosition;
out vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const clearShader = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uTexture;
uniform float value;
void main() {
  fragColor = value * texture(uTexture, vUv);
}`;

// Shared by both splat passes: velocity splats write (dx, dy, 0), dye splats
// write (density, 0, 0).
const splatShader = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uTarget;
uniform float aspectRatio;
uniform vec3 color;
uniform vec2 point;
uniform float radius;
void main() {
  vec2 p = vUv - point;
  p.x *= aspectRatio;
  vec3 splat = exp(-dot(p, p) / radius) * color;
  vec3 base = texture(uTarget, vUv).xyz;
  fragColor = vec4(base + splat, 1.0);
}`;

const advectionShader = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 texelSize;
uniform float dt;
uniform float dissipation;
void main() {
  vec2 velocity = texture(uVelocity, vUv).xy;
  vec2 coord = vUv - dt * velocity * texelSize;
  fragColor = dissipation * texture(uSource, coord);
}`;

const divergenceShader = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uVelocity;
uniform vec2 texelSize;
void main() {
  float left = texture(uVelocity, vUv - vec2(texelSize.x, 0.0)).x;
  float right = texture(uVelocity, vUv + vec2(texelSize.x, 0.0)).x;
  float bottom = texture(uVelocity, vUv - vec2(0.0, texelSize.y)).y;
  float top = texture(uVelocity, vUv + vec2(0.0, texelSize.y)).y;
  float divergence = 0.5 * (right - left + top - bottom);
  fragColor = vec4(divergence, 0.0, 0.0, 1.0);
}`;

const curlShader = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uVelocity;
uniform vec2 texelSize;
void main() {
  float left = texture(uVelocity, vUv - vec2(texelSize.x, 0.0)).y;
  float right = texture(uVelocity, vUv + vec2(texelSize.x, 0.0)).y;
  float bottom = texture(uVelocity, vUv - vec2(0.0, texelSize.y)).x;
  float top = texture(uVelocity, vUv + vec2(0.0, texelSize.y)).x;
  float curl = right - left - top + bottom;
  fragColor = vec4(0.5 * curl, 0.0, 0.0, 1.0);
}`;

const vorticityShader = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform vec2 texelSize;
uniform float curl;
uniform float dt;
void main() {
  float left = abs(texture(uCurl, vUv - vec2(texelSize.x, 0.0)).x);
  float right = abs(texture(uCurl, vUv + vec2(texelSize.x, 0.0)).x);
  float bottom = abs(texture(uCurl, vUv - vec2(0.0, texelSize.y)).x);
  float top = abs(texture(uCurl, vUv + vec2(0.0, texelSize.y)).x);
  float center = texture(uCurl, vUv).x;
  vec2 force = 0.5 * vec2(right - left, top - bottom);
  force /= length(force) + 0.0001;
  force *= curl * center;
  force.y *= -1.0;
  vec2 velocity = texture(uVelocity, vUv).xy;
  velocity += force * dt;
  fragColor = vec4(velocity, 0.0, 1.0);
}`;

const pressureShader = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
uniform vec2 texelSize;
void main() {
  float left = texture(uPressure, vUv - vec2(texelSize.x, 0.0)).x;
  float right = texture(uPressure, vUv + vec2(texelSize.x, 0.0)).x;
  float bottom = texture(uPressure, vUv - vec2(0.0, texelSize.y)).x;
  float top = texture(uPressure, vUv + vec2(0.0, texelSize.y)).x;
  float divergence = texture(uDivergence, vUv).x;
  float pressure = (left + right + bottom + top - divergence) * 0.25;
  fragColor = vec4(pressure, 0.0, 0.0, 1.0);
}`;

const gradientSubtractShader = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
uniform vec2 texelSize;
void main() {
  float left = texture(uPressure, vUv - vec2(texelSize.x, 0.0)).x;
  float right = texture(uPressure, vUv + vec2(texelSize.x, 0.0)).x;
  float bottom = texture(uPressure, vUv - vec2(0.0, texelSize.y)).x;
  float top = texture(uPressure, vUv + vec2(0.0, texelSize.y)).x;
  vec2 velocity = texture(uVelocity, vUv).xy;
  velocity -= vec2(right - left, top - bottom) * 0.5;
  fragColor = vec4(velocity, 0.0, 1.0);
}`;

// Density → premultiplied accent smoke. See the header for the ramp.
const displayShader = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uTexture;
uniform float opacity;
uniform float boost;
uniform vec3 thin;
uniform vec3 dense;
void main() {
  float density = max(texture(uTexture, vUv).r, 0.0);
  float cover = 1.0 - exp(-density * boost);
  vec3 ink = mix(thin, dense, smoothstep(0.2, 0.9, cover));
  float alpha = cover * opacity;
  fragColor = vec4(ink * alpha, alpha);
}`;

const compileShader = (gl: WebGL2RenderingContext, type: number, source: string) => {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Unable to create shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? 'Shader compilation failed');
  }
  return shader;
};

const createProgram = (gl: WebGL2RenderingContext, fragmentSource: string) => {
  const program = gl.createProgram();
  if (!program) throw new Error('Unable to create program');
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexShader);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? 'Program link failed');
  }
  return program;
};

const getUniforms = (gl: WebGL2RenderingContext, program: WebGLProgram) => {
  const uniforms: Record<string, WebGLUniformLocation | null> = {};
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
  for (let i = 0; i < count; i += 1) {
    const uniform = gl.getActiveUniform(program, i);
    if (uniform) uniforms[uniform.name] = gl.getUniformLocation(program, uniform.name);
  }
  return uniforms;
};

/** A field that mounts halted is run this many steps, unseen, before its one still frame. */
const PRIME_STEPS = 120;
const PRIME_EPOCH_MS = 41_000;
/** The grids are rebuilt this long after the last resize, not on every frame of a drag. */
const RESIZE_SETTLE_MS = 150;

export interface FluidFieldProps {
  params: FluidPreferences;
  palette: BackdropPalette;
  /** Animate. False freezes the smoke on its last frame (or on a primed still frame). */
  running: boolean;
  /** Called if this GPU cannot host the simulation. */
  onUnavailable?: () => void;
}

const FluidField: React.FC<FluidFieldProps> = ({ params, palette, running, onUnavailable }) => {
  const hostRef = useRef<HTMLDivElement>(null);
  // Live simulation parameters are read per frame, so slider changes never
  // rebuild the GL pipeline; only quality and pointer interaction re-key it.
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const paletteRef = useRef(palette);
  paletteRef.current = palette;
  const runningRef = useRef(running);
  runningRef.current = running;
  const onUnavailableRef = useRef(onUnavailable);
  onUnavailableRef.current = onUnavailable;
  const resumeRef = useRef<(() => void) | null>(null);
  const suspendRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (running) resumeRef.current?.();
    else suspendRef.current?.();
  }, [running]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    // Every run of this effect (a re-key, or StrictMode's dev double-run) gets a
    // canvas of its own: a canvas whose WebGL context was lost cannot host a new one.
    const canvas = document.createElement('canvas');
    canvas.className = 'wb-backdrop-canvas';
    canvas.dataset.backdrop = 'fluid';
    host.appendChild(canvas);
    const teardown = ((): (() => void) | undefined => {
      const desk = (canvas.closest('[data-desk]') as HTMLElement | null) ?? canvas.parentElement;
      const quality = params.quality;

      const gl = canvas.getContext('webgl2', {
        alpha: true,
        antialias: false,
        depth: false,
        premultipliedAlpha: true,
        preserveDrawingBuffer: false,
        stencil: false,
      });
      if (!gl) {
        onUnavailableRef.current?.();
        return undefined;
      }

      const floatRenderable = gl.getExtension('EXT_color_buffer_float');
      const linearFiltering = gl.getExtension('OES_texture_float_linear');
      if (!floatRenderable) {
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        onUnavailableRef.current?.();
        return undefined;
      }
      const internalFormat = gl.RGBA16F;
      const textureType = gl.HALF_FLOAT;
      const filtering = linearFiltering ? gl.LINEAR : gl.NEAREST;

      const sources = {
        clear: clearShader,
        splat: splatShader,
        advection: advectionShader,
        divergence: divergenceShader,
        curl: curlShader,
        vorticity: vorticityShader,
        pressure: pressureShader,
        gradient: gradientSubtractShader,
        display: displayShader,
      };
      type ProgramId = keyof typeof sources;
      let programs: Record<ProgramId, WebGLProgram>;
      try {
        programs = Object.fromEntries(
          Object.entries(sources).map(([key, source]) => [key, createProgram(gl, source)])
        ) as Record<ProgramId, WebGLProgram>;
      } catch (error) {
        console.warn('[fluid backdrop]', error);
        onUnavailableRef.current?.();
        return undefined;
      }
      const uniforms = Object.fromEntries(
        Object.entries(programs).map(([key, program]) => [key, getUniforms(gl, program)])
      ) as Record<ProgramId, Record<string, WebGLUniformLocation | null>>;

      const quad = gl.createBuffer();
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, -1, -1, 1, 1, 1, -1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

      const allocatedFbos = new Set<Fbo>();
      const createFbo = (width: number, height: number): Fbo => {
        const texture = gl.createTexture();
        const fbo = gl.createFramebuffer();
        if (!texture || !fbo) throw new Error('Unable to create fluid framebuffer');
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filtering);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filtering);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, gl.RGBA, textureType, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
        gl.viewport(0, 0, width, height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        const target = { texture, fbo, width, height, texelSizeX: 1 / width, texelSizeY: 1 / height };
        allocatedFbos.add(target);
        return target;
      };

      const createDoubleFbo = (width: number, height: number): DoubleFbo => {
        const target = {
          read: createFbo(width, height),
          write: createFbo(width, height),
          swap() {
            const temp = target.read;
            target.read = target.write;
            target.write = temp;
          },
        };
        return target;
      };

      // Desk size in CSS pixels, kept by the ResizeObserver below.
      const size = { width: Math.max(1, canvas.clientWidth), height: Math.max(1, canvas.clientHeight) };
      const getResolution = (base: number) => {
        const aspect = size.width / Math.max(size.height, 1);
        if (aspect >= 1) return { width: Math.round(base * aspect), height: base };
        return { width: base, height: Math.round(base / aspect) };
      };

      let velocity: DoubleFbo;
      let dye: DoubleFbo;
      let pressure: DoubleFbo;
      let divergence: Fbo;
      let curl: Fbo;
      // False until the dye has first been stepped. A resize carries the smoke
      // across (initFramebuffers resamples it), so it never goes back to false.
      let advanced = false;

      const releaseFbo = (target?: Fbo) => {
        if (!target) return;
        gl.deleteTexture(target.texture);
        gl.deleteFramebuffer(target.fbo);
        allocatedFbos.delete(target);
      };

      const blit = (target: Fbo | null) => {
        if (target) {
          gl.viewport(0, 0, target.width, target.height);
          gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
        } else {
          gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        }
        gl.bindVertexArray(vao);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      };

      const resizeCanvas = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const width = Math.max(1, Math.floor(size.width * dpr));
        const height = Math.max(1, Math.floor(size.height * dpr));
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }
      };

      // Sized from the desk's aspect. On a rebuild the velocity and the smoke are
      // resampled into the new grids before the old ones are freed, so a resize
      // neither wipes a running field nor replaces the frame a paused one holds;
      // pressure, divergence and curl are scratch and start clear.
      const initFramebuffers = () => {
        resizeCanvas();
        const simRes = getResolution(FLUID_GRID[quality]);
        const dyeRes = getResolution(FLUID_DYE[quality]);
        const previous = allocatedFbos.size > 0 ? { velocity, dye } : null;
        if (previous
          && previous.velocity.read.width === simRes.width && previous.velocity.read.height === simRes.height
          && previous.dye.read.width === dyeRes.width && previous.dye.read.height === dyeRes.height) return;
        const stale = [...allocatedFbos];
        const nextVelocity = createDoubleFbo(simRes.width, simRes.height);
        const nextDye = createDoubleFbo(dyeRes.width, dyeRes.height);
        if (previous) {
          gl.disable(gl.BLEND);
          resample(previous.velocity.read, nextVelocity.read);
          resample(previous.dye.read, nextDye.read);
        }
        stale.forEach(releaseFbo);
        velocity = nextVelocity;
        dye = nextDye;
        pressure = createDoubleFbo(simRes.width, simRes.height);
        divergence = createFbo(simRes.width, simRes.height);
        curl = createFbo(simRes.width, simRes.height);
      };

      const bindTexture = (texture: WebGLTexture, slot: number) => {
        gl.activeTexture(gl.TEXTURE0 + slot);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        return slot;
      };

      // The clear program at value 1 is a filtered copy (fragColor = value * texture).
      const resample = (from: Fbo, to: Fbo) => {
        gl.useProgram(programs.clear);
        gl.uniform1i(uniforms.clear.uTexture, bindTexture(from.texture, 0));
        gl.uniform1f(uniforms.clear.value, 1);
        blit(to);
      };

      const splats: Splat[] = [];
      const splat = (target: DoubleFbo, item: Splat, velocityPass = false) => {
        gl.useProgram(programs.splat);
        gl.uniform1i(uniforms.splat.uTarget, bindTexture(target.read.texture, 0));
        gl.uniform1f(uniforms.splat.aspectRatio, canvas.width / Math.max(canvas.height, 1));
        gl.uniform2f(uniforms.splat.point, item.x, item.y);
        gl.uniform1f(uniforms.splat.radius, item.radius);
        if (velocityPass) gl.uniform3f(uniforms.splat.color, item.dx, item.dy, 0);
        else gl.uniform3f(uniforms.splat.color, item.amount, 0, 0);
        blit(target.write);
        target.swap();
      };

      // An ambient source wanders the desk so the field is alive without a pointer.
      let idleTime = 0;
      const ambient = (time: number, dt: number) => {
        idleTime += dt;
        if (idleTime <= 0.22) return;
        idleTime = 0;
        const t = time * 0.00018;
        splats.push({
          x: 0.5 + Math.sin(t * 2.1) * 0.32,
          y: 0.52 + Math.cos(t * 1.7) * 0.24,
          dx: Math.cos(t * 3.0) * 80,
          dy: Math.sin(t * 2.4) * 80,
          amount: 0.12 * (paramsRef.current.intensity / 60),
          radius: Math.max(0.0005, (paramsRef.current.splatRadius / 100) * 0.018),
        });
      };

      const step = (dt: number) => {
        gl.disable(gl.BLEND);
        while (splats.length) {
          const item = splats.shift();
          if (!item) break;
          splat(velocity, item, true);
          splat(dye, item, false);
        }

        gl.useProgram(programs.curl);
        gl.uniform2f(uniforms.curl.texelSize, velocity.read.texelSizeX, velocity.read.texelSizeY);
        gl.uniform1i(uniforms.curl.uVelocity, bindTexture(velocity.read.texture, 0));
        blit(curl);

        gl.useProgram(programs.vorticity);
        gl.uniform2f(uniforms.vorticity.texelSize, velocity.read.texelSizeX, velocity.read.texelSizeY);
        gl.uniform1i(uniforms.vorticity.uVelocity, bindTexture(velocity.read.texture, 0));
        gl.uniform1i(uniforms.vorticity.uCurl, bindTexture(curl.texture, 1));
        gl.uniform1f(uniforms.vorticity.curl, paramsRef.current.curl);
        gl.uniform1f(uniforms.vorticity.dt, dt);
        blit(velocity.write);
        velocity.swap();

        gl.useProgram(programs.divergence);
        gl.uniform2f(uniforms.divergence.texelSize, velocity.read.texelSizeX, velocity.read.texelSizeY);
        gl.uniform1i(uniforms.divergence.uVelocity, bindTexture(velocity.read.texture, 0));
        blit(divergence);

        gl.useProgram(programs.clear);
        gl.uniform1i(uniforms.clear.uTexture, bindTexture(pressure.read.texture, 0));
        gl.uniform1f(uniforms.clear.value, 0.78);
        blit(pressure.write);
        pressure.swap();

        for (let i = 0; i < FLUID_PRESSURE_ITERATIONS[quality]; i += 1) {
          gl.useProgram(programs.pressure);
          gl.uniform2f(uniforms.pressure.texelSize, pressure.read.texelSizeX, pressure.read.texelSizeY);
          gl.uniform1i(uniforms.pressure.uPressure, bindTexture(pressure.read.texture, 0));
          gl.uniform1i(uniforms.pressure.uDivergence, bindTexture(divergence.texture, 1));
          blit(pressure.write);
          pressure.swap();
        }

        gl.useProgram(programs.gradient);
        gl.uniform2f(uniforms.gradient.texelSize, velocity.read.texelSizeX, velocity.read.texelSizeY);
        gl.uniform1i(uniforms.gradient.uPressure, bindTexture(pressure.read.texture, 0));
        gl.uniform1i(uniforms.gradient.uVelocity, bindTexture(velocity.read.texture, 1));
        blit(velocity.write);
        velocity.swap();

        gl.useProgram(programs.advection);
        gl.uniform2f(uniforms.advection.texelSize, velocity.read.texelSizeX, velocity.read.texelSizeY);
        gl.uniform1i(uniforms.advection.uVelocity, bindTexture(velocity.read.texture, 0));
        gl.uniform1i(uniforms.advection.uSource, bindTexture(velocity.read.texture, 1));
        gl.uniform1f(uniforms.advection.dt, dt);
        gl.uniform1f(uniforms.advection.dissipation, 0.985);
        blit(velocity.write);
        velocity.swap();

        gl.useProgram(programs.advection);
        gl.uniform2f(uniforms.advection.texelSize, dye.read.texelSizeX, dye.read.texelSizeY);
        gl.uniform1i(uniforms.advection.uVelocity, bindTexture(velocity.read.texture, 0));
        gl.uniform1i(uniforms.advection.uSource, bindTexture(dye.read.texture, 1));
        gl.uniform1f(uniforms.advection.dt, dt);
        gl.uniform1f(uniforms.advection.dissipation, 0.992);
        blit(dye.write);
        dye.swap();
        advanced = true;
      };

      const display = () => {
        const [thinR, thinG, thinB] = hexToRgb(paletteRef.current.accent);
        const [denseR, denseG, denseB] = hexToRgb(paletteRef.current.accentDeep);
        gl.useProgram(programs.display);
        gl.uniform1i(uniforms.display.uTexture, bindTexture(dye.read.texture, 0));
        gl.uniform1f(uniforms.display.opacity, paramsRef.current.opacity / 100);
        gl.uniform1f(uniforms.display.boost, 0.9 + paramsRef.current.intensity / 80);
        gl.uniform3f(uniforms.display.thin, thinR, thinG, thinB);
        gl.uniform3f(uniforms.display.dense, denseR, denseG, denseB);
        blit(null);
      };

      // One still frame for a halted field. A field that has never moved is
      // first run, unseen, from a fixed epoch, so reduced motion gets the same
      // smoke every time rather than an empty sheet.
      const still = () => {
        if (!advanced) {
          const dt = (1 / 60) * paramsRef.current.speed;
          for (let i = 0; i < PRIME_STEPS; i += 1) {
            ambient(PRIME_EPOCH_MS + i * (1000 / 60), dt);
            step(dt);
          }
        }
        display();
      };

      // Splats follow pointer motion across the desk, read passively so a window
      // drag or a click is never slowed or swallowed. A press on the bare desk
      // (not on a window or a shortcut) drops a denser puff.
      const pointerState = new Map<number, { x: number; y: number }>();
      let deskRect: DOMRect | null = null;
      const queueSplat = (event: PointerEvent, press = false) => {
        if (!deskRect) deskRect = desk?.getBoundingClientRect() ?? null;
        if (!deskRect || deskRect.width < 1 || deskRect.height < 1) return;
        const previous = pointerState.get(event.pointerId);
        const x = (event.clientX - deskRect.left) / deskRect.width;
        const y = 1 - (event.clientY - deskRect.top) / deskRect.height;
        pointerState.set(event.pointerId, { x, y });
        if (!previous && !press) return;
        const dx = previous ? (x - previous.x) * deskRect.width : 0;
        const dy = previous ? (y - previous.y) * deskRect.height : 0;
        splats.push({
          x,
          y,
          dx: dx * 8,
          dy: dy * 8,
          amount: (press ? 1.4 : 0.6) * (paramsRef.current.intensity / 65),
          radius: Math.max(0.0006, (paramsRef.current.splatRadius / 100) * 0.026),
        });
      };
      // A frozen field takes no splats: they would queue up and land all at once on resume.
      const handlePointerMove = (event: PointerEvent) => {
        if (loop) queueSplat(event);
      };
      const handlePointerDown = (event: PointerEvent) => {
        if (loop && event.target === desk) queueSplat(event, true);
      };
      const handlePointerLeave = (event: PointerEvent) => pointerState.delete(event.pointerId);
      const refreshRect = () => { deskRect = null; };

      let lastTime = 0;
      let animationId = 0;
      let loop = false;

      const frame = (time: number) => {
        const dt = Math.min(0.033, (time - lastTime) / 1000) * paramsRef.current.speed;
        lastTime = time;
        ambient(time, dt);
        step(dt);
        display();
        if (loop) animationId = requestAnimationFrame(frame);
      };

      const start = () => {
        if (loop) return;
        loop = true;
        lastTime = performance.now();
        animationId = requestAnimationFrame(frame);
      };
      const stop = () => {
        loop = false;
        cancelAnimationFrame(animationId);
        pointerState.clear();
        // A field that ran keeps its last frame; one that never did gets a still.
        if (!advanced) still();
      };

      // A resize redraws the current smoke at the new canvas size straight away
      // (one draw: resizing the canvas clears it) and rebuilds the grids once the
      // drag settles. Nothing here re-primes: a field that has moved keeps what
      // it has, and a paused one keeps the frame it was paused on.
      let settleTimer = 0;
      const settle = () => {
        settleTimer = 0;
        initFramebuffers();
        if (!loop) still();
      };
      const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(([entry]) => {
        if (!entry) return;
        const { width, height } = entry.contentRect;
        // A host hidden with display: none (a Suspense boundary showing its
        // fallback) reports 0×0. It shows nothing, so there is nothing to resize.
        if (width < 1 || height < 1) return;
        deskRect = null;
        if (Math.abs(width - size.width) < 1 && Math.abs(height - size.height) < 1) return;
        size.width = width;
        size.height = height;
        resizeCanvas();
        display();
        window.clearTimeout(settleTimer);
        settleTimer = window.setTimeout(settle, RESIZE_SETTLE_MS);
      });

      try {
        initFramebuffers();
        resizeObserver?.observe(canvas);
        if (params.pointerInteraction && desk) {
          desk.addEventListener('pointermove', handlePointerMove, { passive: true });
          desk.addEventListener('pointerdown', handlePointerDown, { passive: true });
          desk.addEventListener('pointerleave', handlePointerLeave, { passive: true });
          window.addEventListener('pointerup', handlePointerLeave, { passive: true });
          window.addEventListener('pointercancel', handlePointerLeave, { passive: true });
          window.addEventListener('resize', refreshRect, { passive: true });
        }
        resumeRef.current = start;
        suspendRef.current = stop;
        if (runningRef.current) start();
        else still();
      } catch (error) {
        console.warn('[fluid backdrop]', error);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        onUnavailableRef.current?.();
      }

      return () => {
        loop = false;
        cancelAnimationFrame(animationId);
        window.clearTimeout(settleTimer);
        resumeRef.current = null;
        suspendRef.current = null;
        resizeObserver?.disconnect();
        desk?.removeEventListener('pointermove', handlePointerMove);
        desk?.removeEventListener('pointerdown', handlePointerDown);
        desk?.removeEventListener('pointerleave', handlePointerLeave);
        window.removeEventListener('pointerup', handlePointerLeave);
        window.removeEventListener('pointercancel', handlePointerLeave);
        window.removeEventListener('resize', refreshRect);
        allocatedFbos.forEach(releaseFbo);
        Object.values(programs).forEach((program) => gl.deleteProgram(program));
        gl.deleteBuffer(quad);
        gl.deleteVertexArray(vao);
        // Safe: this run's canvas is removed right after.
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      };
    })();
    return () => {
      teardown?.();
      canvas.remove();
    };
    // quality and pointerInteraction rebuild on a fresh canvas; everything else is read live.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.quality, params.pointerInteraction]);

  return <div ref={hostRef} className="wb-backdrop-host" />;
};

export default FluidField;
