// 壁や遮蔽物への張り付き（カバー）で使う判定

import * as THREE from 'three';
import { RaycastColliders } from './Collision';
import type { Collider } from './Collision';

/** これより低い遮蔽物は「低いカバー」（しゃがんで隠れ、立ち上がって撃つ） */
export const LOW_COVER_MAX_HEIGHT = 1.6;
/** 張り付ける遮蔽物の最低の高さ（しゃがんだ頭が隠れる高さ） */
const MIN_COVER_HEIGHT = 1.0;
/** 張り付きを探す距離 */
const COVER_SEARCH_DISTANCE = 1.4;

export interface CoverSpot {
  collider: Collider;
  /** 壁の面の法線（壁からプレイヤー側へ向く、水平な単位ベクトル） */
  normal: THREE.Vector3;
  /** 壁に沿った方向（normal を 90 度回したもの） */
  tangent: THREE.Vector3;
  /** 壁の面の位置（normal 方向の座標） */
  faceDistance: number;
  /** 壁の面の、tangent 方向の範囲 */
  minT: number;
  maxT: number;
  isLow: boolean;
}

const tmpOrigin = new THREE.Vector3();

/** position から direction 方向に、張り付ける壁があるか調べる */
export function FindCover(position: THREE.Vector3, direction: THREE.Vector3, colliders: Collider[]): CoverSpot | null {
  tmpOrigin.set(position.x, position.y + 0.6, position.z);
  const hit = RaycastColliders(tmpOrigin, direction, COVER_SEARCH_DISTANCE, colliders);
  if (!hit || hit.collider.barrel || Math.abs(hit.normal.y) > 0.5) return null;
  const box = hit.collider.box;
  if (box.min.y > 0.1 || box.max.y < MIN_COVER_HEIGHT) return null;

  const normal = hit.normal.clone().setY(0).normalize();
  const tangent = new THREE.Vector3(-normal.z, 0, normal.x);
  const faceDistance = normal.x > 0.5 ? box.max.x : normal.x < -0.5 ? -box.min.x : normal.z > 0.5 ? box.max.z : -box.min.z;
  const t1 = box.min.x * tangent.x + box.min.z * tangent.z;
  const t2 = box.max.x * tangent.x + box.max.z * tangent.z;
  return {
    collider: hit.collider,
    normal,
    tangent,
    faceDistance,
    minT: Math.min(t1, t2),
    maxT: Math.max(t1, t2),
    isLow: box.max.y < LOW_COVER_MAX_HEIGHT,
  };
}
