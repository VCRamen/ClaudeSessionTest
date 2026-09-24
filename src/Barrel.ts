// 破壊可能な樽（通常樽・爆発樽）

import * as THREE from 'three';
import type { Collider } from './Collision';

const BARREL_RADIUS = 0.45;
const BARREL_HEIGHT = 1.0;
const NORMAL_BARREL_HP = 30;
const EXPLOSIVE_BARREL_HP = 20;

const barrelGeometry = new THREE.CylinderGeometry(BARREL_RADIUS, BARREL_RADIUS * 0.92, BARREL_HEIGHT, 14);
const ringGeometry = new THREE.TorusGeometry(BARREL_RADIUS * 1.0, 0.035, 6, 18);
const woodMaterial = new THREE.MeshStandardMaterial({ color: 0x7a4a24, roughness: 0.85 });
const explosiveMaterial = new THREE.MeshStandardMaterial({ color: 0xb01818, roughness: 0.5, metalness: 0.3 });
const ringMaterial = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.4, metalness: 0.7 });
const warningMaterial = new THREE.MeshStandardMaterial({
  color: 0xffcc00,
  emissive: 0xff8800,
  emissiveIntensity: 0.6,
});
const warningGeometry = new THREE.BoxGeometry(0.3, 0.3, 0.02);

export class Barrel {
  readonly mesh = new THREE.Group();
  readonly collider: Collider;
  readonly position: THREE.Vector3;
  readonly isExplosive: boolean;
  readonly maxHp: number;
  hp: number;
  isAlive = true;

  constructor(position: THREE.Vector3, isExplosive: boolean) {
    this.position = position.clone();
    this.isExplosive = isExplosive;
    this.maxHp = isExplosive ? EXPLOSIVE_BARREL_HP : NORMAL_BARREL_HP;
    this.hp = this.maxHp;

    const body = new THREE.Mesh(barrelGeometry, isExplosive ? explosiveMaterial : woodMaterial);
    body.position.y = BARREL_HEIGHT / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    this.mesh.add(body);
    for (const ringY of [0.18, 0.82]) {
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = ringY;
      this.mesh.add(ring);
    }
    if (isExplosive) {
      for (let i = 0; i < 4; i++) {
        const sign = new THREE.Mesh(warningGeometry, warningMaterial);
        const angle = (i / 4) * Math.PI * 2;
        sign.position.set(Math.sin(angle) * (BARREL_RADIUS + 0.005), 0.5, Math.cos(angle) * (BARREL_RADIUS + 0.005));
        sign.rotation.set(0, angle, Math.PI / 4);
        this.mesh.add(sign);
      }
    }
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = Math.random() * Math.PI * 2;

    this.collider = {
      box: new THREE.Box3(
        new THREE.Vector3(position.x - BARREL_RADIUS, 0, position.z - BARREL_RADIUS),
        new THREE.Vector3(position.x + BARREL_RADIUS, BARREL_HEIGHT, position.z + BARREL_RADIUS),
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
    return out.set(this.position.x, BARREL_HEIGHT / 2, this.position.z);
  }
}
