// 敵の定義と AI

import * as THREE from 'three';
import { MAP_HALF_SIZE, PLAYER_RADIUS } from './Config';
import { Clamp, HasLineOfSight, PushOutCircle } from './Collision';
import type { Collider } from './Collision';
import type { NavGrid } from './NavGrid';
import { BuildBatModel, BuildGhostModel, BuildPumpkinKingModel, BuildPumpkinModel } from './EnemyModels';
import type { EnemyModel } from './EnemyModels';

export type EnemyKind = 'pumpkin' | 'ghost' | 'bat' | 'boss';

export interface HitSphereDef {
  offset: THREE.Vector3;
  radius: number;
  damageMultiplier: number;
}

export interface EnemyDef {
  kind: EnemyKind;
  name: string;
  hp: number;
  speed: number;
  radius: number;
  height: number;
  /** 0 なら地上。0 より大きければ浮遊する高さ */
  flyHeight: number;
  preferredRange: number;
  fireIntervalMin: number;
  fireIntervalMax: number;
  projectileSpeed: number;
  projectileDamage: number;
  projectileColor: number;
  projectileSize: number;
  projectileHoming: number;
  projectileCount: number;
  meleeDamage: number;
  reward: number;
  eyeHeight: number;
  hitSpheres: HitSphereDef[];
}

export const ENEMY_DEFS: Record<EnemyKind, EnemyDef> = {
  pumpkin: {
    kind: 'pumpkin', name: 'パンプキンメイジ', hp: 60, speed: 2.6, radius: 0.45, height: 1.8, flyHeight: 0,
    preferredRange: 13, fireIntervalMin: 2.4, fireIntervalMax: 3.8,
    projectileSpeed: 15, projectileDamage: 8, projectileColor: 0xff6a00, projectileSize: 0.18, projectileHoming: 0,
    projectileCount: 1, meleeDamage: 0, reward: 15, eyeHeight: 1.4,
    hitSpheres: [
      { offset: new THREE.Vector3(0, 0.65, 0), radius: 0.45, damageMultiplier: 1 },
      { offset: new THREE.Vector3(0, 1.38, 0), radius: 0.4, damageMultiplier: 2 },
    ],
  },
  ghost: {
    kind: 'ghost', name: 'ゴースト', hp: 45, speed: 3.4, radius: 0.45, height: 1.2, flyHeight: 1.4,
    preferredRange: 9, fireIntervalMin: 2.0, fireIntervalMax: 3.2,
    projectileSpeed: 9, projectileDamage: 6, projectileColor: 0xb66bff, projectileSize: 0.22, projectileHoming: 1.2,
    projectileCount: 1, meleeDamage: 0, reward: 20, eyeHeight: 0,
    hitSpheres: [{ offset: new THREE.Vector3(0, -0.1, 0), radius: 0.55, damageMultiplier: 1 }],
  },
  bat: {
    kind: 'bat', name: 'バット', hp: 25, speed: 6.5, radius: 0.35, height: 0.6, flyHeight: 1.5,
    preferredRange: 0, fireIntervalMin: 1.1, fireIntervalMax: 1.5,
    projectileSpeed: 0, projectileDamage: 0, projectileColor: 0, projectileSize: 0, projectileHoming: 0,
    projectileCount: 0, meleeDamage: 6, reward: 10, eyeHeight: 0,
    hitSpheres: [{ offset: new THREE.Vector3(0, 0, 0), radius: 0.38, damageMultiplier: 1 }],
  },
  boss: {
    kind: 'boss', name: 'パンプキンキング', hp: 1500, speed: 1.7, radius: 1.1, height: 4, flyHeight: 0,
    preferredRange: 16, fireIntervalMin: 2.0, fireIntervalMax: 2.8,
    projectileSpeed: 13, projectileDamage: 12, projectileColor: 0xff3300, projectileSize: 0.3, projectileHoming: 0,
    projectileCount: 5, meleeDamage: 0, reward: 300, eyeHeight: 2.9,
    hitSpheres: [
      { offset: new THREE.Vector3(0, 1.1, 0), radius: 1.05, damageMultiplier: 1 },
      { offset: new THREE.Vector3(0, 2.9, 0), radius: 0.9, damageMultiplier: 1.5 },
    ],
  },
};

