// 弾（敵の魔法弾・プレイヤーのロケット）

import * as THREE from 'three';
import { DistancePointToSegment, IntersectRaySphere, RaycastColliders } from './Collision';
import type { Collider, ColliderHit } from './Collision';
import type { Enemy } from './Enemy';
import { PLAYER_HIT_RADIUS } from './Config';

export interface Projectile {
  mesh: THREE.Mesh;
  /** 発射地点（被弾方向の表示に使う） */
  origin: THREE.Vector3;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  damage: number;
  radius: number;
  isFromPlayer: boolean;
  homing: number;
  explosionRadius: number;
  gravity: number;
  life: number;
  color: number;
}

export interface ProjectileContext {
  colliders: Collider[];
  enemies: Enemy[];
  playerSegmentBottom: THREE.Vector3;
  playerSegmentTop: THREE.Vector3;
  playerTarget: THREE.Vector3;
  OnHitPlayer: (projectile: Projectile) => void;
  OnHitCollider: (projectile: Projectile, hit: ColliderHit) => void;
  OnHitEnemy: (projectile: Projectile, enemy: Enemy, point: THREE.Vector3) => void;
  OnTrail: (projectile: Projectile) => void;
}

const sphereGeometry = new THREE.SphereGeometry(1, 10, 8);
const rocketGeometry = new THREE.CylinderGeometry(0.06, 0.06, 0.45, 8);
rocketGeometry.rotateX(Math.PI / 2);
const rocketMaterial = new THREE.MeshStandardMaterial({ color: 0x556b2f, emissive: 0x331100 });
const grenadeGeometry = new THREE.SphereGeometry(0.08, 10, 8);
const grenadeMaterial = new THREE.MeshStandardMaterial({ color: 0x4a5a2a, emissive: 0x221100 });

/** この水平距離より近づいた追尾弾は直進する */
const HOMING_STOP_DISTANCE = 5;

const tmpDirection = new THREE.Vector3();
const tmpCenter = new THREE.Vector3();

export class ProjectileSystem {
  private readonly scene: THREE.Scene;
  private readonly projectiles: Projectile[] = [];
  private readonly materialCache = new Map<number, THREE.MeshBasicMaterial>();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  SpawnEnemyProjectile(origin: THREE.Vector3, direction: THREE.Vector3, speed: number, damage: number, size: number, color: number, homing: number): void {
    let material = this.materialCache.get(color);
    if (!material) {
      material = new THREE.MeshBasicMaterial({ color });
      this.materialCache.set(color, material);
    }
    const mesh = new THREE.Mesh(sphereGeometry, material);
    mesh.scale.setScalar(size);
    mesh.position.copy(origin);
    this.scene.add(mesh);
    this.projectiles.push({
      mesh,
      origin: origin.clone(),
      position: origin.clone(),
      velocity: direction.clone().multiplyScalar(speed),
      damage,
      radius: size,
      isFromPlayer: false,
      homing,
      explosionRadius: 0,
      gravity: 0,
      life: 6,
      color,
    });
  }

  /** 爆発する弾（gravity が 0 ならまっすぐ飛ぶロケット、正ならグレネード） */
  SpawnExplosive(origin: THREE.Vector3, direction: THREE.Vector3, speed: number, damage: number, explosionRadius: number, gravity: number): void {
    const mesh = gravity > 0 ? new THREE.Mesh(grenadeGeometry, grenadeMaterial) : new THREE.Mesh(rocketGeometry, rocketMaterial);
    mesh.position.copy(origin);
    mesh.lookAt(origin.clone().add(direction));
    this.scene.add(mesh);
    this.projectiles.push({
      mesh,
      origin: origin.clone(),
      position: origin.clone(),
      velocity: direction.clone().multiplyScalar(speed),
      damage,
      radius: 0.1,
      isFromPlayer: true,
      homing: 0,
      explosionRadius,
      gravity,
      life: 5,
      color: 0xffa040,
    });
  }

