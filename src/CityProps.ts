// 商店街の建物や小物のモデル（すべて +Z が正面、原点は地面の中心）

import * as THREE from 'three';
import {
  CreateAwningTexture, CreateBarricadeTexture, CreateChalkboardTexture, CreateShopWindowTexture,
  CreateUpperWindowTexture, CreateVendingMachineTexture, CreateVerticalSignTexture,
} from './CityTextures';

export interface ShopStyle {
  wallColor: number;
  signText: string;
  signBackground: string;
  signForeground: string;
  awningText: string;
  awningColor: string;
  windowVariant: number;
  hasLanterns: boolean;
  hasPumpkin: boolean;
}

export const SHOP_STYLES: ShopStyle[] = [
  { wallColor: 0x8a6a52, signText: 'やきとり', signBackground: '#c8362c', signForeground: '#fff4e0', awningText: '炭火焼', awningColor: '#7a2a22', windowVariant: 0, hasLanterns: true, hasPumpkin: true },
  { wallColor: 0x6f7a6a, signText: '八百屋', signBackground: '#2f7a4a', signForeground: '#fff8e8', awningText: 'やおや', awningColor: '#2d6b3e', windowVariant: 1, hasLanterns: false, hasPumpkin: true },
  { wallColor: 0x9a7b5c, signText: 'コーヒー', signBackground: '#3b2a20', signForeground: '#f3e2c4', awningText: '喫茶 月', awningColor: '#5a3a28', windowVariant: 0, hasLanterns: false, hasPumpkin: false },
  { wallColor: 0x7d5d4a, signText: 'たまや', signBackground: '#b8322a', signForeground: '#ffffff', awningText: 'たまや', awningColor: '#a8302a', windowVariant: 1, hasLanterns: true, hasPumpkin: true },
  { wallColor: 0x6a6070, signText: 'らーめん', signBackground: '#f2c400', signForeground: '#3a1a0a', awningText: '中華そば', awningColor: '#c23a1a', windowVariant: 0, hasLanterns: true, hasPumpkin: false },
  { wallColor: 0x8c8278, signText: '本', signBackground: '#1f3f6f', signForeground: '#ffffff', awningText: '古書店', awningColor: '#2a4a7a', windowVariant: 1, hasLanterns: false, hasPumpkin: true },
  { wallColor: 0x7a6650, signText: '駄菓子', signBackground: '#e87a2a', signForeground: '#ffffff', awningText: 'だがしや', awningColor: '#d8641e', windowVariant: 0, hasLanterns: false, hasPumpkin: true },
  { wallColor: 0x5f6a78, signText: '花', signBackground: '#d6508a', signForeground: '#ffffff', awningText: 'フラワー', awningColor: '#b8406e', windowVariant: 1, hasLanterns: false, hasPumpkin: false },
  { wallColor: 0x84705c, signText: '酒', signBackground: '#2a2a2a', signForeground: '#f2d27a', awningText: '酒屋', awningColor: '#3a3a3a', windowVariant: 0, hasLanterns: true, hasPumpkin: true },
  { wallColor: 0x6e5a4e, signText: 'たばこ', signBackground: '#c8362c', signForeground: '#ffffff', awningText: 'タバコ', awningColor: '#8a2a22', windowVariant: 1, hasLanterns: false, hasPumpkin: false },
];

const materialCache = new Map<string, THREE.Material>();

function GetStandardMaterial(color: number, roughness = 0.85, metalness = 0): THREE.MeshStandardMaterial {
  const key = `std-${color}-${roughness}-${metalness}`;
  let material = materialCache.get(key) as THREE.MeshStandardMaterial | undefined;
  if (!material) {
    material = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    materialCache.set(key, material);
  }
  return material;
}

function GetGlowMaterial(color: number): THREE.MeshBasicMaterial {
  const key = `glow-${color}`;
  let material = materialCache.get(key) as THREE.MeshBasicMaterial | undefined;
  if (!material) {
    material = new THREE.MeshBasicMaterial({ color });
    materialCache.set(key, material);
  }
  return material;
}

function GetTextureMaterial(texture: THREE.Texture, isGlowing: boolean): THREE.Material {
  const key = `tex-${texture.uuid}-${isGlowing}`;
  let material = materialCache.get(key);
  if (!material) {
    material = isGlowing
      ? new THREE.MeshBasicMaterial({ map: texture })
      : new THREE.MeshStandardMaterial({ map: texture, roughness: 0.8 });
    materialCache.set(key, material);
  }
  return material;
}