export interface EnemyContext {
  playerPosition: THREE.Vector3;
  playerTarget: THREE.Vector3;
  colliders: Collider[];
  nav: NavGrid;
  enemies: Enemy[];
  camera: THREE.Camera;
  FireProjectile: (enemy: Enemy, origin: THREE.Vector3, direction: THREE.Vector3) => void;
  MeleePlayer: (enemy: Enemy) => void;
  SummonBats: (enemy: Enemy, count: number) => void;
}

const tmpDirection = new THREE.Vector3();
const tmpNavDirection = new THREE.Vector3();
const tmpEye = new THREE.Vector3();
const tmpTarget = new THREE.Vector3();
const tmpSide = new THREE.Vector3();

const barBackgroundGeometry = new THREE.PlaneGeometry(1, 0.1);
const barFillGeometry = new THREE.PlaneGeometry(1, 0.1);
barFillGeometry.translate(0.5, 0, 0);
const barBackgroundMaterial = new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.6, depthWrite: false });
const barFillMaterial = new THREE.MeshBasicMaterial({ color: 0xff3344, depthWrite: false });

export class Enemy {
  readonly def: EnemyDef;
  readonly position: THREE.Vector3;
  readonly mesh: THREE.Group;
  readonly healthBar = new THREE.Group();
  readonly damageScale: number;
  maxHp: number;
  hp: number;
  isAlive = true;

  private readonly model: EnemyModel;
  private readonly healthFill: THREE.Mesh;
  private readonly velocity = new THREE.Vector3();
  private fireTimer: number;
  private losTimer = 0;
  private hasLineOfSight = false;
  private strafeDirection = Math.random() < 0.5 ? -1 : 1;
  private strafeTimer = 0;
  private summonTimer = 6;
  private time = Math.random() * 10;
  private hitPulse = 0;

  constructor(kind: EnemyKind, position: THREE.Vector3, wave: number) {
    this.def = ENEMY_DEFS[kind];
    this.position = position.clone();
    const hpScale = 1 + 0.15 * (wave - 1);
    this.damageScale = 1 + 0.05 * (wave - 1);
    this.maxHp = Math.round(this.def.hp * hpScale);
    this.hp = this.maxHp;
    this.fireTimer = 1 + Math.random() * 1.5;

    switch (kind) {
      case 'pumpkin':
        this.model = BuildPumpkinModel();
        break;
      case 'ghost':
        this.model = BuildGhostModel();
        break;
      case 'bat':
        this.model = BuildBatModel();
        break;
      case 'boss':
        this.model = BuildPumpkinKingModel();
        break;
    }
    this.mesh = this.model.group;
    this.mesh.position.copy(this.position);
    this.mesh.position.y = this.def.flyHeight;

    const background = new THREE.Mesh(barBackgroundGeometry, barBackgroundMaterial);
    this.healthFill = new THREE.Mesh(barFillGeometry, barFillMaterial);
    this.healthFill.position.set(-0.5, 0, 0.001);
    this.healthBar.add(background, this.healthFill);
    this.healthBar.visible = false;
    this.healthBar.renderOrder = 10;
  }

