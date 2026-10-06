import {
  BufferAttribute, BufferGeometry, DirectionalLight, DoubleSide, Fog, FrontSide, HemisphereLight, InstancedBufferAttribute,
  InstancedMesh, LineBasicMaterial, LineSegments, Mesh, MeshLambertMaterial, PlaneGeometry, ShaderChunk, ShaderMaterial, Vector2,
  type IUniform, type Material, type Object3D, type WebGLProgramParametersWithUniforms,
} from 'three';
import { PALETTE_SIZE, extraSlot } from '../../../../lib/estate/palette';
import { MASK_OFF } from '../../../../lib/estate/storeys';
import type { EnginePalette } from './palette';

// Materials and lights from the design tokens (plan §7.3, decision C8). Every
// estate surface is MeshLambertMaterial({ flatShading }) extended by one shared
// onBeforeCompile: the colour is a lookup of the vertex's palette slot (_META.x)
// in the 32×1 token texture, and the switches are uniforms, not defines:
//   uStoreyMask  vec2   storeys [lo, hi] collapse (the façade mask, §7.5; P5
//                       drives it, MASK_OFF = (0, −1) hides nothing);
//   uBand        vec2   only storeys in [lo, hi] draw (interior furniture and
//                       residuals, P5; (0, 255) draws everything);
//   uPlanCut     float  the Plan cut height, world Y (P6; PLAN_CUT_OFF while
//                       off). Only the two-sided programs carry its discard
//                       and fill (#ifdef DOUBLE_SIDED): interior glass, and
//                       the planned building's interior while in Plan, which
//                       setPlanSides turns two-sided and transparent-sorted so
//                       it shares glass's programs. The front-face-only
//                       opaque programs every other draw uses carry no
//                       discard, so early depth testing is lost only there;
//   uMassingLines float 1 px lines at the storey floors, massing only.
// A vertex's storey is _META.z on a Mesh and _STOREY.x on an InstancedMesh
// (D and furniture carry it per instance; P5 gives T its own).
//
// Because the switches are uniforms and every material shares one
// onBeforeCompile (three keys programs by its source), the whole estate draws
// with six programs: Lambert {Mesh, InstancedMesh} × {opaque, glass}, the edge
// lines and the ground grid. Opaque draws front faces only; glass (interior,
// P5) is two-sided in one pass, alpha from the palette, no depth write, and so
// sorted after every opaque draw. Façade glass is an opaque slot.
//
// Plan's cut (P6, §7.3): above the cut every pixel of the planned building's
// interior is discarded, and where the cut opens a closed solid (a wall, a
// slab edge, a cabinet) the view looks into it and meets its back faces,
// which are filled flat with the palette's cut slot (--color-accent-900): the
// drawing's poché. Back faces only draw when the material is two-sided, and an
// opaque two-sided material would be a seventh and eighth program (three keys
// programs on side and on transparency), so in Plan the building's interior
// opaque materials become exactly glass's configuration bar depthWrite —
// two-sided, single pass, transparent-sorted, alpha 1 from the palette — and
// draw with glass's programs. Glass itself is never filled (its slot's alpha
// is below 1) and is drawn after them (renderOrder 1, scene.ts).

/** A huge cut height: nothing is above it, so Plan's cut is off. */
export const PLAN_CUT_OFF = 1e9;
/** uBand when every storey draws. Storey bytes are 0–255 (T's 255 is masked per instance, P5). */
export const BAND_ALL = Object.freeze({ lo: 0, hi: 255 });
/** uMassingLines holds at most this many storey floors. */
export const MASSING_LINES_MAX = 32;

/** The per-building uniforms its F, D, edge (and P5 interior) materials share. */
export interface StoreyUniforms {
  uStoreyMask: IUniform<Vector2>;
  uBand: IUniform<Vector2>;
  uPlanCut: IUniform<number>;
}

