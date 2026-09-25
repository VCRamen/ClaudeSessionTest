// 武器の簡易 3D モデル（+Z 方向が銃口）

import * as THREE from 'three';
import { WEAPON_DEFS } from './Weapons';
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

const accentMaterials = new Map<number, THREE.MeshStandardMaterial>();

/** 機種ごとのアクセント色 */
function GetAccentMaterial(color: number): THREE.MeshStandardMaterial {
  let material = accentMaterials.get(color);
  if (!material) {
    material = new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.35 });
    accentMaterials.set(color, material);
  }
  return material;
}

/** 武器モデルを作る。子に "muzzle" という名前の Object3D を持つ */
export function BuildGunMesh(id: WeaponId): THREE.Group {
  const group = new THREE.Group();
  const accent = GetAccentMaterial(WEAPON_DEFS[id].color);
  let muzzleZ = 0.3;
  switch (id) {
    // ---- ハンドガン ----
    case 'handgun':
      AddBox(group, metalMaterial, 0.05, 0.07, 0.22, 0, 0.02, 0.05);
      AddBox(group, gripMaterial, 0.045, 0.13, 0.06, 0, -0.07, -0.03);
      muzzleZ = 0.17;
      break;
    case 'magnum':
      // リボルバー：シリンダーと長い銃身
      AddBarrel(group, accent, 0.045, 0.1, 0.02, 0.01);
      AddBarrel(group, metalMaterial, 0.022, 0.26, 0.19, 0.035);
      AddBox(group, metalMaterial, 0.04, 0.05, 0.16, 0, 0.05, 0.04);
      AddBox(group, gripMaterial, 0.045, 0.14, 0.06, 0, -0.07, -0.06);
      muzzleZ = 0.32;
      break;
    case 'machinePistol':
      AddBox(group, metalMaterial, 0.05, 0.08, 0.2, 0, 0.02, 0.05);
      AddBox(group, gripMaterial, 0.045, 0.13, 0.06, 0, -0.07, -0.02);
      AddBox(group, accent, 0.035, 0.2, 0.04, 0, -0.16, -0.02);
      AddBox(group, accent, 0.03, 0.03, 0.08, 0, 0.07, 0.1);
      muzzleZ = 0.16;
      break;
    // ---- SMG ----
    case 'smg':
    case 'rapidSmg':
    case 'heavySmg': {
      const isHeavy = id === 'heavySmg';
      AddBox(group, metalMaterial, isHeavy ? 0.075 : 0.06, isHeavy ? 0.11 : 0.09, 0.34, 0, 0.02, 0.06);
      AddBox(group, gripMaterial, 0.05, 0.12, 0.06, 0, -0.07, -0.02);
      AddBox(group, id === 'smg' ? accentMaterial : accent, 0.04, id === 'rapidSmg' ? 0.26 : 0.18, 0.05, 0, -0.1, 0.1);
      AddBarrel(group, metalMaterial, isHeavy ? 0.028 : 0.018, isHeavy ? 0.18 : 0.12, 0.28, 0.03);
      if (id === 'rapidSmg') AddBox(group, accent, 0.02, 0.03, 0.2, 0, 0.08, 0.05);
      muzzleZ = isHeavy ? 0.37 : 0.34;
      break;
    }
    // ---- ショットガン ----
    case 'shotgun':
      AddBox(group, gripMaterial, 0.07, 0.09, 0.3, 0, -0.01, -0.15);
      AddBox(group, metalMaterial, 0.07, 0.08, 0.3, 0, 0.01, 0.12);
      AddBarrel(group, metalMaterial, 0.025, 0.5, 0.45, 0.03);
      AddBox(group, gripMaterial, 0.06, 0.05, 0.2, 0, -0.04, 0.4);
      muzzleZ = 0.7;
      break;
    case 'doubleBarrel':
      AddBox(group, accent, 0.07, 0.1, 0.34, 0, -0.02, -0.16);
      for (const x of [-0.022, 0.022]) {
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.55, 10), metalMaterial);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(x, 0.03, 0.3);
        barrel.castShadow = true;
        group.add(barrel);
      }
      AddBox(group, accent, 0.07, 0.04, 0.22, 0, -0.01, 0.28);
      muzzleZ = 0.58;
      break;
    case 'autoShotgun':
      AddBox(group, gripMaterial, 0.07, 0.09, 0.24, 0, -0.01, -0.16);
      AddBox(group, metalMaterial, 0.08, 0.1, 0.36, 0, 0.01, 0.12);
      AddBox(group, accent, 0.06, 0.18, 0.12, 0, -0.1, 0.12);
      AddBarrel(group, metalMaterial, 0.03, 0.4, 0.46, 0.03);
      muzzleZ = 0.66;
      break;
    // ---- ライフル ----
    case 'rifle':
    case 'battleRifle':
    case 'burstRifle': {
      AddBox(group, gripMaterial, 0.06, 0.1, 0.22, 0, -0.01, -0.2);
      AddBox(group, metalMaterial, 0.07, 0.1, 0.4, 0, 0.01, 0.08);
      AddBox(group, id === 'rifle' ? accentMaterial : accent, 0.05, id === 'battleRifle' ? 0.12 : 0.16, 0.07, 0, -0.1, 0.08);
      AddBox(group, metalMaterial, 0.03, 0.04, 0.12, 0, 0.08, 0.05);
      AddBarrel(group, metalMaterial, id === 'battleRifle' ? 0.024 : 0.018, 0.34, 0.44, 0.02);
      if (id === 'burstRifle') AddBarrel(group, accent, 0.028, 0.14, 0.05, 0.1);
      muzzleZ = 0.62;
      break;
    }
    // ---- スナイパー ----
    case 'sniper':
    case 'dmr':
      AddBox(group, gripMaterial, 0.06, 0.1, 0.3, 0, -0.01, -0.22);
      AddBox(group, metalMaterial, 0.07, 0.09, 0.4, 0, 0.01, 0.12);
      AddBarrel(group, id === 'dmr' ? accent : accentMaterial, 0.035, id === 'dmr' ? 0.2 : 0.28, 0.1, 0.1);
      AddBarrel(group, metalMaterial, 0.018, id === 'dmr' ? 0.45 : 0.6, id === 'dmr' ? 0.52 : 0.6, 0.02);
      if (id === 'dmr') AddBox(group, accent, 0.04, 0.14, 0.06, 0, -0.1, 0.1);
      muzzleZ = id === 'dmr' ? 0.76 : 0.9;
      break;
    case 'antiMateriel':
      AddBox(group, accent, 0.08, 0.12, 0.36, 0, -0.01, -0.24);
      AddBox(group, metalMaterial, 0.09, 0.11, 0.46, 0, 0.01, 0.14);
      AddBarrel(group, accentMaterial, 0.045, 0.32, 0.12, 0.12);
      AddBarrel(group, metalMaterial, 0.03, 0.8, 0.76, 0.02);
      AddBox(group, metalMaterial, 0.1, 0.06, 0.08, 0, 0.02, 1.16);
      muzzleZ = 1.2;
      break;
    // ---- ランチャー ----
    case 'rocket':
      AddBarrel(group, rocketMaterial, 0.08, 1.0, 0.15, 0.02);
      AddBox(group, gripMaterial, 0.05, 0.14, 0.06, 0, -0.1, 0.05);
      AddBox(group, metalMaterial, 0.05, 0.08, 0.1, 0.1, 0.06, 0.2);
      muzzleZ = 0.66;
      break;
    case 'grenadeLauncher':
      AddBox(group, gripMaterial, 0.06, 0.1, 0.2, 0, -0.01, -0.18);
      AddBarrel(group, accent, 0.075, 0.2, 0.05, 0.02);
      AddBarrel(group, metalMaterial, 0.045, 0.34, 0.3, 0.03);
      AddBox(group, gripMaterial, 0.05, 0.13, 0.06, 0, -0.1, 0.0);
      muzzleZ = 0.48;
      break;
  }
  const muzzle = new THREE.Object3D();
  muzzle.name = 'muzzle';
  muzzle.position.set(0, 0.03, muzzleZ);
  group.add(muzzle);
  return group;
}
