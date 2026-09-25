// 破壊可能な設置物：酒樽（通常）とプロパンガスボンベ（爆発する）

import * as THREE from 'three';
import type { Collider } from './Collision';

const SAKE_BARREL_RADIUS = 0.45;
const SAKE_BARREL_HEIGHT = 0.9;
const PROPANE_RADIUS = 0.3;
const PROPANE_HEIGHT = 1.15;
const NORMAL_BARREL_HP = 30;
const EXPLOSIVE_BARREL_HP = 20;

const woodMaterial = new THREE.MeshStandardMaterial({ color: 0xb0804e, roughness: 0.8 });
const lidMaterial = new THREE.MeshStandardMaterial({ color: 0x8a5e36, roughness: 0.85 });
const ropeMaterial = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 1 });
const propaneMaterial = new THREE.MeshStandardMaterial({ color: 0xc8261e, roughness: 0.45, metalness: 0.35 });
const valveMaterial = new THREE.MeshStandardMaterial({ color: 0xb8b8b8, roughness: 0.3, metalness: 0.9 });

function CreateLabelTexture(text: string, background: string, foreground: string, width: number, height: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d')!;
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);
  context.fillStyle = foreground;
  context.font = `bold ${Math.floor(height * 0.6)}px "Yu Mincho", "Hiragino Mincho ProN", "Noto Serif JP", "IPAMincho", serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, width / 2, height / 2 + 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

let sakeLabelMaterial: THREE.MeshStandardMaterial | null = null;
let propaneLabelMaterial: THREE.MeshStandardMaterial | null = null;

function GetSakeLabelMaterial(): THREE.MeshStandardMaterial {
  sakeLabelMaterial ??= new THREE.MeshStandardMaterial({ map: CreateLabelTexture('酒', '#f4ecdc', '#1a1a1a', 128, 128), roughness: 0.8 });
  return sakeLabelMaterial;
}

function GetPropaneLabelMaterial(): THREE.MeshStandardMaterial {
  propaneLabelMaterial ??= new THREE.MeshStandardMaterial({ map: CreateLabelTexture('火気厳禁', '#f2c400', '#1a1a1a', 256, 64), roughness: 0.6 });
  return propaneLabelMaterial;
}

function BuildSakeBarrel(group: THREE.Group): void {
  const body = new THREE.Mesh(new THREE.CylinderGeometry(SAKE_BARREL_RADIUS * 0.95, SAKE_BARREL_RADIUS * 0.88, SAKE_BARREL_HEIGHT, 16), woodMaterial);
  body.position.y = SAKE_BARREL_HEIGHT / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(SAKE_BARREL_RADIUS * 0.9, SAKE_BARREL_RADIUS * 0.9, 0.04, 16), lidMaterial);
  lid.position.y = SAKE_BARREL_HEIGHT + 0.01;
  group.add(lid);
  // 縄の帯
  for (const y of [0.15, 0.45, 0.75]) {
    const rope = new THREE.Mesh(new THREE.TorusGeometry(SAKE_BARREL_RADIUS * 0.94, 0.03, 6, 20), ropeMaterial);
    rope.rotation.x = Math.PI / 2;
    rope.position.y = y;
    group.add(rope);
  }
  // 「酒」のラベル
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), GetSakeLabelMaterial());
  label.position.set(0, 0.45, SAKE_BARREL_RADIUS * 0.93 + 0.01);
  group.add(label);
}

function BuildPropaneCylinder(group: THREE.Group): void {
  const bodyHeight = PROPANE_HEIGHT - PROPANE_RADIUS;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(PROPANE_RADIUS, PROPANE_RADIUS, bodyHeight, 16), propaneMaterial);
  body.position.y = bodyHeight / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(PROPANE_RADIUS, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), propaneMaterial);
  dome.position.y = bodyHeight;
  dome.castShadow = true;
  group.add(dome);
  // バルブと保護リング
  const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.16, 8), valveMaterial);
  valve.position.y = PROPANE_HEIGHT + 0.05;
  group.add(valve);
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.02, 6, 16), valveMaterial);
  guard.rotation.x = Math.PI / 2;
  guard.position.y = PROPANE_HEIGHT + 0.06;
  group.add(guard);
  // 「火気厳禁」の帯（ぐるりと一周）
  const band = new THREE.Mesh(new THREE.CylinderGeometry(PROPANE_RADIUS + 0.005, PROPANE_RADIUS + 0.005, 0.2, 16, 1, true), GetPropaneLabelMaterial());
  band.position.y = bodyHeight * 0.6;
  group.add(band);
}

export class Barrel {
  readonly mesh = new THREE.Group();
  readonly collider: Collider;
  readonly position: THREE.Vector3;
  readonly isExplosive: boolean;
  readonly maxHp: number;
  hp: number;
  isAlive = true;
  private readonly height: number;

  constructor(position: THREE.Vector3, isExplosive: boolean) {
    this.position = position.clone();
    this.isExplosive = isExplosive;
    this.maxHp = isExplosive ? EXPLOSIVE_BARREL_HP : NORMAL_BARREL_HP;
    this.hp = this.maxHp;
    const radius = isExplosive ? PROPANE_RADIUS : SAKE_BARREL_RADIUS;
    this.height = isExplosive ? PROPANE_HEIGHT : SAKE_BARREL_HEIGHT;

    if (isExplosive) BuildPropaneCylinder(this.mesh);
    else BuildSakeBarrel(this.mesh);
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = Math.random() * Math.PI * 2;

    this.collider = {
      box: new THREE.Box3(
        new THREE.Vector3(position.x - radius, 0, position.z - radius),
        new THREE.Vector3(position.x + radius, this.height, position.z + radius),
      ),
      barrel: this,
    };
  }

  /** ダメージを与える。今回の攻撃で壊れたら true */
  TakeDamage(amount: number): boolean {
    if (!this.isAlive) return false;
    this.hp -= amount;
    if (this.hp > 0) return false;
    this.isAlive = false;
    this.mesh.visible = false;
    return true;
  }

  Respawn(): void {
    this.hp = this.maxHp;
    this.isAlive = true;
    this.mesh.visible = true;
  }

  GetCenter(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.position.x, this.height / 2, this.position.z);
  }
}