export const createStoreyUniforms = (): StoreyUniforms => ({
  uStoreyMask: { value: new Vector2(MASK_OFF.lo, MASK_OFF.hi) },
  uBand: { value: new Vector2(BAND_ALL.lo, BAND_ALL.hi) },
  uPlanCut: { value: PLAN_CUT_OFF },
});

interface EstateUniforms extends StoreyUniforms {
  uPalette: IUniform;
  uMassingLines: IUniform<number>;
  uFfl: IUniform<Float32Array>;
  uFflCount: IUniform<number>;
}

const EDGE_SLOT = extraSlot('edge').toFixed(1);
const CUT_SLOT = extraSlot('cut').toFixed(1);
const SLOTS = PALETTE_SIZE.toFixed(1);

const VERTEX_HEAD = /* glsl */ `#include <common>
attribute vec4 _meta;
#ifdef USE_INSTANCING
attribute vec4 _STOREY;
#endif
uniform vec2 uStoreyMask;
uniform vec2 uBand;
flat varying float vEstateSlot;
varying float vEstateY;`;

const VERTEX_BODY = /* glsl */ `#include <project_vertex>
vEstateSlot = _meta.x;
float estateStorey = _meta.z;
vec4 estateWorld = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
estateStorey = _STOREY.x;
estateWorld = instanceMatrix * estateWorld;
#endif
estateWorld = modelMatrix * estateWorld;
vEstateY = estateWorld.y;
if ( ( estateStorey >= uStoreyMask.x && estateStorey <= uStoreyMask.y ) || estateStorey < uBand.x || estateStorey > uBand.y ) {
  gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 );
}`;

const FRAGMENT_HEAD = /* glsl */ `#include <common>
uniform sampler2D uPalette;
uniform float uMassingLines;
uniform float uFfl[ ${MASSING_LINES_MAX} ];
uniform int uFflCount;
uniform float uPlanCut;
flat varying float vEstateSlot;
varying float vEstateY;
vec4 estatePalette( float slot ) {
  return texture2D( uPalette, vec2( ( slot + 0.5 ) / ${SLOTS}, 0.5 ) );
}`;

const FRAGMENT_COLOUR = /* glsl */ `vec4 estateColour = estatePalette( vEstateSlot );
vec4 diffuseColor = vec4( estateColour.rgb, opacity * estateColour.a );
float estateSlope = fwidth( vEstateY );
if ( uMassingLines > 0.5 && estateSlope > 1e-4 ) {
  float estateHalf = 0.75 * estateSlope;
  float estateHit = 0.0;
  for ( int i = 0; i < ${MASSING_LINES_MAX}; i ++ ) {
    if ( i >= uFflCount ) break;
    estateHit = max( estateHit, step( abs( vEstateY - uFfl[ i ] ), estateHalf ) );
  }
  diffuseColor.rgb = mix( diffuseColor.rgb, estatePalette( ${EDGE_SLOT} ).rgb, estateHit );
}
#ifdef DOUBLE_SIDED
if ( vEstateY > uPlanCut ) discard;
#endif`;

// After the lit colour is written: a back face of an opaque slot seen while the
// cut is on (uPlanCut below PLAN_CUT_OFF's 1e9) is the inside of a cut solid,
// filled flat (no light, so it reads as a section, not a surface).
const FRAGMENT_CUT_FILL = /* glsl */ `#include <opaque_fragment>
#ifdef DOUBLE_SIDED
if ( uPlanCut < 1e8 && ! gl_FrontFacing && estateColour.a > 0.99 ) gl_FragColor.rgb = estatePalette( ${CUT_SLOT} ).rgb;
#endif`;

const DIFFUSE_LINE = 'vec4 diffuseColor = vec4( diffuse, opacity );';

