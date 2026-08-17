import * as THREE from 'three';

export interface CourierAsset {
  root: THREE.Object3D;
  setPose: (poseId: string) => void;
  dispose: () => void;
}

export const createNeutralCourierPlaceholder = (): CourierAsset => {
  const root = new THREE.Group();
  root.name = 'optical-courier-replaceable-placeholder';
  const rig = new THREE.Group(); rig.name = 'courier-rig'; root.add(rig);
  const graphite = new THREE.MeshStandardMaterial({ color: 0x1d2725, roughness: 0.72 });
  const shell = new THREE.MeshStandardMaterial({ color: 0xe9eeec, roughness: 0.84 });
  const teal = new THREE.MeshStandardMaterial({ color: 0x0b7169, emissive: 0x032c29, roughness: 0.42 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.75, 5, 12), shell); torso.name = 'courier-torso'; torso.position.y = 1.45;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.29, 20, 14), graphite); head.name = 'courier-head'; head.position.y = 2.2;
  const signal = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.26, 0.31), teal); signal.position.set(0, 2.2, 0.28);
  const limbGeometry = new THREE.CapsuleGeometry(0.09, 0.68, 4, 8);
  const arms = [-0.43, 0.43].map((x, index) => { const arm = new THREE.Mesh(limbGeometry, graphite); arm.name = index === 0 ? 'courier-left-arm' : 'courier-right-arm'; arm.position.set(x, 1.45, 0); rig.add(arm); return arm; });
  [-0.19, 0.19].forEach((x, index) => { const leg = new THREE.Mesh(limbGeometry, graphite); leg.name = index === 0 ? 'courier-left-leg' : 'courier-right-leg'; leg.position.set(x, 0.55, 0); rig.add(leg); });
  rig.add(torso, head, signal); root.scale.setScalar(0.72);
  const neutral = {
    rigPosition: rig.position.clone(), rigRotation: rig.rotation.clone(),
    headPosition: head.position.clone(), headRotation: head.rotation.clone(),
    armPositions: arms.map((arm) => arm.position.clone()), armRotations: arms.map((arm) => arm.rotation.clone()),
  };
  const resetPose = () => {
    rig.position.copy(neutral.rigPosition); rig.rotation.copy(neutral.rigRotation);
    head.position.copy(neutral.headPosition); head.rotation.copy(neutral.headRotation);
    arms.forEach((arm, index) => { arm.position.copy(neutral.armPositions[index]); arm.rotation.copy(neutral.armRotations[index]); });
  };
  return {
    root,
    setPose: (poseId) => {
      resetPose(); root.userData.poseId = poseId;
      const pose = poseId.toLowerCase();
      if (pose.includes('stepaside') || pose.includes('step-aside')) { rig.position.x = .28; rig.rotation.y = -.18; }
      else if (pose.includes('point')) { arms[1].rotation.z = -1.12; arms[1].rotation.x = .2; }
      else if (pose.includes('success') || pose.includes('acknowledge')) { arms[0].rotation.z = .92; arms[1].rotation.z = -.92; rig.position.y = .05; }
      else if (pose.includes('puzzled')) { head.rotation.z = -.22; arms[0].rotation.z = .42; }
      else if (pose.includes('inspect')) { head.rotation.x = .28; head.rotation.y = -.24; rig.position.z = .08; }
      else if (pose.includes('look')) { head.rotation.y = .38; }
      else if (pose.includes('reverse')) { rig.rotation.y = -.38; }
      else if (pose.includes('forward') || pose.includes('traverse') || pose.includes('arrival')) { rig.rotation.y = .38; }
    },
    dispose: () => root.traverse((object) => { if (!(object instanceof THREE.Mesh)) return; object.geometry.dispose(); (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => material.dispose()); }),
  };
};
