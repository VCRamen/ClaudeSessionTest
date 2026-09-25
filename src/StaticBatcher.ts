// 動かない背景メッシュをマテリアルごとに 1 つへ結合して、描画命令（ドローコール）を減らす

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** userData.isDynamic が true のオブジェクト（とその子）は結合しない */
export function MarkDynamic(object: THREE.Object3D): void {
  object.userData.isDynamic = true;
}

function IsDynamic(object: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let current: THREE.Object3D | null = object; current && current !== root; current = current.parent) {
    if (current.userData.isDynamic) return true;
  }
  return false;
}

interface BatchEntry {
  material: THREE.Material;
  castShadow: boolean;
  geometries: THREE.BufferGeometry[];
}

/** マルチマテリアルのジオメトリを、マテリアルごとのジオメトリに分ける */
function SplitByGroups(geometry: THREE.BufferGeometry): { geometry: THREE.BufferGeometry; materialIndex: number }[] {
  const index = geometry.getIndex();
  if (!index || geometry.groups.length === 0) return [{ geometry, materialIndex: 0 }];
  return geometry.groups.map((group) => {
    const part = geometry.clone();
    part.setIndex(Array.from(index.array.slice(group.start, group.start + group.count)));
    part.clearGroups();
    return { geometry: part, materialIndex: group.materialIndex ?? 0 };
  });
}

/**
 * root 以下の静的なメッシュを結合する。root はワールド原点に置かれている前提。
 * 戻り値は結合前後のメッシュ数（確認用）
 */
export function BatchStaticMeshes(root: THREE.Object3D): { before: number; after: number } {
  root.updateMatrixWorld(true);
  const batches = new Map<string, BatchEntry>();
  const merged: THREE.Mesh[] = [];

  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || (mesh as unknown as THREE.InstancedMesh).isInstancedMesh || IsDynamic(mesh, root)) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const { geometry, materialIndex } of SplitByGroups(mesh.geometry)) {
      const material = materials[materialIndex] ?? materials[0];
      const key = `${material.uuid}-${mesh.castShadow}`;
      let entry = batches.get(key);
      if (!entry) {
        entry = { material, castShadow: mesh.castShadow, geometries: [] };
        batches.set(key, entry);
      }
      const transformed = (geometry === mesh.geometry ? geometry.clone() : geometry).applyMatrix4(mesh.matrixWorld);
      // 結合するには属性の種類を揃える必要がある
      for (const name of Object.keys(transformed.attributes)) {
        if (name !== 'position' && name !== 'normal' && name !== 'uv') transformed.deleteAttribute(name);
      }
      entry.geometries.push(transformed.index ? transformed.toNonIndexed() : transformed);
    }
    merged.push(mesh);
  });

  for (const mesh of merged) mesh.removeFromParent();
  for (const entry of batches.values()) {
    const geometry = mergeGeometries(entry.geometries, false);
    if (!geometry) continue;
    const batch = new THREE.Mesh(geometry, entry.material);
    batch.castShadow = entry.castShadow;
    batch.receiveShadow = true;
    root.add(batch);
  }
  return { before: merged.length, after: batches.size };
}

/** 複数の折れ線（電線など）を 1 つの LineSegments にまとめる */
export class WireBatch {
  private readonly positions: number[] = [];

  /** 2 点間を垂れ下がる線でつなぐ */
  AddSaggingWire(start: THREE.Vector3, end: THREE.Vector3, sag: number, segments = 12): void {
    let previous = start.clone();
    for (let i = 1; i <= segments; i++) {
      const t = i / segments;
      const point = start.clone().lerp(end, t);
      point.y -= Math.sin(t * Math.PI) * sag;
      this.positions.push(previous.x, previous.y, previous.z, point.x, point.y, point.z);
      previous = point;
    }
  }

  Build(color: number): THREE.LineSegments {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    return new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color }));
  }
}
