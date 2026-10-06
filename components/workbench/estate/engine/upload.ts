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
//
// An instanced part gets a stand-in of its own, kept for the part's life:
// three frees an instance buffer only when the object it RENDERED is disposed
// (WebGLObjects listens for 'dispose' on that object), so a part uploaded here
// and evicted before the main scene ever drew it (a prefetched interior's T and
// furniture, a detail level never reached) left its buffer on the GPU while the
// scheduler counted it freed, behind one shared stand-in. release() disposes
// the part's own stand-in, which frees exactly that part's buffers.

export class GeometryUploader {
  private readonly scene = new Scene();
  private readonly renderer: WebGLRenderer;
  private readonly mesh = new Mesh();
  private readonly instanced = new WeakMap<InstancedMesh, InstancedMesh>();
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
    for (const proxy of [this.mesh, this.lines]) this.addProxy(proxy);
  }

  private addProxy(proxy: Mesh | InstancedMesh | LineSegments) {
    proxy.frustumCulled = false;
    proxy.matrixAutoUpdate = false;
    proxy.visible = false;
    this.scene.add(proxy);
  }

  private standIn(object: DrawObject): Mesh | InstancedMesh | LineSegments {
    if ((object as InstancedMesh).isInstancedMesh) {
      const real = object as InstancedMesh;
      let proxy = this.instanced.get(real);
      if (!proxy) {
        proxy = new InstancedMesh(undefined, undefined, 0);
        this.addProxy(proxy);
        this.instanced.set(real, proxy);
      }
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

  /**
   * An evicted part: an instanced one's instance buffers leave the GPU even if
   * only its stand-in drew it (the main scene's draw, if any, is freed by the
   * part's own dispose). Removing a buffer twice is harmless in three.
   */
  release(object: DrawObject): void {
    if (!(object as InstancedMesh).isInstancedMesh) return;
    const real = object as InstancedMesh;
    const proxy = this.instanced.get(real);
    if (!proxy) return;
    proxy.instanceMatrix = real.instanceMatrix;
    proxy.instanceColor = real.instanceColor;
    proxy.dispose();
  }

  dispose(): void {
    this.scene.clear();
  }
}
