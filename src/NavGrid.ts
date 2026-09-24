// グリッド上のフローフィールド（プレイヤーからの BFS 距離）で敵を誘導する

import * as THREE from 'three';
import { MAP_HALF_SIZE } from './Config';
import type { Collider } from './Collision';

const UNREACHABLE = 0x7fffffff;
const CELL_SIZE = 1;
const OBSTACLE_MARGIN = 0.55;
const NEIGHBOR_OFFSETS: [number, number][] = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

export class NavGrid {
  readonly size: number;
  private readonly blocked: Uint8Array;
  private readonly distance: Int32Array;
  private readonly queue: Int32Array;
  private targetCell = -1;

  constructor() {
    this.size = Math.ceil((MAP_HALF_SIZE * 2) / CELL_SIZE);
    const count = this.size * this.size;
    this.blocked = new Uint8Array(count);
    this.distance = new Int32Array(count).fill(UNREACHABLE);
    this.queue = new Int32Array(count);
  }

  Rebuild(colliders: Collider[]): void {
    this.blocked.fill(0);
    for (const collider of colliders) {
      const box = collider.box;
      const minX = this.ToCellCoord(box.min.x - OBSTACLE_MARGIN);
      const maxX = this.ToCellCoord(box.max.x + OBSTACLE_MARGIN);
      const minZ = this.ToCellCoord(box.min.z - OBSTACLE_MARGIN);
      const maxZ = this.ToCellCoord(box.max.z + OBSTACLE_MARGIN);
      for (let cz = minZ; cz <= maxZ; cz++) {
        for (let cx = minX; cx <= maxX; cx++) {
          if (cx < 0 || cz < 0 || cx >= this.size || cz >= this.size) continue;
          const centerX = this.ToWorld(cx);
          const centerZ = this.ToWorld(cz);
          if (
            centerX > box.min.x - OBSTACLE_MARGIN &&
            centerX < box.max.x + OBSTACLE_MARGIN &&
            centerZ > box.min.z - OBSTACLE_MARGIN &&
            centerZ < box.max.z + OBSTACLE_MARGIN
          ) {
            this.blocked[cz * this.size + cx] = 1;
          }
        }
      }
    }
    this.targetCell = -1;
  }

  /** 目標地点（プレイヤー）からの距離場を再計算する */
  UpdateTarget(position: THREE.Vector3): void {
    let startCell = this.GetCellIndex(position.x, position.z);
    if (startCell < 0) return;
    if (this.blocked[startCell]) startCell = this.FindNearestOpenCell(startCell);
    if (startCell < 0 || startCell === this.targetCell) return;
    this.targetCell = startCell;

    this.distance.fill(UNREACHABLE);
    let head = 0;
    let tail = 0;
    this.distance[startCell] = 0;
    this.queue[tail++] = startCell;
    while (head < tail) {
      const cell = this.queue[head++];
      const cx = cell % this.size;
      const cz = (cell - cx) / this.size;
      const nextDistance = this.distance[cell] + 1;
      for (let i = 0; i < 4; i++) {
        const nx = cx + NEIGHBOR_OFFSETS[i][0];
        const nz = cz + NEIGHBOR_OFFSETS[i][1];
        if (nx < 0 || nz < 0 || nx >= this.size || nz >= this.size) continue;
        const neighbor = nz * this.size + nx;
        if (this.blocked[neighbor] || this.distance[neighbor] <= nextDistance) continue;
        this.distance[neighbor] = nextDistance;
        this.queue[tail++] = neighbor;
      }
    }
  }

  /** 目標へ向かう移動方向（XZ 平面の単位ベクトル）を out に入れる */
  GetMoveDirection(position: THREE.Vector3, out: THREE.Vector3): boolean {
    const cell = this.GetCellIndex(position.x, position.z);
    if (cell < 0) return false;
    const cx = cell % this.size;
    const cz = (cell - cx) / this.size;

    let bestDistance = this.blocked[cell] ? UNREACHABLE : this.distance[cell];
    let bestX = -1;
    let bestZ = -1;
    for (const [ox, oz] of NEIGHBOR_OFFSETS) {
      const nx = cx + ox;
      const nz = cz + oz;
      if (nx < 0 || nz < 0 || nx >= this.size || nz >= this.size) continue;
      const neighbor = nz * this.size + nx;
      if (this.blocked[neighbor]) continue;
      // 斜め移動は角をすり抜けないようにする
      if (ox !== 0 && oz !== 0) {
        if (this.blocked[cz * this.size + nx] || this.blocked[nz * this.size + cx]) continue;
      }
      const neighborDistance = this.distance[neighbor];
      if (neighborDistance < bestDistance) {
        bestDistance = neighborDistance;
        bestX = nx;
        bestZ = nz;
      }
    }
    if (bestX < 0) return false;
    out.set(this.ToWorld(bestX) - position.x, 0, this.ToWorld(bestZ) - position.z);
    const length = out.length();
    if (length < 1e-4) return false;
    out.divideScalar(length);
    return true;
  }

  IsBlockedAt(x: number, z: number): boolean {
    const cell = this.GetCellIndex(x, z);
    return cell < 0 || this.blocked[cell] === 1;
  }

  private FindNearestOpenCell(cell: number): number {
    const cx = cell % this.size;
    const cz = (cell - cx) / this.size;
    for (let radius = 1; radius < 6; radius++) {
      for (let oz = -radius; oz <= radius; oz++) {
        for (let ox = -radius; ox <= radius; ox++) {
          const nx = cx + ox;
          const nz = cz + oz;
          if (nx < 0 || nz < 0 || nx >= this.size || nz >= this.size) continue;
          const neighbor = nz * this.size + nx;
          if (!this.blocked[neighbor]) return neighbor;
        }
      }
    }
    return -1;
  }

  private GetCellIndex(x: number, z: number): number {
    const cx = this.ToCellCoord(x);
    const cz = this.ToCellCoord(z);
    if (cx < 0 || cz < 0 || cx >= this.size || cz >= this.size) return -1;
    return cz * this.size + cx;
  }

  private ToCellCoord(value: number): number {
    return Math.floor((value + MAP_HALF_SIZE) / CELL_SIZE);
  }

  private ToWorld(cellCoord: number): number {
    return (cellCoord + 0.5) * CELL_SIZE - MAP_HALF_SIZE;
  }
}
