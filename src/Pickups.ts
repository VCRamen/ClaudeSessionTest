// 落ちているアイテム（武器・回復・弾薬）

import * as THREE from 'three';
import { PICKUP_LIFETIME } from './Config';
import { BuildGunMesh } from './WeaponModels';
import type { WeaponInstance } from './Weapons';

export type PickupKind = 'weapon' | 'health' | 'ammo';

const TIER_COLORS = [0x6ad1ff, 0x7dff7d, 0xc27dff, 0xffb13d];

export interface Pickup {
  kind: PickupKind;
  weapon: WeaponInstance | null;
  position: THREE.Vector3;
  mesh: THREE.Group;
  life: number;
  spin: number;
  baseColor: number;
  glowMaterial: THREE.MeshBasicMaterial;
  beamMaterial: THREE.MeshBasicMaterial;
}

const BONUS_COLOR = 0xffd34d;

const ringGeometry = new THREE.RingGeometry(0.45, 0.6, 24);
const beamGeometry = new THREE.CylinderGeometry(0.05, 0.05, 2.5, 6, 1, true);
const healthMaterial = new THREE.MeshStandardMaterial({ color: 0x33dd66, emissive: 0x118833, emissiveIntensity: 0.8 });
const ammoMaterial = new THREE.MeshStandardMaterial({ color: 0xd8b030, emissive: 0x665000, emissiveIntensity: 0.6 });

function BuildHealthMesh(): THREE.Group {
  const group = new THREE.Group();
  const vertical = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.45, 0.15), healthMaterial);
  const horizontal = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.15, 0.15), healthMaterial);
  group.add(vertical, horizontal);
  return group;
}

function BuildAmmoMesh(): THREE.Group {
  const group = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.25, 0.28), ammoMaterial);
  group.add(box);
  return group;
}

export class PickupManager {
  readonly pickups: Pickup[] = [];
  private readonly scene: THREE.Scene;
  private time = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  SpawnWeapon(position: THREE.Vector3, weapon: WeaponInstance): void {
    const color = TIER_COLORS[Math.min(weapon.def.tier, TIER_COLORS.length - 1)];
    const content = BuildGunMesh(weapon.def.id);
    content.scale.setScalar(1.6);
    this.Spawn('weapon', position, content, color, weapon);
  }

  SpawnHealth(position: THREE.Vector3): void {
    this.Spawn('health', position, BuildHealthMesh(), 0x33dd66, null);
  }

  SpawnAmmo(position: THREE.Vector3): void {
    this.Spawn('ammo', position, BuildAmmoMesh(), 0xd8b030, null);
  }

  Remove(pickup: Pickup): void {
    const index = this.pickups.indexOf(pickup);
    if (index >= 0) this.pickups.splice(index, 1);
    this.scene.remove(pickup.mesh);
  }

  Clear(): void {
    for (const pickup of this.pickups) this.scene.remove(pickup.mesh);
    this.pickups.length = 0;
  }

  /** 最も近い武器ピックアップ（範囲内のみ。IsExcluded が true のものは除く） */
  FindNearestWeapon(position: THREE.Vector3, range: number, IsExcluded?: (pickup: Pickup) => boolean): Pickup | null {
    let best: Pickup | null = null;
    let bestDistance = range;
    for (const pickup of this.pickups) {
      if (pickup.kind !== 'weapon' || IsExcluded?.(pickup)) continue;
      const distance = Math.hypot(pickup.position.x - position.x, pickup.position.z - position.z);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = pickup;
      }
    }
    return best;
  }

  /** IsBonus が true の武器ピックアップは金色に光らせる（拾うと強化ボーナス） */
  Update(dt: number, IsBonus: (pickup: Pickup) => boolean): void {
    this.time += dt;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pickup = this.pickups[i];
      pickup.life -= dt;
      if (pickup.life <= 0) {
        this.Remove(pickup);
        continue;
      }
      const content = pickup.mesh.children[0];
      content.rotation.y += dt * 1.8;
      content.position.y = 0.6 + Math.sin(this.time * 3 + pickup.spin) * 0.1;
      if (pickup.kind === 'weapon') {
        const isBonus = IsBonus(pickup);
        const color = isBonus ? BONUS_COLOR : pickup.baseColor;
        pickup.glowMaterial.color.setHex(color);
        pickup.beamMaterial.color.setHex(color);
        const pulse = isBonus ? 1 + Math.sin(this.time * 8 + pickup.spin) * 0.15 : 1;
        pickup.mesh.children[1].scale.setScalar(pulse);
      }
      // 消える直前は点滅させる
      pickup.mesh.visible = pickup.life > 5 || Math.floor(pickup.life * 6) % 2 === 0;
    }
  }

  private Spawn(kind: PickupKind, position: THREE.Vector3, content: THREE.Group, color: number, weapon: WeaponInstance | null): void {
    const group = new THREE.Group();
    group.add(content);
    const glowMaterial = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
      depthWrite: false,
      // 色がはっきり見えるよう、加算合成やトーンマッピングは使わない
      toneMapped: false,
    });
    const ring = new THREE.Mesh(ringGeometry, glowMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    group.add(ring);
    // 光の柱は半透明にして奥が見えるようにする
    const beamMaterial = glowMaterial.clone();
    beamMaterial.opacity = 0.35;
    if (kind === 'weapon') {
      const beam = new THREE.Mesh(beamGeometry, beamMaterial);
      beam.position.y = 1.25;
      group.add(beam);
    }
    group.position.set(position.x, 0, position.z);
    this.scene.add(group);
    this.pickups.push({
      kind,
      weapon,
      position: new THREE.Vector3(position.x, 0, position.z),
      mesh: group,
      life: PICKUP_LIFETIME,
      spin: Math.random() * Math.PI * 2,
      baseColor: color,
      glowMaterial,
      beamMaterial,
    });
  }
}