  Clear(): void {
    for (const projectile of this.projectiles) this.scene.remove(projectile.mesh);
    this.projectiles.length = 0;
  }

  Update(dt: number, context: ProjectileContext): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const projectile = this.projectiles[i];
      projectile.life -= dt;
      if (projectile.life <= 0) {
        this.Remove(i);
        continue;
      }

      if (projectile.homing > 0) {
        // 追尾は水平方向のみ。近づいたら追尾をやめる（壁の裏へ回り込んで当たらないように）
        const dx = context.playerTarget.x - projectile.position.x;
        const dz = context.playerTarget.z - projectile.position.z;
        const horizontalDistance = Math.hypot(dx, dz);
        if (horizontalDistance > HOMING_STOP_DISTANCE) {
          const horizontalSpeed = Math.hypot(projectile.velocity.x, projectile.velocity.z);
          const blend = Math.min(1, projectile.homing * dt);
          const desiredX = (dx / horizontalDistance) * horizontalSpeed;
          const desiredZ = (dz / horizontalDistance) * horizontalSpeed;
          projectile.velocity.x += (desiredX - projectile.velocity.x) * blend;
          projectile.velocity.z += (desiredZ - projectile.velocity.z) * blend;
          const newHorizontalSpeed = Math.hypot(projectile.velocity.x, projectile.velocity.z);
          if (newHorizontalSpeed > 1e-4) {
            projectile.velocity.x *= horizontalSpeed / newHorizontalSpeed;
            projectile.velocity.z *= horizontalSpeed / newHorizontalSpeed;
          }
        }
      }

      const stepLength = projectile.velocity.length() * dt;
      tmpDirection.copy(projectile.velocity).normalize();

      // 障害物との衝突（高速な弾のすり抜け防止のため線分で判定）
      const wallHit = RaycastColliders(projectile.position, tmpDirection, stepLength + projectile.radius, context.colliders);
      let hitDistance = wallHit ? wallHit.distance : Infinity;

      if (projectile.isFromPlayer) {
        let hitEnemy: Enemy | null = null;
        for (const enemy of context.enemies) {
          if (!enemy.isAlive) continue;
          for (let s = 0; s < enemy.def.hitSpheres.length; s++) {
            enemy.GetHitSphereCenter(s, tmpCenter);
            const distance = IntersectRaySphere(projectile.position, tmpDirection, tmpCenter, enemy.def.hitSpheres[s].radius + projectile.radius);
            if (distance >= 0 && distance <= stepLength && distance < hitDistance) {
              hitDistance = distance;
              hitEnemy = enemy;
            }
          }
        }
        if (hitEnemy) {
          const point = projectile.position.clone().addScaledVector(tmpDirection, hitDistance);
          context.OnHitEnemy(projectile, hitEnemy, point);
          this.Remove(i);
          continue;
        }
      } else {
        const nextPosition = tmpCenter.copy(projectile.position).addScaledVector(tmpDirection, Math.min(stepLength, hitDistance));
        const distance = DistancePointToSegment(nextPosition, context.playerSegmentBottom, context.playerSegmentTop);
        // 弾の見た目の大きさは判定に少しだけ加える（壁の縁をかすめた弾が当たらないように）
        if (distance < PLAYER_HIT_RADIUS + projectile.radius * 0.3) {
          context.OnHitPlayer(projectile);
          this.Remove(i);
          continue;
        }
      }

      if (wallHit) {
        context.OnHitCollider(projectile, wallHit);
        this.Remove(i);
        continue;
      }

      projectile.velocity.y -= projectile.gravity * dt;
      projectile.position.addScaledVector(projectile.velocity, dt);
      projectile.mesh.position.copy(projectile.position);
      if (projectile.isFromPlayer) {
        projectile.mesh.lookAt(tmpCenter.copy(projectile.position).add(projectile.velocity));
      }
      context.OnTrail(projectile);
    }
  }

  private Remove(index: number): void {
    this.scene.remove(this.projectiles[index].mesh);
    this.projectiles.splice(index, 1);
  }
}
