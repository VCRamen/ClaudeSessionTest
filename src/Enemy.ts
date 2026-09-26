// 敵の定義と AI

import * as THREE from 'three';
import { MAP_HALF_SIZE, PLAYER_RADIUS, WAVES_PER_STAGE } from './Config';
import { Clamp, HasLineOfSight, PushOutCircle } from './Collision';
import type { Collider } from './Collision';
import type { NavGrid } from './NavGrid';
import type { Perch } from './Level';
import { BuildBatModel, BuildGhostModel, BuildPumpkinKingModel, BuildPumpkinModel, BuildWitchModel } from './EnemyModels';
import type { EnemyModel } from './EnemyModels';

export type EnemyKind = 'pumpkin' | 'ghost' | 'bat' | 'boss' | 'witch';

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
  /** 1 回の攻撃で続けて撃つ回数（魔女は 3 連射） */
  projectileBurst: number;
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
    projectileBurst: 1, projectileCount: 1, meleeDamage: 0, reward: 15, eyeHeight: 1.4,
    hitSpheres: [
      { offset: new THREE.Vector3(0, 0.65, 0), radius: 0.45, damageMultiplier: 1 },
      { offset: new THREE.Vector3(0, 1.38, 0), radius: 0.4, damageMultiplier: 2 },
    ],
  },
  ghost: {
    kind: 'ghost', name: 'ゴースト', hp: 45, speed: 3.4, radius: 0.45, height: 1.2, flyHeight: 1.4,
    preferredRange: 9, fireIntervalMin: 2.0, fireIntervalMax: 3.2,
    projectileSpeed: 9, projectileDamage: 6, projectileColor: 0xb66bff, projectileSize: 0.22, projectileHoming: 1.2,
    projectileBurst: 1, projectileCount: 1, meleeDamage: 0, reward: 20, eyeHeight: 0,
    hitSpheres: [{ offset: new THREE.Vector3(0, -0.1, 0), radius: 0.55, damageMultiplier: 1 }],
  },
  bat: {
    kind: 'bat', name: 'バット', hp: 25, speed: 6.5, radius: 0.35, height: 0.6, flyHeight: 1.5,
    preferredRange: 0, fireIntervalMin: 1.1, fireIntervalMax: 1.5,
    projectileSpeed: 0, projectileDamage: 0, projectileColor: 0, projectileSize: 0, projectileHoming: 0,
    projectileBurst: 1, projectileCount: 0, meleeDamage: 6, reward: 10, eyeHeight: 0,
    hitSpheres: [{ offset: new THREE.Vector3(0, 0, 0), radius: 0.38, damageMultiplier: 1 }],
  },
  witch: {
    kind: 'witch', name: '魔女', hp: 55, speed: 3.0, radius: 0.4, height: 1.8, flyHeight: 0,
    preferredRange: 14, fireIntervalMin: 2.6, fireIntervalMax: 3.6,
    projectileSpeed: 11, projectileDamage: 6, projectileColor: 0xb040ff, projectileSize: 0.2, projectileHoming: 0.5,
    projectileBurst: 3, projectileCount: 1, meleeDamage: 0, reward: 25, eyeHeight: 1.45,
    hitSpheres: [
      { offset: new THREE.Vector3(0, 0.6, 0), radius: 0.42, damageMultiplier: 1 },
      { offset: new THREE.Vector3(0, 1.45, 0), radius: 0.3, damageMultiplier: 2 },
    ],
  },
  boss: {
    kind: 'boss', name: 'パンプキンキング', hp: 1500, speed: 1.7, radius: 1.1, height: 4, flyHeight: 0,
    preferredRange: 16, fireIntervalMin: 2.0, fireIntervalMax: 2.8,
    projectileSpeed: 13, projectileDamage: 12, projectileColor: 0xff3300, projectileSize: 0.3, projectileHoming: 0,
    projectileBurst: 1, projectileCount: 5, meleeDamage: 0, reward: 300, eyeHeight: 2.9,
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
  /** 回り込み役の枠を求める。枠の数は制限され、倒されると空く */
  RequestFlankToken: (enemy: Enemy) => boolean;
}

