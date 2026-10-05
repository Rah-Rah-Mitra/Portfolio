import {
  DirectionalLight, HemisphereLight, InstancedMesh, LineSegments, Mesh, Scene,
  type Camera, type Fog, type WebGLRenderer,
} from 'three';
import type { DrawObject } from './parts';

// Exactly one geometry reaches the GPU per frame (plan §7.6), at the moment the
// scheduler's ticket names it, not whenever three first happens to draw it.
// three has no public "upload this geometry" call: buffers are created in
// render()'s projection pass for every visible object. So the uploader renders
// a stand-in that shares the part's geometry, material and instance buffer,
// alone in a scene of its own, with the scissor box shut: the buffers (and, the
// first time, the program) are made, and no pixel is touched.
//
// The upload scene has a hemisphere light, a directional light and the main
// fog, like the main scene, so the stand-in asks three for the very program the
// real object will use, never a second one.

export class GeometryUploader {
  private readonly scene = new Scene();
  private readonly renderer: WebGLRenderer;
  private readonly mesh = new Mesh();
  private readonly instanced: InstancedMesh;
  private readonly lines = new LineSegments();

  constructor(renderer: WebGLRenderer, fog: Fog) {
    this.renderer = renderer;
    const scene = this.scene;
    scene.matrixWorldAutoUpdate = false;
    scene.matrixAutoUpdate = false;
    scene.fog = fog;
    const hemisphere = new HemisphereLight();
    const sun = new DirectionalLight();
    scene.add(hemisphere, sun);
    hemisphere.updateMatrixWorld();
    sun.updateMatrixWorld();
    this.instanced = new InstancedMesh(undefined, undefined, 0);
    for (const proxy of [this.mesh, this.instanced, this.lines]) {
      proxy.frustumCulled = false;
      proxy.matrixAutoUpdate = false;
      proxy.visible = false;
      scene.add(proxy);
    }
  }

  private standIn(object: DrawObject): Mesh | InstancedMesh | LineSegments {
    if ((object as InstancedMesh).isInstancedMesh) {
      const real = object as InstancedMesh;
      const proxy = this.instanced;
      proxy.geometry = real.geometry;
      proxy.material = real.material;
      proxy.instanceMatrix = real.instanceMatrix;
      proxy.instanceColor = real.instanceColor;
      proxy.count = real.count;
      return proxy;
    }
    if ((object as LineSegments).isLineSegments) {
      this.lines.geometry = object.geometry;
      this.lines.material = (object as LineSegments).material;
      return this.lines;
    }
    this.mesh.geometry = object.geometry;
    this.mesh.material = (object as Mesh).material;
    return this.mesh;
  }

  /** Make `object`'s buffers on the GPU now. Draws nothing visible. */
  upload(object: DrawObject, camera: Camera): void {
    const renderer = this.renderer;
    const proxy = this.standIn(object);
    proxy.matrixWorld.copy(object.matrixWorld);
    proxy.visible = true;
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setScissorTest(true);
    renderer.setScissor(0, 0, 0, 0);
    try {
      renderer.render(this.scene, camera);
    } finally {
      renderer.setScissorTest(false);
      renderer.autoClear = autoClear;
      proxy.visible = false;
    }
  }

  dispose(): void {
    this.scene.clear();
  }
}
