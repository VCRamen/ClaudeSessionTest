// ビル街の建物や小物のモデル（すべて +Z が正面、原点は地面の中心）

import * as THREE from 'three';
import { AddBox, AddPlane, BuildJackOLantern, GetGlowMaterial, GetStandardMaterial, GetTextureMaterial } from './CityProps';
import {
  CreateApartmentWindowTexture, CreateHalloweenBannerTexture, CreateOfficeWindowTexture, CreateStorefrontTexture,
} from './CityTextures';

/** マンションの 1 階（店舗）の高さ。ベランダはこれより上に付く */
export const APARTMENT_GROUND_FLOOR_HEIGHT = 4.6;
/** マンションの階の高さ */
export const APARTMENT_FLOOR_HEIGHT = 3.2;
/** ベランダの奥行き（壁からの張り出し） */
export const BALCONY_DEPTH = 1.4;
/** ベランダの床の厚さ */
export const BALCONY_SLAB_THICKNESS = 0.2;

const OFFICE_WINDOW_TILE_WIDTH = 8;
const OFFICE_WINDOW_TILE_HEIGHT = 13.6;
const APARTMENT_WALL_COLORS = [0xb8b2a8, 0x9c968e, 0xa89c8c, 0x8e9096];

let glassMaterial: THREE.MeshStandardMaterial | null = null;

/** ベランダの手すりのガラス（半透明で、向こう側の敵が見える） */
function GetGlassMaterial(): THREE.MeshStandardMaterial {
  if (!glassMaterial) {
    glassMaterial = new THREE.MeshStandardMaterial({
      color: 0x9fc8e8, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide,
    });
  }
  return glassMaterial;
}

/** テクスチャを tilesX × tilesY 回繰り返して貼る板 */
function AddTiledPlane(
  parent: THREE.Object3D,
  material: THREE.Material,
  width: number,
  height: number,
  tilesX: number,
  tilesY: number,
  x: number,
  y: number,
  z: number,
  rotationY = 0,
): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(width, height);
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * tilesX, uv.getY(i) * tilesY);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.rotation.y = rotationY;
  parent.add(mesh);
  return mesh;
}

/**
 * ベランダ（床の上面が y = 0、壁が z = 0、+Z へ張り出す）。
 * isGlass ならガラスの手すり（ビル街）、そうでなければ金属の柵と物干し竿（商店街）
 */
export function BuildBalcony(width: number, depth: number, isGlass: boolean): THREE.Group {
  const group = new THREE.Group();
  AddBox(group, GetStandardMaterial(isGlass ? 0xc8c2b8 : 0x8a8480, 0.9), width, BALCONY_SLAB_THICKNESS, depth, 0, -BALCONY_SLAB_THICKNESS / 2, depth / 2);
  const railMaterial = GetStandardMaterial(isGlass ? 0x3a3a40 : 0x5a5652, 0.5, 0.6);
  const railHeight = 1.0;
  if (isGlass) {
    AddPlane(group, GetGlassMaterial(), width - 0.1, railHeight - 0.1, 0, railHeight / 2, depth - 0.05);
    for (const side of [-1, 1]) {
      const panel = AddPlane(group, GetGlassMaterial(), depth - 0.1, railHeight - 0.1, side * (width / 2 - 0.05), railHeight / 2, depth / 2);
      panel.rotation.y = Math.PI / 2;
    }
  } else {
    // 縦の柵
    const barCount = Math.max(4, Math.round(width / 0.25));
    for (let i = 0; i <= barCount; i++) {
      AddBox(group, railMaterial, 0.03, railHeight, 0.03, -width / 2 + (i / barCount) * width, railHeight / 2, depth - 0.05, false);
    }
    // 物干し竿とタオル
    AddBox(group, railMaterial, width - 0.3, 0.03, 0.03, 0, 1.7, depth * 0.45, false);
    const towel = AddPlane(group, GetStandardMaterial(0xe8e0d0, 0.9), 0.5, 0.6, -width * 0.2, 1.4, depth * 0.45);
    towel.receiveShadow = false;
  }
  // 手すりの上端
  AddBox(group, railMaterial, width, 0.05, 0.06, 0, railHeight, depth - 0.05, false);
  for (const side of [-1, 1]) AddBox(group, railMaterial, 0.06, 0.05, depth, side * (width / 2 - 0.03), railHeight, depth / 2, false);
  return group;
}

/**
 * 1 階が店舗のマンション（正面が +Z）。balconyHeights の高さに横いっぱいのベランダを付ける
 */
