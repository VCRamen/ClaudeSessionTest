// 武器の簡易 3D モデル（+Z 方向が銃口）

import * as THREE from 'three';
import type { WeaponId } from './Weapons';

const metalMaterial = new THREE.MeshStandardMaterial({ color: 0x2a2a30, metalness: 0.7, roughness: 0.4 });
const gripMaterial = new THREE.MeshStandardMaterial({ color: 0x3b2a1e, roughness: 0.8 });
const accentMaterial = new THREE.MeshStandardMaterial({ color: 0x777788, metalness: 0.8, roughness: 0.3 });
const rocketMaterial = new THREE.MeshStandardMaterial({ color: 0x4f5a2e, roughness: 0.7 });

function AddBox(
  group: THREE.Group,
  material: THREE.Material,
  width: number,
  height: number,
  depth: number,
  x: number,
  y: number,
  z: number,
): void {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  group.add(mesh);
}

function AddBarrel(group: THREE.Group, material: THREE.Material, radius: number, length: number, z: number, y = 0): void {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 10), material);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(0, y, z);
  mesh.castShadow = true;
  group.add(mesh);
}

/** 武器モデルを作る。子に "muzzle" という名前の Object3D を持つ */
export function BuildGunMesh(id: WeaponId): THREE.Group {
  const group = new THREE.Group();
  let muzzleZ = 0.3;
  switch (id) {
    case 'handgun':
      AddBox(group, metalMaterial, 0.05, 0.07, 0.22, 0, 0.02, 0.05);
      AddBox(group, gripMaterial, 0.045, 0.13, 0.06, 0, -0.07, -0.03);
      muzzleZ = 0.17;
      break;
    case 'smg':
      AddBox(group, metalMaterial, 0.06, 0.09, 0.34, 0, 0.02, 0.06);
      AddBox(group, gripMaterial, 0.05, 0.12, 0.06, 0, -0.07, -0.02);
      AddBox(group, accentMaterial, 0.04, 0.18, 0.05, 0, -0.1, 0.1);
      AddBarrel(group, metalMaterial, 0.018, 0.12, 0.28, 0.03);
      muzzleZ = 0.34;
      break;
    case 'shotgun':
      AddBox(group, gripMaterial, 0.07, 0.09, 0.3, 0, -0.01, -0.15);
      AddBox(group, metalMaterial, 0.07, 0.08, 0.3, 0, 0.01, 0.12);
      AddBarrel(group, metalMaterial, 0.025, 0.5, 0.45, 0.03);
      AddBox(group, gripMaterial, 0.06, 0.05, 0.2, 0, -0.04, 0.4);
      muzzleZ = 0.7;
      break;
    case 'rifle':
      AddBox(group, gripMaterial, 0.06, 0.1, 0.22, 0, -0.01, -0.2);
      AddBox(group, metalMaterial, 0.07, 0.1, 0.4, 0, 0.01, 0.08);
      AddBox(group, accentMaterial, 0.05, 0.16, 0.07, 0, -0.1, 0.08);
      AddBox(group, metalMaterial, 0.03, 0.04, 0.12, 0, 0.08, 0.05);
      AddBarrel(group, metalMaterial, 0.018, 0.3, 0.42, 0.02);
      muzzleZ = 0.58;
      break;
    case 'sniper':
      AddBox(group, gripMaterial, 0.06, 0.1, 0.3, 0, -0.01, -0.22);
      AddBox(group, metalMaterial, 0.07, 0.09, 0.4, 0, 0.01, 0.12);
      AddBarrel(group, accentMaterial, 0.035, 0.28, 0.1, 0.1);
      AddBarrel(group, metalMaterial, 0.018, 0.6, 0.6, 0.02);
      muzzleZ = 0.9;
      break;
    case 'rocket':
      AddBarrel(group, rocketMaterial, 0.08, 1.0, 0.15, 0.02);
      AddBox(group, gripMaterial, 0.05, 0.14, 0.06, 0, -0.1, 0.05);
      AddBox(group, metalMaterial, 0.05, 0.08, 0.1, 0.1, 0.06, 0.2);
      muzzleZ = 0.66;
      break;
  }
  const muzzle = new THREE.Object3D();
  muzzle.name = 'muzzle';
  muzzle.position.set(0, 0.03, muzzleZ);
  group.add(muzzle);
  return group;
}