function AddBox(
  parent: THREE.Object3D,
  material: THREE.Material,
  width: number,
  height: number,
  depth: number,
  x: number,
  y: number,
  z: number,
  castShadow = true,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function AddPlane(parent: THREE.Object3D, material: THREE.Material, width: number, height: number, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

/** 提灯 */
export function BuildPaperLantern(): THREE.Group {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), GetGlowMaterial(0xff5a3a));
  body.scale.set(1, 1.35, 1);
  group.add(body);
  const capMaterial = GetStandardMaterial(0x1a1a1a);
  AddBox(group, capMaterial, 0.2, 0.06, 0.2, 0, 0.3, 0, false);
  AddBox(group, capMaterial, 0.2, 0.06, 0.2, 0, -0.3, 0, false);
  return group;
}

/** 光るジャック・オー・ランタン */
export function BuildJackOLantern(scale = 1): THREE.Group {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), GetStandardMaterial(0xff7a18, 0.6));
  body.scale.set(1, 0.8, 1);
  body.position.y = 0.22;
  body.castShadow = true;
  group.add(body);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.12, 6), GetStandardMaterial(0x3d6b21));
  stem.position.y = 0.46;
  group.add(stem);
  const glow = GetGlowMaterial(0xffd35a);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.CircleGeometry(0.06, 3), glow);
    eye.rotation.z = Math.PI / 2;
    eye.position.set(side * 0.1, 0.27, 0.275);
    group.add(eye);
  }
  const mouth = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.05), glow);
  mouth.position.set(0, 0.15, 0.265);
  group.add(mouth);
  group.scale.setScalar(scale);
  return group;
}

/** 商店（正面が +Z。奥行き方向は -Z） */
export function BuildShop(width: number, height: number, depth: number, style: ShopStyle): THREE.Group {
  const group = new THREE.Group();
  const wallMaterial = GetStandardMaterial(style.wallColor, 0.9);
  AddBox(group, wallMaterial, width, height, depth, 0, height / 2, -depth / 2);

  // 1 階の店先
  const frontMaterial = GetStandardMaterial(0x3a2a20, 0.8);
  AddBox(group, frontMaterial, width - 0.2, 2.9, 0.12, 0, 1.45, 0.05, false);
  const shopWindow = AddPlane(group, GetTextureMaterial(CreateShopWindowTexture(style.windowVariant), true), width - 0.8, 2.3, 0, 1.35, 0.12);
  shopWindow.receiveShadow = false;

  // 日よけ
  const awningMaterial = GetTextureMaterial(CreateAwningTexture(style.awningText, style.awningColor), false);
  const awning = new THREE.Mesh(new THREE.BoxGeometry(width - 0.1, 0.08, 1.5), [
    GetStandardMaterial(0x2a1a14), GetStandardMaterial(0x2a1a14), awningMaterial,
    GetStandardMaterial(0x2a1a14), awningMaterial, GetStandardMaterial(0x2a1a14),
  ]);
  awning.position.set(0, 3.15, 0.72);
  awning.rotation.x = 0.28;
  awning.castShadow = true;
  group.add(awning);
  const valance = AddPlane(group, awningMaterial, width - 0.1, 0.45, 0, 2.83, 1.45);
  valance.receiveShadow = false;

  // 2 階以上の窓
  const floors = Math.max(1, Math.floor((height - 3.6) / 2.6));
  const windowsPerFloor = Math.max(1, Math.floor(width / 2.2));
  for (let floor = 0; floor < floors; floor++) {
    for (let i = 0; i < windowsPerFloor; i++) {
      const x = (i - (windowsPerFloor - 1) / 2) * (width / windowsPerFloor);
      const isLit = (floor + i + style.windowVariant) % 3 !== 0;
      AddPlane(group, GetTextureMaterial(CreateUpperWindowTexture(isLit), true), 1.1, 1.2, x, 4.6 + floor * 2.6, 0.02);
    }
  }

  // 屋根のふち
  AddBox(group, GetStandardMaterial(0x2a2430), width + 0.3, 0.3, depth + 0.3, 0, height + 0.15, -depth / 2);

  // 縦看板（通りに向かって突き出す）
  const signTexture = CreateVerticalSignTexture(style.signText, style.signBackground, style.signForeground);
  const signMaterial = GetTextureMaterial(signTexture, true);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.6, 0.75), [
    signMaterial, signMaterial, GetStandardMaterial(0x222222), GetStandardMaterial(0x222222),
    GetStandardMaterial(0x222222), GetStandardMaterial(0x222222),
  ]);
  sign.position.set(width / 2 - 0.35, 5.0, 0.55);
  group.add(sign);

  // 風で揺らすもの（Level 側でアニメーションする）
  const swingingObjects: THREE.Object3D[] = [];
  if (style.hasLanterns) {
    for (const side of [-1, 1]) {
      const lantern = BuildPaperLantern();
      lantern.position.set(side * (width / 2 - 0.7), 2.45, 1.2);
      group.add(lantern);
      swingingObjects.push(lantern);
    }
  }
  group.userData.swingingObjects = swingingObjects;
  if (style.hasPumpkin) {
    const pumpkin = BuildJackOLantern(1.1);
    pumpkin.position.set(-width / 2 + 0.6, 0, 0.55);
    group.add(pumpkin);
  }
  return group;
}