export function BuildApartment(width: number, height: number, depth: number, variant: number, balconyHeights: number[]): THREE.Group {
  const group = new THREE.Group();
  const wallColor = APARTMENT_WALL_COLORS[variant % APARTMENT_WALL_COLORS.length];
  AddBox(group, GetStandardMaterial(wallColor, 0.95), width, height, depth, 0, height / 2, -depth / 2);

  // 1 階の店舗（ガラス張りで明るい）
  const groundHeight = APARTMENT_GROUND_FLOOR_HEIGHT;
  AddBox(group, GetStandardMaterial(0x2a2a30, 0.6, 0.4), width - 0.1, 0.35, 0.2, 0, groundHeight - 0.9, 0.1, false);
  const storefront = AddPlane(group, GetTextureMaterial(CreateStorefrontTexture(variant), true), width - 0.8, groundHeight - 1.4, 0, (groundHeight - 1.1) / 2, 0.06);
  storefront.receiveShadow = false;
  // 店の上の光る帯（看板）
  AddPlane(group, GetGlowMaterial([0xffc070, 0xff8a50, 0xd0e8ff][variant % 3]), width - 1.2, 0.18, 0, groundHeight - 0.6, 0.21);
  // 壁付けの照明
  for (const side of [-1, 1]) AddBox(group, GetGlowMaterial(0xffe0a0), 0.18, 0.3, 0.12, side * (width / 2 - 0.25), 2.6, 0.08, false);

  // 2 階から上の窓（部屋ごとに繰り返し）
  const windowMaterial = GetTextureMaterial(CreateApartmentWindowTexture(), true);
  for (let y = groundHeight + 0.4; y + 2.2 < height - 0.4; y += APARTMENT_FLOOR_HEIGHT) {
    AddTiledPlane(group, windowMaterial, width - 0.6, 2.2, Math.max(1, Math.round((width - 0.6) / 5)), 1, 0, y + 1.1, 0.02);
  }
  // 階の区切りの帯
  for (let y = groundHeight; y < height - 0.5; y += APARTMENT_FLOOR_HEIGHT) {
    AddBox(group, GetStandardMaterial(0xd8d2c8, 0.9), width, 0.12, 0.1, 0, y, 0.05, false);
  }
  for (const balconyHeight of balconyHeights) {
    const balcony = BuildBalcony(width - 0.3, BALCONY_DEPTH, true);
    balcony.position.y = balconyHeight;
    group.add(balcony);
    // 植木鉢（ベランダの端）
    if ((variant + Math.round(balconyHeight)) % 2 === 0) {
      const pot = AddBox(group, GetStandardMaterial(0x6a4a3a, 0.9), 0.4, 0.4, 0.4, width / 2 - 0.6, balconyHeight + 0.2, BALCONY_DEPTH - 0.4);
      const plant = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), GetStandardMaterial(0x3f6b2e, 0.9));
      plant.position.set(pot.position.x, balconyHeight + 0.7, pot.position.z);
      plant.castShadow = true;
      group.add(plant);
    }
  }
  // 屋上のふち
  AddBox(group, GetStandardMaterial(0x4a4850), width + 0.2, 0.4, depth + 0.2, 0, height + 0.2, -depth / 2);
  if (variant % 2 === 0) {
    const pumpkin = BuildJackOLantern(1.2);
    pumpkin.position.set(-width / 2 + 0.7, 0, 0.45);
    group.add(pumpkin);
  }
  return group;
}

/** ガラス張りの高層ビル（正面と左右の面に窓） */
export function BuildOfficeTower(width: number, height: number, depth: number, variant: number, hasSideWindows = true): THREE.Group {
  const group = new THREE.Group();
  AddBox(group, GetStandardMaterial(variant % 2 === 0 ? 0x2a3448 : 0x302a36, 0.5, 0.3), width, height, depth, 0, height / 2, -depth / 2);
  const windowMaterial = GetTextureMaterial(CreateOfficeWindowTexture(variant % 2), true);
  const windowHeight = height - 1.2;
  const tilesY = windowHeight / OFFICE_WINDOW_TILE_HEIGHT;
  AddTiledPlane(group, windowMaterial, width - 0.6, windowHeight, (width - 0.6) / OFFICE_WINDOW_TILE_WIDTH, tilesY, 0, windowHeight / 2 + 0.4, 0.03);
  if (hasSideWindows) {
    for (const side of [-1, 1]) {
      AddTiledPlane(group, windowMaterial, depth - 0.6, windowHeight, (depth - 0.6) / OFFICE_WINDOW_TILE_WIDTH, tilesY,
        side * (width / 2 + 0.03), windowHeight / 2 + 0.4, -depth / 2, side * Math.PI / 2);
    }
  }
  // 屋上の設備と航空障害灯
  AddBox(group, GetStandardMaterial(0x3a3a42, 0.7), width * 0.4, 2, depth * 0.4, 0, height + 1, -depth / 2);
  if (height > 28) {
    for (const side of [-1, 1]) {
      AddBox(group, GetGlowMaterial(0xff2020), 0.4, 0.4, 0.4, side * (width / 2 - 0.4), height + 0.3, -0.4, false);
    }
  }
  return group;
}

