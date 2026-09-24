// AABB ベースの簡易コリジョン・レイキャスト

import * as THREE from 'three';
import { STEP_HEIGHT } from './Config';
import type { Barrel } from './Barrel';

export interface Collider {
  box: THREE.Box3;
  barrel: Barrel | null;
}

export interface ColliderHit {
  distance: number;
  point: THREE.Vector3;
  normal: THREE.Vector3;
  collider: Collider;
}

const tmpRay = new THREE.Ray();
const tmpPoint = new THREE.Vector3();

export function Clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** 足元位置 position の円柱（半径 radius・高さ height）を箱から押し出す */
export function PushOutCircle(position: THREE.Vector3, radius: number, height: number, colliders: Collider[]): void {
  for (const collider of colliders) {
    const box = collider.box;
    if (box.max.y <= position.y + STEP_HEIGHT || position.y + height <= box.min.y) continue;

    const closestX = Clamp(position.x, box.min.x, box.max.x);
    const closestZ = Clamp(position.z, box.min.z, box.max.z);
    const dx = position.x - closestX;
    const dz = position.z - closestZ;
    const distanceSq = dx * dx + dz * dz;
    if (distanceSq >= radius * radius) continue;

    if (distanceSq > 1e-8) {
      const distance = Math.sqrt(distanceSq);
      const push = radius - distance;
      position.x += (dx / distance) * push;
      position.z += (dz / distance) * push;
    } else {
      // 中心が箱の内側にある場合は最短の面へ押し出す
      const toMinX = position.x - box.min.x;
      const toMaxX = box.max.x - position.x;
      const toMinZ = position.z - box.min.z;
      const toMaxZ = box.max.z - position.z;
      const minDistance = Math.min(toMinX, toMaxX, toMinZ, toMaxZ);
      if (minDistance === toMinX) position.x = box.min.x - radius;
      else if (minDistance === toMaxX) position.x = box.max.x + radius;
      else if (minDistance === toMinZ) position.z = box.min.z - radius;
      else position.z = box.max.z + radius;
    }
  }
}

/** 足元の地面の高さ（段差として乗れる箱の天面も含む） */
export function GetGroundHeight(position: THREE.Vector3, radius: number, colliders: Collider[]): number {
  let ground = 0;
  const shrink = radius * 0.7;
  for (const collider of colliders) {
    const box = collider.box;
    if (box.max.y > position.y + STEP_HEIGHT) continue;
    if (position.x + shrink < box.min.x || position.x - shrink > box.max.x) continue;
    if (position.z + shrink < box.min.z || position.z - shrink > box.max.z) continue;
    if (box.max.y > ground) ground = box.max.y;
  }
  return ground;
}

export function GetBoxNormal(box: THREE.Box3, point: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  const epsilon = 0.02;
  out.set(0, 1, 0);
  if (Math.abs(point.x - box.min.x) < epsilon) out.set(-1, 0, 0);
  else if (Math.abs(point.x - box.max.x) < epsilon) out.set(1, 0, 0);
  else if (Math.abs(point.z - box.min.z) < epsilon) out.set(0, 0, -1);
  else if (Math.abs(point.z - box.max.z) < epsilon) out.set(0, 0, 1);
  else if (Math.abs(point.y - box.min.y) < epsilon) out.set(0, -1, 0);
  return out;
}

export function RaycastColliders(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  maxDistance: number,
  colliders: Collider[],
): ColliderHit | null {
  tmpRay.origin.copy(origin);
  tmpRay.direction.copy(direction);
  let best: ColliderHit | null = null;
  let bestDistance = maxDistance;
  for (const collider of colliders) {
    if (!tmpRay.intersectBox(collider.box, tmpPoint)) continue;
    const distance = tmpPoint.distanceTo(origin);
    if (distance >= bestDistance) continue;
    bestDistance = distance;
    best = { distance, point: tmpPoint.clone(), normal: new THREE.Vector3(), collider };
  }
  if (best) GetBoxNormal(best.collider.box, best.point, best.normal);

  // 地面との交差
  if (direction.y < -1e-6) {
    const groundDistance = -origin.y / direction.y;
    if (groundDistance >= 0 && groundDistance < bestDistance) {
      return {
        distance: groundDistance,
        point: origin.clone().addScaledVector(direction, groundDistance),
        normal: new THREE.Vector3(0, 1, 0),
        collider: GROUND_COLLIDER,
      };
    }
  }
  return best;
}

export const GROUND_COLLIDER: Collider = {
  box: new THREE.Box3(new THREE.Vector3(-1e5, -1, -1e5), new THREE.Vector3(1e5, 0, 1e5)),
  barrel: null,
};

const losDirection = new THREE.Vector3();

export function HasLineOfSight(from: THREE.Vector3, to: THREE.Vector3, colliders: Collider[]): boolean {
  losDirection.subVectors(to, from);
  const length = losDirection.length();
  if (length < 1e-4) return true;
  losDirection.divideScalar(length);
  tmpRay.origin.copy(from);
  tmpRay.direction.copy(losDirection);
  for (const collider of colliders) {
    if (!tmpRay.intersectBox(collider.box, tmpPoint)) continue;
    if (tmpPoint.distanceTo(from) < length) return false;
  }
  return true;
}

/** 点が膨張させた箱の中にあれば、その箱を返す */
export function FindColliderAtPoint(point: THREE.Vector3, colliders: Collider[], margin = 0): Collider | null {
  for (const collider of colliders) {
    const box = collider.box;
    if (
      point.x >= box.min.x - margin &&
      point.x <= box.max.x + margin &&
      point.y >= box.min.y - margin &&
      point.y <= box.max.y + margin &&
      point.z >= box.min.z - margin &&
      point.z <= box.max.z + margin
    ) {
      return collider;
    }
  }
  return null;
}

/** レイと球の交差距離（交差しなければ -1） */
export function IntersectRaySphere(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  center: THREE.Vector3,
  radius: number,
): number {
  const ocX = origin.x - center.x;
  const ocY = origin.y - center.y;
  const ocZ = origin.z - center.z;
  const b = ocX * direction.x + ocY * direction.y + ocZ * direction.z;
  const c = ocX * ocX + ocY * ocY + ocZ * ocZ - radius * radius;
  const discriminant = b * b - c;
  if (discriminant < 0) return -1;
  const sqrtD = Math.sqrt(discriminant);
  const t0 = -b - sqrtD;
  if (t0 >= 0) return t0;
  const t1 = -b + sqrtD;
  return t1 >= 0 ? 0 : -1;
}

/** 点と線分の距離 */
export function DistancePointToSegment(point: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): number {
  const abX = b.x - a.x;
  const abY = b.y - a.y;
  const abZ = b.z - a.z;
  const lengthSq = abX * abX + abY * abY + abZ * abZ;
  let t = 0;
  if (lengthSq > 1e-8) {
    t = ((point.x - a.x) * abX + (point.y - a.y) * abY + (point.z - a.z) * abZ) / lengthSq;
    t = Clamp(t, 0, 1);
  }
  const dx = a.x + abX * t - point.x;
  const dy = a.y + abY * t - point.y;
  const dz = a.z + abZ * t - point.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