// three's flat-shading normal is normalize( cross( dFdx( p ), dFdy( p ) ) ) of the
// view position. Where one screen derivative comes out exactly zero (seen on
// SwiftShader, the WebGL a GPU-blocklisted or VM visitor gets: an axis-aligned
// wall at eye-level pitch and a heading on a multiple of 90°), that is
// normalize( 0 ), NaN, and the face draws black — 17 % of the frame at Blk 509's
// stair 5 on the release pack. A zero cross product falls back to a normal
// facing the eye. The chunk is inlined with that one line swapped because
// onBeforeCompile sees `#include <normal_fragment_begin>`, not its text;
// FLAT_NORMAL_GUARDED being absent from the result means three changed the line
// (pinned in tests/estate-engine-parts.test.ts).
const FLAT_NORMAL_LINE = 'vec3 normal = normalize( cross( fdx, fdy ) );';
export const FLAT_NORMAL_GUARDED = 'vec3 estateFlat = cross( fdx, fdy ); vec3 normal = dot( estateFlat, estateFlat ) > 0.0 ? normalize( estateFlat ) : vec3( 0.0, 0.0, 1.0 );';
const NORMAL_BEGIN = ShaderChunk.normal_fragment_begin.replace(FLAT_NORMAL_LINE, FLAT_NORMAL_GUARDED);

// One function object for every estate material: three's program cache key
// includes customProgramCacheKey(), which defaults to this function's source,
// so materials that differ only in uniform values share their programs.
function estateOnBeforeCompile(this: Material, shader: WebGLProgramParametersWithUniforms) {
  const uniforms = (this.userData as { estate?: EstateUniforms }).estate;
  if (!uniforms) return;
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', VERTEX_HEAD)
    .replace('#include <project_vertex>', VERTEX_BODY);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', FRAGMENT_HEAD)
    .replace(DIFFUSE_LINE, FRAGMENT_COLOUR)
    .replace('#include <normal_fragment_begin>', NORMAL_BEGIN)
    .replace('#include <opaque_fragment>', FRAGMENT_CUT_FILL);
}

// ---- the ground grid (§7.2: one quad, 10 m and 50 m lines) ------------------------------

const GRID_VERTEX = /* glsl */ `varying vec2 vGrid;
varying float vDepth;
void main() {
  vec4 world = modelMatrix * vec4( position, 1.0 );
  vGrid = world.xz;
  vec4 mv = viewMatrix * world;
  vDepth = - mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const GRID_FRAGMENT = /* glsl */ `uniform vec3 uBase;
