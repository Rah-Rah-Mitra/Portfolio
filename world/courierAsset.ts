import * as THREE from 'three';

export interface CourierAsset {
  root: THREE.Object3D;
  setPose: (poseId: string) => void;
  dispose: () => void;
}

export const createNeutralCourierPlaceholder = (): CourierAsset => {
  const root = new THREE.Group();
  root.name = 'optical-courier-replaceable-placeholder';
  const graphite = new THREE.MeshStandardMaterial({ color: 0x1d2725, roughness: 0.72 });
  const shell = new THREE.MeshStandardMaterial({ color: 0xe9eeec, roughness: 0.84 });
  const teal = new THREE.MeshStandardMaterial({ color: 0x0b7169, emissive: 0x032c29, roughness: 0.42 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.75, 5, 12), shell); torso.position.y = 1.45;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.29, 20, 14), graphite); head.position.y = 2.2;
  const signal = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.26, 0.31), teal); signal.position.set(0, 2.2, 0.28);
  const limbGeometry = new THREE.CapsuleGeometry(0.09, 0.68, 4, 8);
  [-0.43, 0.43].forEach((x) => { const arm = new THREE.Mesh(limbGeometry, graphite); arm.position.set(x, 1.45, 0); root.add(arm); });
  [-0.19, 0.19].forEach((x) => { const leg = new THREE.Mesh(limbGeometry, graphite); leg.position.set(x, 0.55, 0); root.add(leg); });
  root.add(torso, head, signal); root.scale.setScalar(0.72);
  return {
    root,
    setPose: (poseId) => { root.userData.poseId = poseId; root.rotation.y = poseId.includes('reverse') ? -0.38 : 0.38; },
    dispose: () => root.traverse((object) => { if (!(object instanceof THREE.Mesh)) return; object.geometry.dispose(); (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => material.dispose()); }),
  };
};