  /** 当たり判定球のワールド座標 */
  GetHitSphereCenter(index: number, out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.mesh.position).add(this.def.hitSpheres[index].offset);
  }

  GetCenter(out: THREE.Vector3): THREE.Vector3 {
    return this.GetHitSphereCenter(0, out);
  }

  TakeDamage(amount: number): boolean {
    if (!this.isAlive) return false;
    this.hp -= amount;
    this.hitPulse = 1;
    if (this.def.kind !== 'boss') this.healthBar.visible = true;
    if (this.hp <= 0) {
      this.hp = 0;
      this.isAlive = false;
      return true;
    }
    return false;
  }

  Update(dt: number, context: EnemyContext): void {
    this.time += dt;
    const def = this.def;
    const toPlayerX = context.playerPosition.x - this.position.x;
    const toPlayerZ = context.playerPosition.z - this.position.z;
    const distance = Math.hypot(toPlayerX, toPlayerZ);

    // 視線チェックは負荷軽減のため間引く
    this.losTimer -= dt;
    if (this.losTimer <= 0) {
      this.losTimer = 0.2 + Math.random() * 0.1;
      this.GetEyePosition(tmpEye);
      this.hasLineOfSight = HasLineOfSight(tmpEye, context.playerTarget, context.colliders);
    }

    // 移動方向の決定
    tmpDirection.set(0, 0, 0);
    const hasNav = context.nav.GetMoveDirection(this.position, tmpNavDirection);
    const toPlayerDirection = tmpTarget.set(toPlayerX, 0, toPlayerZ).normalize();
    let speedScale = 1;
    if (def.kind === 'bat') {
      if (this.hasLineOfSight && distance < 10) tmpDirection.copy(toPlayerDirection);
      else if (hasNav) tmpDirection.copy(tmpNavDirection);
      if (distance < def.radius + PLAYER_RADIUS + 0.3) speedScale = 0;
    } else if (!this.hasLineOfSight || distance > def.preferredRange * 1.2) {
      if (hasNav) tmpDirection.copy(tmpNavDirection);
    } else {
      this.strafeTimer -= dt;
      if (this.strafeTimer <= 0) {
        this.strafeTimer = 1.5 + Math.random() * 2.5;
        this.strafeDirection = Math.random() < 0.5 ? -1 : 1;
      }
      tmpSide.set(-toPlayerDirection.z, 0, toPlayerDirection.x).multiplyScalar(this.strafeDirection);
      tmpDirection.copy(tmpSide);
      if (distance < def.preferredRange * 0.5) tmpDirection.addScaledVector(toPlayerDirection, -1);
      tmpDirection.normalize();
      speedScale = 0.55;
    }

    // 敵同士が重ならないように離す
    for (const other of context.enemies) {
      if (other === this || !other.isAlive) continue;
      const dx = this.position.x - other.position.x;
      const dz = this.position.z - other.position.z;
      const minDistance = def.radius + other.def.radius + 0.2;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq > 1e-6 && distanceSq < minDistance * minDistance) {
        const separation = (minDistance - Math.sqrt(distanceSq)) / minDistance;
        tmpDirection.x += (dx / Math.sqrt(distanceSq)) * separation * 1.5;
        tmpDirection.z += (dz / Math.sqrt(distanceSq)) * separation * 1.5;
      }
    }

    const targetVelocityX = tmpDirection.x * def.speed * speedScale;
    const targetVelocityZ = tmpDirection.z * def.speed * speedScale;
    const blend = 1 - Math.exp(-dt * 6);
    this.velocity.x += (targetVelocityX - this.velocity.x) * blend;
    this.velocity.z += (targetVelocityZ - this.velocity.z) * blend;
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this.position.y = 0;
    PushOutCircle(this.position, def.radius, def.height, context.colliders);
    this.PushOutFromPlayer(context.playerPosition);
    const limit = MAP_HALF_SIZE - def.radius;
    this.position.x = Clamp(this.position.x, -limit, limit);
    this.position.z = Clamp(this.position.z, -limit, limit);

    // 見た目の更新
    const moveAmount = Math.min(1, Math.hypot(this.velocity.x, this.velocity.z) / Math.max(0.1, def.speed));
    this.mesh.position.set(this.position.x, def.flyHeight, this.position.z);
    if (def.flyHeight > 0) this.mesh.position.y += Math.sin(this.time * 2.5) * 0.15;
    this.mesh.rotation.y = Math.atan2(toPlayerX, toPlayerZ);
    this.hitPulse = Math.max(0, this.hitPulse - dt * 6);
    this.mesh.scale.setScalar(1 + this.hitPulse * 0.12);
    this.model.Animate(this.time, moveAmount);

    if (this.healthBar.visible) {
      this.healthBar.position.set(this.mesh.position.x, this.mesh.position.y + this.GetBarHeight(), this.mesh.position.z);
      this.healthBar.quaternion.copy(context.camera.quaternion);
      this.healthFill.scale.x = Math.max(0.001, this.hp / this.maxHp);
    }

    this.UpdateAttack(dt, distance, context);
  }

  private UpdateAttack(dt: number, distance: number, context: EnemyContext): void {
    const def = this.def;
    this.fireTimer -= dt;

    if (def.kind === 'boss') {
      this.summonTimer -= dt;
      if (this.summonTimer <= 0) {
        this.summonTimer = 9 + Math.random() * 4;
        context.SummonBats(this, 2);
      }
    }

    if (def.meleeDamage > 0) {
      if (distance < def.radius + PLAYER_RADIUS + 0.6 && this.fireTimer <= 0) {
        this.fireTimer = def.fireIntervalMin + Math.random() * (def.fireIntervalMax - def.fireIntervalMin);
        context.MeleePlayer(this);
      }
      return;
    }

    if (this.fireTimer > 0 || !this.hasLineOfSight || distance > 40) return;
    this.fireTimer = def.fireIntervalMin + Math.random() * (def.fireIntervalMax - def.fireIntervalMin);

    this.GetEyePosition(tmpEye);
    // 距離に応じて狙いをばらつかせる（動き回れば避けられる）
    const inaccuracy = 0.4 + distance * 0.05;
    tmpTarget.set(
      context.playerTarget.x + (Math.random() - 0.5) * inaccuracy * 2,
      context.playerTarget.y + (Math.random() - 0.5) * inaccuracy,
      context.playerTarget.z + (Math.random() - 0.5) * inaccuracy * 2,
    );
    tmpDirection.subVectors(tmpTarget, tmpEye).normalize();
    if (def.projectileCount <= 1) {
      context.FireProjectile(this, tmpEye, tmpDirection);
      return;
    }
    // 扇状に複数発射
    const spreadAngle = 0.18;
    const baseAngle = Math.atan2(tmpDirection.x, tmpDirection.z);
    const horizontal = Math.hypot(tmpDirection.x, tmpDirection.z);
    for (let i = 0; i < def.projectileCount; i++) {
      const angle = baseAngle + (i - (def.projectileCount - 1) / 2) * spreadAngle;
      const direction = new THREE.Vector3(Math.sin(angle) * horizontal, tmpDirection.y, Math.cos(angle) * horizontal);
      context.FireProjectile(this, tmpEye, direction);
    }
  }

  private PushOutFromPlayer(playerPosition: THREE.Vector3): void {
    const minDistance = this.def.radius + PLAYER_RADIUS + 0.15;
    const dx = this.position.x - playerPosition.x;
    const dz = this.position.z - playerPosition.z;
    const distance = Math.hypot(dx, dz);
    if (distance >= minDistance) return;
    if (distance < 1e-4) {
      this.position.x += minDistance;
      return;
    }
    this.position.x = playerPosition.x + (dx / distance) * minDistance;
    this.position.z = playerPosition.z + (dz / distance) * minDistance;
  }

  GetEyePosition(out: THREE.Vector3): THREE.Vector3 {
    const heightOffset = this.def.flyHeight > 0 ? 0 : this.def.eyeHeight;
    return out.set(this.position.x, this.mesh.position.y + heightOffset, this.position.z);
  }

  private GetBarHeight(): number {
    switch (this.def.kind) {
      case 'pumpkin':
        return 2.05;
      case 'ghost':
        return 0.75;
      case 'bat':
        return 0.5;
      case 'boss':
        return 4.5;
    }
  }
}

/** Wave ごとの出現構成 */
export function BuildWaveComposition(wave: number): EnemyKind[] {
  const count = 4 + wave * 2;
  const result: EnemyKind[] = [];
  for (let i = 0; i < count; i++) {
    const roll = Math.random();
    if (wave >= 3 && roll < 0.25) result.push('bat');
    else if (wave >= 2 && roll < 0.55) result.push('ghost');
    else result.push('pumpkin');
  }
  // シャッフル
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  // 5 Wave ごとにボス（中盤に登場）
  if (wave % 5 === 0) {
    result.splice(Math.floor(result.length / 3), 0, 'boss');
  }
  return result;
}
