import React, { useEffect, useRef } from 'react';
import { useAppearance } from '../contexts/AppearanceContext';

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
  color: [number, number, number];
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

const displayShader = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uTexture;
uniform float opacity;
uniform float boost;
void main() {
  vec3 color = texture(uTexture, vUv).rgb;
  color = pow(color * boost, vec3(0.86));
  float alpha = clamp(max(max(color.r, color.g), color.b) * opacity, 0.0, opacity);
  fragColor = vec4(color, alpha);
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

const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
  const hueToRgb = (p: number, q: number, t: number) => {
    let next = t;
    if (next < 0) next += 1;
    if (next > 1) next -= 1;
    if (next < 1 / 6) return p + (q - p) * 6 * next;
    if (next < 1 / 2) return q;
    if (next < 2 / 3) return p + (q - p) * (2 / 3 - next) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hueToRgb(p, q, h + 1 / 3), hueToRgb(p, q, h), hueToRgb(p, q, h - 1 / 3)];
};

const FluidBackground: React.FC<{ active?: boolean }> = ({ active = true }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { preferences } = useAppearance();
  const fluid = preferences.fluid;

  useEffect(() => {
    const canvas = canvasRef.current;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const constrainedMobile = window.innerWidth < 700 && (navigator.hardwareConcurrency ?? 4) <= 4;
    if (!canvas || !active || reducedMotion.matches || constrainedMobile) return undefined;

    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      depth: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      stencil: false,
    });
    if (!gl) return;

    const floatRenderable = gl.getExtension('EXT_color_buffer_float');
    const linearFiltering = gl.getExtension('OES_texture_float_linear');
    const internalFormat = floatRenderable ? gl.RGBA16F : gl.RGBA8;
    const textureType = floatRenderable ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
    const filtering = linearFiltering ? gl.LINEAR : gl.NEAREST;

    const programs = {
      clear: createProgram(gl, clearShader),
      splat: createProgram(gl, splatShader),
      advection: createProgram(gl, advectionShader),
      divergence: createProgram(gl, divergenceShader),
      curl: createProgram(gl, curlShader),
      vorticity: createProgram(gl, vorticityShader),
      pressure: createProgram(gl, pressureShader),
      gradient: createProgram(gl, gradientSubtractShader),
      display: createProgram(gl, displayShader),
    };
    const uniforms = Object.fromEntries(
      Object.entries(programs).map(([key, program]) => [key, getUniforms(gl, program)])
    ) as Record<keyof typeof programs, Record<string, WebGLUniformLocation | null>>;

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

    const getResolution = (base: number) => {
      const aspect = window.innerWidth / Math.max(window.innerHeight, 1);
      if (aspect >= 1) {
        return { width: Math.round(base * aspect), height: base };
      }
      return { width: base, height: Math.round(base / aspect) };
    };

    let velocity: DoubleFbo;
    let dye: DoubleFbo;
    let pressure: DoubleFbo;
    let divergence: Fbo;
    let curl: Fbo;

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
      const width = Math.floor(window.innerWidth * dpr);
      const height = Math.floor(window.innerHeight * dpr);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        canvas.style.width = `${window.innerWidth}px`;
        canvas.style.height = `${window.innerHeight}px`;
      }
    };

    const initFramebuffers = () => {
      allocatedFbos.forEach(releaseFbo);
      resizeCanvas();
      const simBase = fluid.quality === 'high' ? 192 : 128;
      const dyeBase = fluid.quality === 'high' ? 1024 : 768;
      const simRes = getResolution(simBase);
      const dyeRes = getResolution(dyeBase);
      velocity = createDoubleFbo(simRes.width, simRes.height);
      pressure = createDoubleFbo(simRes.width, simRes.height);
      divergence = createFbo(simRes.width, simRes.height);
      curl = createFbo(simRes.width, simRes.height);
      dye = createDoubleFbo(dyeRes.width, dyeRes.height);
    };

    const bindTexture = (texture: WebGLTexture, slot: number) => {
      gl.activeTexture(gl.TEXTURE0 + slot);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      return slot;
    };

    const splats: Splat[] = [];
    const splat = (target: DoubleFbo, item: Splat, velocityPass = false) => {
      gl.useProgram(programs.splat);
      gl.uniform1i(uniforms.splat.uTarget, bindTexture(target.read.texture, 0));
      gl.uniform1f(uniforms.splat.aspectRatio, canvas.width / Math.max(canvas.height, 1));
      gl.uniform2f(uniforms.splat.point, item.x, item.y);
      gl.uniform1f(uniforms.splat.radius, item.radius);
      if (velocityPass) {
        gl.uniform3f(uniforms.splat.color, item.dx, item.dy, 0);
      } else {
        gl.uniform3f(uniforms.splat.color, item.color[0], item.color[1], item.color[2]);
      }
      blit(target.write);
      target.swap();
    };

    const pointerState = new Map<number, { x: number; y: number; hue: number }>();
    const queueSplat = (event: PointerEvent, strong = false) => {
      const previous = pointerState.get(event.pointerId);
      const x = event.clientX / Math.max(window.innerWidth, 1);
      const y = 1 - event.clientY / Math.max(window.innerHeight, 1);
      const dx = previous ? (x - previous.x) * window.innerWidth : 0;
      const dy = previous ? (y - previous.y) * window.innerHeight : 0;
      const hue = previous?.hue ?? ((performance.now() * 0.00008 + event.pointerId * 0.17) % 1);
      pointerState.set(event.pointerId, { x, y, hue: (hue + 0.015) % 1 });

      if (!previous && !strong) return;

      const color = hslToRgb((hue + performance.now() * 0.00003) % 1, 0.78, 0.48);
      const radius = Math.max(0.0006, (fluid.splatRadius / 100) * 0.026);
      const force = strong ? 900 : 8;
      splats.push({
        x,
        y,
        dx: dx * force,
        dy: dy * force,
        color: color.map((value) => value * (fluid.intensity / 65)) as [number, number, number],
        radius,
      });
    };

    const handlePointerMove = (event: PointerEvent) => queueSplat(event);
    const handlePointerDown = (event: PointerEvent) => queueSplat(event, true);
    const handlePointerLeave = (event: PointerEvent) => pointerState.delete(event.pointerId);

    let lastTime = performance.now();
    let idleTime = 0;
    let animationId = 0;

    const draw = (time: number) => {
      const dt = Math.min(0.033, (time - lastTime) / 1000) * fluid.speed;
      lastTime = time;
      resizeCanvas();

      gl.disable(gl.BLEND);
      gl.clearColor(0, 0, 0, 0);

      idleTime += dt;
      if (idleTime > 0.22) {
        idleTime = 0;
        const t = time * 0.00018;
        const color = hslToRgb((t * 0.2 + 0.48) % 1, 0.72, 0.46);
        splats.push({
          x: 0.5 + Math.sin(t * 2.1) * 0.32,
          y: 0.52 + Math.cos(t * 1.7) * 0.24,
          dx: Math.cos(t * 3.0) * 80,
          dy: Math.sin(t * 2.4) * 80,
          color: color.map((value) => value * 0.18 * (fluid.intensity / 60)) as [number, number, number],
          radius: Math.max(0.0005, (fluid.splatRadius / 100) * 0.018),
        });
      }

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
      gl.uniform1f(uniforms.vorticity.curl, fluid.curl);
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

      const pressureIterations = fluid.quality === 'high' ? 18 : 12;
      for (let i = 0; i < pressureIterations; i += 1) {
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

      gl.useProgram(programs.display);
      gl.uniform1i(uniforms.display.uTexture, bindTexture(dye.read.texture, 0));
      gl.uniform1f(uniforms.display.opacity, fluid.opacity / 100);
      gl.uniform1f(uniforms.display.boost, 0.9 + fluid.intensity / 80);
      blit(null);

      if (!document.hidden) animationId = requestAnimationFrame(draw);
    };

    const handleVisibility = () => {
      cancelAnimationFrame(animationId);
      if (!document.hidden) {
        lastTime = performance.now();
        animationId = requestAnimationFrame(draw);
      }
    };

    try {
      initFramebuffers();
      window.addEventListener('resize', initFramebuffers);
      if (fluid.pointerInteraction) {
        window.addEventListener('pointermove', handlePointerMove, { passive: true });
        window.addEventListener('pointerdown', handlePointerDown, { passive: true });
        window.addEventListener('pointerup', handlePointerLeave, { passive: true });
        window.addEventListener('pointercancel', handlePointerLeave, { passive: true });
      }
      document.addEventListener('visibilitychange', handleVisibility);
      animationId = requestAnimationFrame(draw);
    } catch {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', initFramebuffers);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerup', handlePointerLeave);
      window.removeEventListener('pointercancel', handlePointerLeave);
      document.removeEventListener('visibilitychange', handleVisibility);
      allocatedFbos.forEach(releaseFbo);
      Object.values(programs).forEach((program) => gl.deleteProgram(program));
      gl.deleteBuffer(quad);
      gl.deleteVertexArray(vao);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, [
    active,
    fluid.speed,
    fluid.intensity,
    fluid.opacity,
    fluid.splatRadius,
    fluid.curl,
    fluid.quality,
    fluid.pointerInteraction,
  ]);

  return <canvas ref={canvasRef} className="fluid-background" aria-hidden="true" />;
};

export default FluidBackground;