uniform vec3 uMinor;
uniform vec3 uMajor;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
varying vec2 vGrid;
varying float vDepth;
float gridLine( vec2 p, float pitch ) {
  vec2 q = p / pitch;
  vec2 d = abs( fract( q - 0.5 ) - 0.5 ) / max( fwidth( q ), vec2( 1e-6 ) );
  return 1.0 - min( min( d.x, d.y ), 1.0 );
}
void main() {
  vec3 colour = mix( uBase, uMinor, gridLine( vGrid, 10.0 ) );
  colour = mix( colour, uMajor, gridLine( vGrid, 50.0 ) );
  float fogAmount = smoothstep( uFogNear, uFogFar, vDepth );
  gl_FragColor = vec4( mix( colour, uFogColor, fogAmount ), 1.0 );
  #include <colorspace_fragment>
}`;

/** The grid quad's size and where it sits: under the whole estate, a little below its lowest ground. */
export const GRID_SIZE_M = 4000;
export const GRID_Y = -0.5;

// ---- lights (§7.3) --------------------------------------------------------------------------

// three r155+ lights are physical: a Lambert face lit with irradiance E shows
// albedo · E / π. The two lights are scaled so an up-facing face reads at about
// its token's own value and walls fall off by orientation, never past the
// token's ramp neighbours.
export const HEMI_INTENSITY = 0.62 * Math.PI;
export const SUN_INTENSITY = 0.48 * Math.PI;
/** The directional light comes from here (three world, normalised at use). */
export const SUN_DIRECTION = Object.freeze([-0.4, 0.8, 0.45] as const);

export interface MaterialKit {
  palette: EnginePalette;
  /** Opaque Lambert for one building or the site. `ffl` turns on the massing storey lines. */
  opaque(storey: StoreyUniforms, ffl?: readonly number[]): MeshLambertMaterial;
  /** Interior glass (P5): two-sided in one pass, alpha from the palette, no depth write. */
  glass(storey: StoreyUniforms): MeshLambertMaterial;
  edge(storey: StoreyUniforms): LineBasicMaterial;
  grid: ShaderMaterial;
  gridMesh: Mesh;
  hemisphere: HemisphereLight;
  sun: DirectionalLight;
  fog: Fog;
  /** One object per program (§7.3 warm-up), with geometry carrying the attributes the shaders read. */
  warmup: Object3D[];
  /** Sets the fog range (§7.3) on the scene fog and the grid together. */
  setFog(near: number, far: number): void;
  dispose(): void;
}

const estateUniforms = (palette: EnginePalette, storey: StoreyUniforms, ffl?: readonly number[]): EstateUniforms => {
  const table = new Float32Array(MASSING_LINES_MAX);
  const count = ffl ? Math.min(ffl.length, MASSING_LINES_MAX) : 0;
  for (let i = 0; i < count; i += 1) table[i] = (ffl as readonly number[])[i];
  return {
    ...storey,
    uPalette: { value: palette.texture },
    uMassingLines: { value: count > 0 ? 1 : 0 },
    uFfl: { value: table },
    uFflCount: { value: count },
  };
};

const tag = <M extends Material>(material: M, uniforms: EstateUniforms): M => {
  material.userData.estate = uniforms;
  material.onBeforeCompile = estateOnBeforeCompile;
  return material;
};

// A one-triangle geometry with every attribute the estate shaders read.
const warmupGeometry = (instanced: boolean): BufferGeometry => {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));
  geometry.setAttribute('_meta', new BufferAttribute(new Uint8Array(12), 4));
  if (instanced) geometry.setAttribute('_STOREY', new InstancedBufferAttribute(new Uint8Array(4), 4));
  return geometry;
};

export const createMaterialKit = (palette: EnginePalette): MaterialKit => {
  const created: Material[] = [];
  const geometries: BufferGeometry[] = [];
  const keep = <M extends Material>(m: M): M => { created.push(m); return m; };

  const opaque = (storey: StoreyUniforms, ffl?: readonly number[]) => keep(tag(new MeshLambertMaterial({
    flatShading: true,
    fog: true,
    side: FrontSide,
  }), estateUniforms(palette, storey, ffl)));

  const glass = (storey: StoreyUniforms) => keep(tag(new MeshLambertMaterial({
    flatShading: true,
    fog: true,
    side: DoubleSide,
    forceSinglePass: true,
    transparent: true,
    depthWrite: false,
  }), estateUniforms(palette, storey)));

  const edge = (storey: StoreyUniforms) => keep(tag(new LineBasicMaterial({ fog: true }), estateUniforms(palette, storey)));

  const s = palette.scene;
  const fog = new Fog(s.fog.clone(), 150, 800);
  const grid = keep(new ShaderMaterial({
    vertexShader: GRID_VERTEX,
    fragmentShader: GRID_FRAGMENT,
    uniforms: {
      uBase: { value: s.background.clone() },
      uMinor: { value: s.gridMinor.clone() },
      uMajor: { value: s.gridMajor.clone() },
      uFogColor: { value: s.fog.clone() },
      uFogNear: { value: fog.near },
      uFogFar: { value: fog.far },
    },
    polygonOffset: true,
    polygonOffsetFactor: 2,
    polygonOffsetUnits: 4,
  }));
  const gridGeometry = new PlaneGeometry(GRID_SIZE_M, GRID_SIZE_M, 1, 1);
  gridGeometry.rotateX(-Math.PI / 2);
  geometries.push(gridGeometry);
  const gridMesh = new Mesh(gridGeometry, grid);
  gridMesh.name = 'groundGrid';
  gridMesh.frustumCulled = false;
  gridMesh.renderOrder = -1;
  gridMesh.position.set(200, GRID_Y, -200);
  gridMesh.updateMatrix();
  gridMesh.matrixAutoUpdate = false;

  const hemisphere = new HemisphereLight(s.skyLight.clone(), s.groundLight.clone(), HEMI_INTENSITY);
  const sun = new DirectionalLight(s.skyLight.clone(), SUN_INTENSITY);
  sun.position.set(SUN_DIRECTION[0], SUN_DIRECTION[1], SUN_DIRECTION[2]).normalize().multiplyScalar(1000);
  for (const light of [hemisphere, sun]) {
    light.updateMatrix();
    light.matrixAutoUpdate = false;
  }

  // Warm-up: one object per program. Their materials stay alive with the kit,
  // so the programs they compile are never released before the scene uses them.
  const dummyStorey = createStoreyUniforms();
  const meshGeometry = warmupGeometry(false);
  const instancedGeometry = warmupGeometry(true);
  geometries.push(meshGeometry, instancedGeometry);
  const instanced = (material: Material) => {
    const mesh = new InstancedMesh(instancedGeometry, material, 1);
    mesh.frustumCulled = false;
    return mesh;
  };
  const plain = (material: Material) => {
    const mesh = new Mesh(meshGeometry, material);
    mesh.frustumCulled = false;
    return mesh;
  };
  const lines = new LineSegments(meshGeometry, edge(dummyStorey));
  lines.frustumCulled = false;
  const warmupGrid = new Mesh(gridGeometry, grid);
  warmupGrid.frustumCulled = false;
  const warmup: Object3D[] = [
    plain(opaque(dummyStorey)),
    instanced(opaque(dummyStorey)),
    plain(glass(dummyStorey)),
    instanced(glass(dummyStorey)),
    lines,
    warmupGrid,
  ];
  for (const object of warmup) object.updateMatrixWorld(true);

  return {
    palette,
    opaque,
    glass,
    edge,
    grid,
    gridMesh,
    hemisphere,
    sun,
    fog,
    warmup,
    setFog(near: number, far: number) {
      fog.near = near;
      fog.far = far;
      grid.uniforms.uFogNear.value = near;
      grid.uniforms.uFogFar.value = far;
    },
    dispose() {
      for (const material of created) material.dispose();
      for (const geometry of geometries) geometry.dispose();
      palette.texture.dispose();
    },
  };
};

/**
 * The massing storey lines on or off (they only read while storeys are several
 * pixels apart; farther out 1 px lines merge into a dark box). A material made
 * without storey floors stays off. Returns whether it changed.
 */
export const setMassingLines = (material: Material, on: boolean): boolean => {
  const uniforms = (material.userData as { estate?: EstateUniforms }).estate;
  if (!uniforms) return false;
  const value = on && uniforms.uFflCount.value > 0 ? 1 : 0;
  if (uniforms.uMassingLines.value === value) return false;
  uniforms.uMassingLines.value = value;
  return true;
};

/**
 * Plan's sides (P6, header): `on` makes an opaque estate material two-sided,
 * single-pass and transparent-sorted (alpha stays 1, depth still written), so
 * it draws with glass's program and its back faces show the cut; off puts it
 * back. Returns whether it changed (three re-resolves the program once, from
 * its cache: nothing compiles).
 */
export const setPlanSides = (material: Material, on: boolean): boolean => {
  if ((material.side === DoubleSide) === on) return false;
  material.side = on ? DoubleSide : FrontSide;
  material.transparent = on;
  material.forceSinglePass = on;
  material.needsUpdate = true;
  return true;
};

/** Sets a uniforms object's Plan cut (world Y); PLAN_CUT_OFF turns it off. */
export const setPlanCut = (uniforms: StoreyUniforms, y: number): boolean => {
  if (uniforms.uPlanCut.value === y) return false;
  uniforms.uPlanCut.value = y;
  return true;
};

/** Sets a building's façade mask (P5): storeys lo…hi hidden; MASK_OFF hides none. */
export const setStoreyMask = (uniforms: StoreyUniforms, lo: number, hi: number): boolean => {
  const v = uniforms.uStoreyMask.value;
  if (v.x === lo && v.y === hi) return false;
  v.set(lo, hi);
  return true;
};