/**
 * 遠くに見える高層ビル群（マップの外周をぐるりと囲む）。影は落とさない
 */
export function BuildSkyline(innerRadius: number, outerRadius: number, count: number): THREE.Group {
  const group = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.1;
    const radius = innerRadius + Math.random() * (outerRadius - innerRadius);
    const width = 12 + Math.random() * 12;
    const height = 35 + Math.random() * 70;
    const tower = BuildOfficeTower(width, height, 14, i, false);
    tower.position.set(Math.sin(angle) * radius, 0, Math.cos(angle) * radius);
    // 正面（+Z）をマップの中心へ向ける
    tower.rotation.y = angle + Math.PI;
    tower.traverse((object) => {
      object.castShadow = false;
    });
    group.add(tower);
  }
  return group;
}

/**
 * 建物の角の壁に取り付ける信号機（通りの上に伸びる腕）。正面（信号の灯る側）が +Z、腕はローカル -X へ伸びる。
 * 地面に柱を立てると、角に張り付いて身を乗り出すときの邪魔になるので壁付けにしている
 */
export function BuildTrafficLight(armLength: number): THREE.Group {
  const group = new THREE.Group();
  const poleMaterial = GetStandardMaterial(0x6a6e74, 0.5, 0.6);
  // 壁への取り付け金具
  AddBox(group, poleMaterial, 0.3, 0.5, 0.3, 0, 5.0, 0, false);
  AddBox(group, poleMaterial, armLength, 0.1, 0.1, -armLength / 2, 5.0, 0, false);
  const head = AddBox(group, GetStandardMaterial(0x2a2a2e, 0.6), 1.1, 0.4, 0.3, -armLength + 0.8, 4.75, 0, false);
  const lightColors = [0x20ff90, 0x3a3a20, 0x3a1a1a];
  lightColors.forEach((color, index) => {
    const light = new THREE.Mesh(new THREE.CircleGeometry(0.12, 12), GetGlowMaterial(color));
    light.position.set(head.position.x - 0.35 + index * 0.35, 4.75, 0.16);
    group.add(light);
  });
  return group;
}

/** 街灯に付けるハロウィンのバナー（柱からの距離 0.1 の位置に吊るす） */
export function BuildHalloweenBanner(): THREE.Group {
  const group = new THREE.Group();
  const bracketMaterial = GetStandardMaterial(0x2a2a30, 0.5, 0.6);
  AddBox(group, bracketMaterial, 0.04, 0.04, 0.8, 0, 3.55, 0.45, false);
  AddBox(group, bracketMaterial, 0.04, 0.04, 0.8, 0, 2.15, 0.45, false);
  const bannerMaterial = GetTextureMaterial(CreateHalloweenBannerTexture(), false);
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.4), bannerMaterial);
  (bannerMaterial as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  banner.position.set(0, 2.85, 0.5);
  banner.rotation.y = Math.PI / 2;
  banner.castShadow = true;
  group.add(banner);
  return group;
}

/** カラーコーン */
export function BuildTrafficCone(): THREE.Group {
  const group = new THREE.Group();
  AddBox(group, GetStandardMaterial(0x222222, 0.9), 0.4, 0.04, 0.4, 0, 0.02, 0, false);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.65, 12), GetStandardMaterial(0xff5a1a, 0.6));
  cone.position.y = 0.36;
  cone.castShadow = true;
  group.add(cone);
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.11, 0.1, 12), GetStandardMaterial(0xf2f2f2, 0.5));
  stripe.position.y = 0.42;
  group.add(stripe);
  return group;
}

/** 広場の噴水（四角い水盤。低い遮蔽物） */
export function BuildFountain(size: number, height: number): THREE.Group {
  const group = new THREE.Group();
  const stoneMaterial = GetStandardMaterial(0xa8a298, 0.9);
  const wall = 0.3;
  for (const side of [-1, 1]) {
    AddBox(group, stoneMaterial, size, height, wall, 0, height / 2, side * (size / 2 - wall / 2));
    AddBox(group, stoneMaterial, wall, height, size - wall * 2, side * (size / 2 - wall / 2), height / 2, 0);
  }
  const water = new THREE.Mesh(new THREE.PlaneGeometry(size - wall * 2, size - wall * 2), GetGlowMaterial(0x3a78a8));
  water.rotation.x = -Math.PI / 2;
  water.position.y = height - 0.25;
  group.add(water);
  // 中央の台座と大きなかぼちゃ
  AddBox(group, stoneMaterial, 0.8, height + 0.8, 0.8, 0, (height + 0.8) / 2, 0);
  const pumpkin = BuildJackOLantern(2.4);
  pumpkin.position.y = height + 0.8;
  group.add(pumpkin);
  return group;
}