/** 街灯。光源の位置（ローカル座標）を userData.lightPosition に入れる */
export function BuildStreetLamp(): THREE.Group {
  const group = new THREE.Group();
  const poleMaterial = GetStandardMaterial(0x2a2a30, 0.5, 0.6);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 4.2, 8), poleMaterial);
  pole.position.y = 2.1;
  pole.castShadow = true;
  group.add(pole);
  AddBox(group, poleMaterial, 0.08, 0.08, 0.7, 0, 4.1, 0.3, false);
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 0.45, 8), GetGlowMaterial(0xffd28a));
  head.position.set(0, 3.85, 0.6);
  group.add(head);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.2, 8), poleMaterial);
  cap.position.set(0, 4.15, 0.6);
  group.add(cap);
  group.userData.lightPosition = new THREE.Vector3(0, 3.6, 0.6);
  return group;
}

/** 電柱。電線をつなぐ位置を userData.wirePoints に入れる */
export function BuildUtilityPole(): THREE.Group {
  const group = new THREE.Group();
  const poleMaterial = GetStandardMaterial(0x77726c, 0.9);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.18, 9, 8), poleMaterial);
  pole.position.y = 4.5;
  pole.castShadow = true;
  group.add(pole);
  const armMaterial = GetStandardMaterial(0x3a3a3a, 0.6, 0.4);
  AddBox(group, armMaterial, 1.6, 0.1, 0.1, 0, 8.3, 0, false);
  AddBox(group, armMaterial, 1.2, 0.1, 0.1, 0, 7.6, 0, false);
  const transformer = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.7, 10), GetStandardMaterial(0x8a8f96, 0.5, 0.5));
  transformer.position.set(0, 6.6, 0.35);
  group.add(transformer);
  group.userData.wirePoints = [new THREE.Vector3(-0.7, 8.35, 0), new THREE.Vector3(0.7, 8.35, 0), new THREE.Vector3(0, 7.65, 0)];
  return group;
}

/** コンクリートのプランター（低い遮蔽物）。植え込み付き */
export function BuildPlanter(width: number, depth: number, height: number): THREE.Group {
  const group = new THREE.Group();
  AddBox(group, GetStandardMaterial(0x9a948c, 0.95), width, height, depth, 0, height / 2, 0);
  AddBox(group, GetStandardMaterial(0x3b2c22, 1), width - 0.2, 0.05, depth - 0.2, 0, height + 0.01, 0, false);
  const bushMaterial = GetStandardMaterial(0x3f6b2e, 0.9);
  const flowerMaterial = GetStandardMaterial(0xe0772a, 0.7);
  const bushCount = Math.max(2, Math.round(width / 0.7));
  for (let i = 0; i < bushCount; i++) {
    const bush = new THREE.Mesh(new THREE.SphereGeometry(0.32 + Math.random() * 0.1, 8, 6), bushMaterial);
    bush.position.set((i - (bushCount - 1) / 2) * (width / bushCount), height + 0.18, (Math.random() - 0.5) * (depth - 0.5));
    bush.scale.y = 0.7;
    bush.castShadow = true;
    group.add(bush);
    if (i % 2 === 0) {
      const flower = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), flowerMaterial);
      flower.position.copy(bush.position).add(new THREE.Vector3(0.1, 0.18, 0.1));
      group.add(flower);
    }
  }
  return group;
}

const CRATE_COLORS = [0x2f4f8f, 0xd8a020, 0xd86a20, 0x3f7f4f];

/** プラスチックのコンテナを積んだもの */
export function BuildCrateStack(levels: number, colorIndex: number): THREE.Group {
  const group = new THREE.Group();
  for (let level = 0; level < levels; level++) {
    const color = CRATE_COLORS[(colorIndex + level) % CRATE_COLORS.length];
    const crate = AddBox(group, GetStandardMaterial(color, 0.6), 1.1, 0.38, 0.8, (Math.random() - 0.5) * 0.08, 0.2 + level * 0.4, 0);
    crate.rotation.y = (Math.random() - 0.5) * 0.1;
    // 取っ手の穴
    AddBox(group, GetStandardMaterial(0x111111), 0.3, 0.08, 0.02, crate.position.x, crate.position.y + 0.08, 0.41, false);
  }
  return group;
}