/** 見失ってから回り込みを始めるまでの待ち時間 */
const FLANK_DELAY_MIN = 2.0;
const FLANK_DELAY_MAX = 3.5;
/** 連射の間隔 */
const BURST_INTERVAL = 0.2;
/** 高所から飛び降りるのにかかる時間（魔女はふわりと降りる） */
const DESCENT_TIME = 0.9;
const WITCH_DESCENT_TIME = 1.6;
/** 高所の敵は地上の敵より少しゆっくり撃つ（見つけるまでに時間がかかるため） */
const PERCH_FIRE_INTERVAL_SCALE = 1.25;
/** コウモリが噛みついた後に離れている時間 */
const BAT_RETREAT_TIME_MIN = 2.0;
const BAT_RETREAT_TIME_MAX = 3.0;

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
  /** ベランダなどの高所に陣取っている場合の立ち位置（動かずに撃ってくる。降りたら null） */
  perch: Perch | null;
  /** 高所から降りている途中の経過時間（降りていなければ負） */
  private descentElapsed = -1;
  /** 連射の残り回数と、次の弾までの時間 */
  private burstRemaining = 0;
  private burstTimer = 0;

  private readonly model: EnemyModel;
  private readonly healthFill: THREE.Mesh;
  private readonly velocity = new THREE.Vector3();
  private fireTimer: number;
  private losTimer = 0;
  private hasLineOfSight = false;
  private readonly strafePhase = Math.random() * Math.PI * 2;
  /** コウモリが攻撃後に離れている残り時間 */
  private retreatTimer = 0;
  private retreatSide = 1;
  private lostSightTimer = 0;
  private flankDelay = FLANK_DELAY_MIN;
  private isFlanking = false;
  private summonTimer = 6;
  private time = Math.random() * 10;
  private hitPulse = 0;

  constructor(kind: EnemyKind, position: THREE.Vector3, wave: number, perch: Perch | null = null) {
    this.def = ENEMY_DEFS[kind];
    this.perch = perch;
    this.position = perch ? perch.position.clone().setY(0) : position.clone();
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
      case 'witch':
        this.model = BuildWitchModel();
        break;
    }
    this.mesh = this.model.group;
    this.mesh.position.copy(this.position);
    this.mesh.position.y = this.GetBaseHeight();

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

  /** 足元の高さ（高所の敵はベランダの床、飛ぶ敵は浮いている高さ） */
  private GetBaseHeight(): number {
    return (this.perch ? this.perch.position.y : 0) + this.def.flyHeight;
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

    if (this.perch) {
      if (this.descentElapsed >= 0) this.UpdateDescent(dt, toPlayerX, toPlayerZ, context);
      else this.UpdatePerched(dt, distance, toPlayerX, toPlayerZ, context);
      return;
    }

    // 移動方向の決定
    tmpDirection.set(0, 0, 0);
    const hasNav = context.nav.GetMoveDirection(this.position, tmpNavDirection);
    const toPlayerDirection = tmpTarget.set(toPlayerX, 0, toPlayerZ).normalize();
    let speedScale = 1;
    if (def.kind === 'bat') {
      this.retreatTimer = Math.max(0, this.retreatTimer - dt);
      if (this.retreatTimer > 0) {
        // 噛みついた後は一度離れる（斜め後ろへ）
        tmpSide.set(-toPlayerDirection.z, 0, toPlayerDirection.x).multiplyScalar(this.retreatSide * 0.6);
        tmpDirection.copy(toPlayerDirection).multiplyScalar(-1).add(tmpSide).normalize();
        speedScale = 0.8;
      } else {
        if (this.hasLineOfSight && distance < 10) tmpDirection.copy(toPlayerDirection);
        else if (hasNav) tmpDirection.copy(tmpNavDirection);
        if (distance < def.radius + PLAYER_RADIUS + 0.3) speedScale = 0;
      }
    } else if (this.hasLineOfSight) {
      // 見えている間は持ち場を守る（遠ければ前進、近すぎれば後退、それ以外は小さく左右に揺れるだけ）
      this.lostSightTimer = 0;
      if (distance > def.preferredRange * 1.2) {
        if (hasNav) tmpDirection.copy(tmpNavDirection);
      } else {
        const sway = Math.sin(this.time * 1.2 + this.strafePhase);
        tmpSide.set(-toPlayerDirection.z, 0, toPlayerDirection.x);
        tmpDirection.copy(tmpSide).multiplyScalar(sway);
        if (distance < def.preferredRange * 0.5) tmpDirection.addScaledVector(toPlayerDirection, -1);
        speedScale = 0.35;
      }
    } else if (distance > def.preferredRange * 1.1) {
      // 射程外で見えない：射程に入るまではプレイヤーに向かって前進（見失った後も同じ）
      this.lostSightTimer = 0;
      if (hasNav) tmpDirection.copy(tmpNavDirection);
    } else {
      // 射程内なのに見えない＝物陰に隠れている。ここからは回り込み制限の対象
      // 見失った：しばらく様子を見てから、回り込み役の枠を得た敵だけ回り込む
      // （回り込み役は倒されるまでその役割を持ち続け、他の敵は正面で待機する）
      if (this.lostSightTimer === 0) this.flankDelay = FLANK_DELAY_MIN + Math.random() * (FLANK_DELAY_MAX - FLANK_DELAY_MIN);
      this.lostSightTimer += dt;
      if (this.isFlanking || (this.lostSightTimer >= this.flankDelay && context.RequestFlankToken(this))) {
        this.isFlanking = true;
        if (hasNav) tmpDirection.copy(tmpNavDirection);
      }
    }

    // 敵同士が重ならないように離す
    for (const other of context.enemies) {
      if (other === this || !other.isAlive || other.perch) continue;
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
    this.mesh.position.set(this.position.x, this.GetBaseHeight(), this.position.z);
    if (def.flyHeight > 0) this.mesh.position.y += Math.sin(this.time * 2.5) * 0.15;
    this.mesh.rotation.y = Math.atan2(toPlayerX, toPlayerZ);
    this.hitPulse = Math.max(0, this.hitPulse - dt * 6);
    this.mesh.scale.setScalar(1 + this.hitPulse * 0.12);
    this.model.Animate(this.time, moveAmount);

    this.UpdateHealthBar(context);

    this.UpdateAttack(dt, distance, context);
  }

  /** 高所から飛び降りて、地上の敵として向かってくる（残りの敵が少なくなったとき） */
  StartDescent(): void {
    if (!this.perch || this.descentElapsed >= 0) return;
    this.descentElapsed = 0;
    this.burstRemaining = 0;
  }

  IsDescending(): boolean {
    return this.descentElapsed >= 0;
  }

  /** 飛び降りている途中：ベランダから落ちる位置へ放物線を描いて降りる */
  private UpdateDescent(dt: number, toPlayerX: number, toPlayerZ: number, context: EnemyContext): void {
    const perch = this.perch!;
    const duration = this.def.kind === 'witch' ? WITCH_DESCENT_TIME : DESCENT_TIME;
    this.descentElapsed += dt;
    const t = Math.min(1, this.descentElapsed / duration);
    const from = perch.position;
    const to = perch.dropPosition;
    this.position.set(from.x + (to.x - from.x) * t, 0, from.z + (to.z - from.z) * t);
    // 魔女はゆっくり降り、他は一度跳ねてから落ちる
    const height = this.def.kind === 'witch'
      ? from.y * (1 - t) * (1 - t * 0.3)
      : from.y * (1 - t * t) + Math.sin(t * Math.PI) * 0.8;
    this.mesh.position.set(this.position.x, Math.max(0, height) + this.def.flyHeight, this.position.z);
    this.mesh.rotation.y = Math.atan2(toPlayerX, toPlayerZ);
    this.model.Animate(this.time, 1);
    this.UpdateHealthBar(context);
    if (t < 1) return;
    // 着地：ここからは地上の敵と同じように動く
    this.perch = null;
    this.descentElapsed = -1;
    PushOutCircle(this.position, this.def.radius, this.def.height, context.colliders);
    this.fireTimer = 0.8 + Math.random() * 1.2;
    this.losTimer = 0;
  }

  /** 高所の敵：その場から動かず、プレイヤーの方を向いて撃つ */
  private UpdatePerched(dt: number, distance: number, toPlayerX: number, toPlayerZ: number, context: EnemyContext): void {
    this.mesh.position.set(this.position.x, this.GetBaseHeight(), this.position.z);
    this.mesh.rotation.y = Math.atan2(toPlayerX, toPlayerZ);
    this.hitPulse = Math.max(0, this.hitPulse - dt * 6);
    this.mesh.scale.setScalar(1 + this.hitPulse * 0.12);
    this.model.Animate(this.time, 0);
    this.UpdateHealthBar(context);
    this.UpdateAttack(dt, distance, context);
  }

  private UpdateHealthBar(context: EnemyContext): void {
    if (!this.healthBar.visible) return;
    this.healthBar.position.set(this.mesh.position.x, this.mesh.position.y + this.GetBarHeight(), this.mesh.position.z);
    this.healthBar.quaternion.copy(context.camera.quaternion);
    this.healthFill.scale.x = Math.max(0.001, this.hp / this.maxHp);
  }

  private UpdateAttack(dt: number, distance: number, context: EnemyContext): void {
    const def = this.def;
    this.fireTimer -= dt;
    this.UpdateBurst(dt, context);

    if (def.kind === 'boss') {
      this.summonTimer -= dt;
      if (this.summonTimer <= 0) {
        this.summonTimer = 9 + Math.random() * 4;
        context.SummonBats(this, 2);
      }
    }

    if (def.meleeDamage > 0) {
      if (this.retreatTimer <= 0 && distance < def.radius + PLAYER_RADIUS + 0.6 && this.fireTimer <= 0) {
        this.fireTimer = def.fireIntervalMin + Math.random() * (def.fireIntervalMax - def.fireIntervalMin);
        context.MeleePlayer(this);
        // ヒット＆アウェイ：一度離れてから、しばらくして再び襲ってくる
        this.retreatTimer = BAT_RETREAT_TIME_MIN + Math.random() * (BAT_RETREAT_TIME_MAX - BAT_RETREAT_TIME_MIN);
        this.retreatSide = Math.random() < 0.5 ? -1 : 1;
      }
      return;
    }

    if (this.fireTimer > 0 || !this.hasLineOfSight || distance > 40) return;
    // 視線チェックは間引いているので、撃つ直前にもう一度確かめる（隠れた直後に撃たれないように）
    this.GetEyePosition(tmpEye);
    this.hasLineOfSight = HasLineOfSight(tmpEye, context.playerTarget, context.colliders);
    if (!this.hasLineOfSight) return;
    this.fireTimer = def.fireIntervalMin + Math.random() * (def.fireIntervalMax - def.fireIntervalMin);
    if (this.perch) this.fireTimer *= PERCH_FIRE_INTERVAL_SCALE;
    if (def.projectileBurst > 1) {
      this.burstRemaining = def.projectileBurst - 1;
      this.burstTimer = BURST_INTERVAL;
    }
    this.FireVolley(distance, context);
  }

  /** 連射の 2 発目以降（撃つ直前にまだ見えているか確かめる） */
  private UpdateBurst(dt: number, context: EnemyContext): void {
    if (this.burstRemaining <= 0) return;
    this.burstTimer -= dt;
    if (this.burstTimer > 0) return;
    this.burstTimer = BURST_INTERVAL;
    this.burstRemaining--;
    this.GetEyePosition(tmpEye);
    if (!HasLineOfSight(tmpEye, context.playerTarget, context.colliders)) {
      this.burstRemaining = 0;
      return;
    }
    const distance = Math.hypot(context.playerPosition.x - this.position.x, context.playerPosition.z - this.position.z);
    this.FireVolley(distance, context);
  }

  /** 1 回分の射撃（扇状に撃つ敵は複数発） */
  private FireVolley(distance: number, context: EnemyContext): void {
    const def = this.def;
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
      case 'witch':
        return 2.35;
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
  // ステージの最後の Wave にボス（中盤に登場）
  if (wave % WAVES_PER_STAGE === 0) {
    result.splice(Math.floor(result.length / 3), 0, 'boss');
  }
  return result;
}