/** 自動販売機 */
export function BuildVendingMachine(variant: number): THREE.Group {
  const group = new THREE.Group();
  const body = AddBox(group, GetStandardMaterial(variant === 0 ? 0xe8eef5 : 0xc23030, 0.4, 0.2), 1.0, 1.9, 0.8, 0, 0.95, 0);
  body.castShadow = true;
  AddPlane(group, GetTextureMaterial(CreateVendingMachineTexture(variant), true), 0.9, 1.8, 0, 0.95, 0.41);
  return group;
}

/** ベンチ */
export function BuildBench(): THREE.Group {
  const group = new THREE.Group();
  const woodMaterial = GetStandardMaterial(0x7a5234, 0.8);
  const legMaterial = GetStandardMaterial(0x2a2a2a, 0.5, 0.6);
  AddBox(group, woodMaterial, 1.8, 0.06, 0.45, 0, 0.45, 0);
  AddBox(group, woodMaterial, 1.8, 0.35, 0.05, 0, 0.72, -0.22);
  for (const side of [-1, 1]) AddBox(group, legMaterial, 0.06, 0.45, 0.4, side * 0.8, 0.22, 0, false);
  return group;
}

/** 自転車 */
export function BuildBicycle(): THREE.Group {
  const group = new THREE.Group();
  const frameMaterial = GetStandardMaterial(0x2a5a8a, 0.4, 0.5);
  const tireMaterial = GetStandardMaterial(0x111111, 0.9);
  for (const z of [-0.5, 0.5]) {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.03, 6, 16), tireMaterial);
    wheel.rotation.y = Math.PI / 2;
    wheel.position.set(0, 0.34, z);
    group.add(wheel);
  }
  const frame = AddBox(group, frameMaterial, 0.04, 0.04, 1.0, 0, 0.62, 0, false);
  frame.rotation.x = 0.1;
  AddBox(group, frameMaterial, 0.04, 0.5, 0.04, 0, 0.55, -0.2, false);
  AddBox(group, frameMaterial, 0.04, 0.55, 0.04, 0, 0.62, 0.4, false);
  AddBox(group, GetStandardMaterial(0x222222), 0.18, 0.05, 0.25, 0, 0.84, -0.22, false);
  AddBox(group, frameMaterial, 0.5, 0.04, 0.04, 0, 0.92, 0.42, false);
  AddBox(group, GetStandardMaterial(0x888888, 0.4, 0.6), 0.35, 0.2, 0.25, 0, 0.8, 0.6, false);
  return group;
}

/** 黒板の立て看板 */
export function BuildChalkboardSign(): THREE.Group {
  const group = new THREE.Group();
  const frameMaterial = GetStandardMaterial(0x5a3a24, 0.8);
  const boardMaterial = GetTextureMaterial(CreateChalkboardTexture(), false);
  for (const side of [1, -1]) {
    const panel = new THREE.Group();
    AddBox(panel, frameMaterial, 0.7, 1.05, 0.04, 0, 0, 0);
    const board = AddPlane(panel, boardMaterial, 0.6, 0.9, 0, 0, 0.025);
    if (side < 0) board.rotation.y = Math.PI;
    if (side < 0) board.position.z = -0.025;
    panel.position.set(0, 0.5, side * 0.2);
    panel.rotation.x = side * -0.2;
    group.add(panel);
  }
  return group;
}

/** 工事用バリケード（マップの端） */
export function BuildBarricade(width: number): THREE.Group {
  const group = new THREE.Group();
  const texture = CreateBarricadeTexture().clone();
  texture.repeat.set(width / 2, 1);
  texture.needsUpdate = true;
  const stripeMaterial = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.6 });
  const legMaterial = GetStandardMaterial(0xdddddd, 0.6);
  for (const y of [0.55, 1.05]) AddBox(group, stripeMaterial, width, 0.28, 0.08, 0, y, 0);
  const legCount = Math.max(2, Math.round(width / 2));
  for (let i = 0; i < legCount; i++) {
    const x = (i / (legCount - 1) - 0.5) * (width - 0.2);
    AddBox(group, legMaterial, 0.08, 1.25, 0.5, x, 0.62, 0, false);
  }
  // 点滅灯
  for (let i = 0; i < legCount; i += 2) {
    const x = (i / (legCount - 1) - 0.5) * (width - 0.2);
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), GetGlowMaterial(0xff6a1a));
    light.position.set(x, 1.3, 0);
    group.add(light);
  }
  return group;
}

/** マンホール（地面に貼る） */
export function BuildManhole(): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(0.45, 20), GetStandardMaterial(0x3a3632, 0.5, 0.6));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.012;
  mesh.receiveShadow = true;
  return mesh;
}
