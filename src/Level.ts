// マップ：ハロウィン飾りの商店街。十字の大通りと、4 つの区画（路地・神社のある公園・駐車場）からなる
//
// 各区画は「区画ローカル座標」(a, b) で定義する。a は大通りの中心線からの x 方向の距離、
// b は z 方向の距離で、区画ごとに符号（sx, sz）を掛けてワールド座標にする。

import * as THREE from 'three';
import { MAP_HALF_SIZE } from './Config';
import { Barrel } from './Barrel';
import type { Collider } from './Collision';
import {
  BuildAutumnTree, BuildBackAlleyFacade, BuildBarricade, BuildBench, BuildBicycle, BuildBlockWall, BuildCar,
  BuildChalkboardSign, BuildCrateStack, BuildGarbageBags, BuildHedge, BuildJackOLantern, BuildManhole,
  BuildPaperLantern, BuildParkingMeter, BuildPlanter, BuildShop, BuildShrine, BuildStoneLantern, BuildStreetLamp,
  BuildTorii, BuildUtilityPole, BuildVendingMachine, SHOP_STYLES,
} from './CityProps';
import { CreateBuntingTexture, CreateDuskSkyTexture, CreatePavingTexture, CreateSidewalkTexture } from './CityTextures';
import { BatchStaticMeshes, MarkDynamic, WireBatch } from './StaticBatcher';

/** 大通りの半幅（歩道を含む） */
const MAIN_HALF_WIDTH = 5;
/** 歩道が始まる位置（大通りの中心からの距離） */
const SIDEWALK_START = 3.7;
/** 見た目上、大通りがマップの外までどこまで続くか */
const VISUAL_STREET_LENGTH = 62;
/** 区画の建物をマップの外側へどこまで伸ばすか（外周の裏側が見えないように） */
const BLOCK_OUTER = 36;
const BUILDING_DEPTH = 6;
const WALL_COLORS = [0x8a6a52, 0x6f7a6a, 0x9a7b5c, 0x7d5d4a, 0x6a6070, 0x8c8278, 0x5f6a78];

/** 4 本の大通り（北・南・西・東）。along は中心から外へ向かう方向 */
const ARMS = [
  new THREE.Vector3(0, 0, -1),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(1, 0, 0),
];

type QuadrantKind = 'alleys' | 'park' | 'parking';

interface Quadrant {
  sx: number;
  sz: number;
  kind: QuadrantKind;
}

/** 区画の配置（北西・北東・南東・南西）。北は -z */
const QUADRANTS: Quadrant[] = [
  { sx: -1, sz: -1, kind: 'alleys' },
  { sx: 1, sz: -1, kind: 'park' },
  { sx: 1, sz: 1, kind: 'alleys' },
  { sx: -1, sz: 1, kind: 'parking' },
];

/** 区画ローカル座標の長方形 [aMin, aMax, bMin, bMax] */
type LocalRect = [number, number, number, number];

/** 区画の種類ごとの建物ブロック（隙間が路地や広場になる） */
const QUADRANT_BLOCKS: Record<QuadrantKind, LocalRect[]> = {
  // 風車のような形に路地が走る
  alleys: [[5, 13.5, 5, 13.5], [17.5, BLOCK_OUTER, 5, 12.5], [5, 12.5, 17.5, BLOCK_OUTER], [16.5, BLOCK_OUTER, 16.5, BLOCK_OUTER]],
  park: [[5, 13.5, 5, 13.5], [17.5, BLOCK_OUTER, 5, 11.5], [5, 11.5, 17.5, BLOCK_OUTER]],
  parking: [[5, 13.5, 5, 13.5], [5, 12.5, 17.5, BLOCK_OUTER], [24, BLOCK_OUTER, 5, 10]],
};

type PropKind =
  | 'planter' | 'crates' | 'vending' | 'bench' | 'bicycle' | 'chalkboard' | 'manhole' | 'barrel' | 'propane'
  | 'garbage' | 'car' | 'hedge' | 'tree' | 'stoneLantern' | 'parkingMeter' | 'pumpkin';

/** 小物の配置。大通りでは (u, v) = (通りを横切る方向, 中心からの距離)、区画では (a, b) */
interface PropPlacement {
  kind: PropKind;
  x: number;
  y: number;
  /** プランターの長さ・コンテナの段数・生け垣の長さなど */
  size?: number;
  /** 90 度回して置く（プランターなら通りを横切る向き＝正面からの弾を防ぐ） */
  isRotated?: boolean;
  /** 区画内の自販機などの正面の向き（区画ローカルの方向 [a, b]） */
  facing?: [number, number];
}

/** 大通りの小物（2 パターンを交互に使う）。路地の入口（v = 13〜18）の歩道はあけておく */
const ARM_LAYOUTS: PropPlacement[][] = [
  [
    { kind: 'planter', x: -2.6, y: 8, size: 2.2, isRotated: true },
    { kind: 'crates', x: 2.3, y: 10.5, size: 3 },
    { kind: 'vending', x: 4.45, y: 8.3 },
    { kind: 'crates', x: -0.6, y: 15.5, size: 2 },
    { kind: 'planter', x: 2.6, y: 20.5, size: 2.2, isRotated: true },
    { kind: 'crates', x: -2.2, y: 24.5, size: 3 },
    { kind: 'bench', x: -4.6, y: 20.5 },
    { kind: 'bicycle', x: 4.5, y: 25 },
    { kind: 'chalkboard', x: -4.2, y: 10.5 },
    { kind: 'manhole', x: 0.8, y: 19 },
    { kind: 'barrel', x: 4.3, y: 21.8 },
    { kind: 'barrel', x: -4.3, y: 27.5 },
    { kind: 'propane', x: -4.2, y: 12 },
  ],
  [
    { kind: 'planter', x: 2.6, y: 8.5, size: 2.2, isRotated: true },
    { kind: 'crates', x: -2.3, y: 11, size: 3 },
    { kind: 'vending', x: -4.45, y: 8.8 },
    { kind: 'crates', x: 0.8, y: 16, size: 2 },
    { kind: 'planter', x: -2.6, y: 21, size: 2.2, isRotated: true },
    { kind: 'crates', x: 2.0, y: 25, size: 3 },
    { kind: 'bench', x: 4.6, y: 21 },
    { kind: 'bicycle', x: -4.5, y: 24.5 },
    { kind: 'bicycle', x: -4.5, y: 25.4 },
    { kind: 'chalkboard', x: 4.2, y: 11.5 },
    { kind: 'manhole', x: -0.8, y: 20 },
    { kind: 'barrel', x: -4.3, y: 23 },
    { kind: 'barrel', x: 4.3, y: 27.5 },
    { kind: 'propane', x: 4.2, y: 11.5 },
  ],
];

/** 区画ごとの小物（区画ローカル座標） */
const QUADRANT_PROPS: Record<QuadrantKind, PropPlacement[]> = {
  alleys: [
    { kind: 'crates', x: 15.5, y: 8.5, size: 3 },
    { kind: 'propane', x: 14.1, y: 11 },
    { kind: 'barrel', x: 16.9, y: 6.8 },
    { kind: 'garbage', x: 16.8, y: 12.2 },
    { kind: 'crates', x: 9, y: 15.5, size: 3, isRotated: true },
    { kind: 'barrel', x: 6.6, y: 16.9 },
    { kind: 'bicycle', x: 11.4, y: 14.1, isRotated: true },
    { kind: 'crates', x: 23, y: 14.5, size: 3, isRotated: true },
    { kind: 'propane', x: 27, y: 13.1 },
    { kind: 'garbage', x: 20, y: 15.9 },
    { kind: 'crates', x: 14.5, y: 23, size: 3 },
    { kind: 'barrel', x: 13.1, y: 26 },
    { kind: 'vending', x: 16.05, y: 19.5, facing: [-1, 0] },
  ],
  park: [
    { kind: 'hedge', x: 15.2, y: 19, size: 4.4 },
    { kind: 'hedge', x: 21, y: 14.5, size: 4, isRotated: true },
    { kind: 'tree', x: 14.5, y: 25 },
    { kind: 'tree', x: 19.5, y: 27.5 },
    { kind: 'tree', x: 27.5, y: 14 },
    { kind: 'stoneLantern', x: 23.6, y: 20.8 },
    { kind: 'stoneLantern', x: 28.9, y: 20.8 },
    { kind: 'bench', x: 18, y: 22.5 },
    { kind: 'barrel', x: 13.8, y: 16.3 },
    { kind: 'propane', x: 22.5, y: 26 },
    { kind: 'pumpkin', x: 17.2, y: 18.3 },
    { kind: 'pumpkin', x: 16.4, y: 18.4 },
    { kind: 'crates', x: 25, y: 12.8, size: 3 },
  ],
  parking: [
    { kind: 'car', x: 16.5, y: 15.5 },
    { kind: 'car', x: 22, y: 15.5 },
    { kind: 'car', x: 27.5, y: 15.5 },
    { kind: 'car', x: 16.5, y: 24.5 },
    { kind: 'car', x: 27.5, y: 24.5 },
    { kind: 'car', x: 19.5, y: 9, isRotated: true },
    { kind: 'parkingMeter', x: 14.2, y: 6.2, facing: [1, 0] },
    { kind: 'vending', x: 23.55, y: 7.2, facing: [-1, 0] },
    { kind: 'crates', x: 22, y: 21.5, size: 3, isRotated: true },
    { kind: 'barrel', x: 13.8, y: 19.5 },
    { kind: 'propane', x: 22, y: 27.5 },
    { kind: 'garbage', x: 25, y: 11 },
  ],
};

/** 区画ごとの敵の出現口（区画ローカル座標）と、どの辺に属するか */
const QUADRANT_SPAWNS: Record<QuadrantKind, { a: number; b: number; edge: 'x' | 'z' }[]> = {
  alleys: [{ a: 14.5, b: 28, edge: 'z' }, { a: 28, b: 14.5, edge: 'x' }],
  park: [{ a: 18, b: 28, edge: 'z' }, { a: 28, b: 18, edge: 'x' }],
  parking: [{ a: 20, b: 28, edge: 'z' }, { a: 28, b: 20, edge: 'x' }],
};

interface SpawnPoint {
  position: THREE.Vector3;
  side: THREE.Vector3;
}

/** ワールド座標の長方形 */
interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export class Level {
  readonly group = new THREE.Group();
  /** 静的な障害物 + 生存中の樽 */
  readonly colliders: Collider[] = [];
  readonly barrels: Barrel[] = [];
  readonly spawnPoints: THREE.Vector3[] = [];
  readonly playerStart = new THREE.Vector3(0, 0, 3);

  private readonly staticColliders: Collider[] = [];
  private readonly spawns: SpawnPoint[] = [];
  private readonly blocks: Rect[] = [];
  private readonly portalMeshes: THREE.Mesh[] = [];
  private readonly lanterns: THREE.Object3D[] = [];
  private readonly wires = new WireBatch();
  private readonly buntingMatrices: THREE.Matrix4[][] = [[], []];
  private styleIndex = 0;
  private time = 0;

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
    this.BuildSkyAndLighting(scene);
    this.CollectBlocks();
    this.BuildGround();
    this.BuildBlockBuildings();
    this.BuildMainStreets();
    this.BuildQuadrants();
    this.BuildIntersection();
    this.BuildMapEdges();
    this.BuildBunting();
    this.BuildSpawnGates();
    this.group.add(this.wires.Build(0x1a1418));

    // 動くもの以外をまとめて描画負荷を下げる
    for (const object of [...this.lanterns, ...this.portalMeshes, ...this.barrels.map((barrel) => barrel.mesh)]) {
      MarkDynamic(object);
    }
    BatchStaticMeshes(this.group);
    this.RefreshColliders();
  }

  Update(dt: number): void {
    this.time += dt;
    for (let i = 0; i < this.portalMeshes.length; i++) {
      const portal = this.portalMeshes[i];
      portal.rotation.z += dt * 0.8;
      const material = portal.material as THREE.MeshBasicMaterial;
      material.opacity = 0.45 + Math.sin(this.time * 3 + i) * 0.15;
    }
    // 提灯が風で少し揺れる
    for (let i = 0; i < this.lanterns.length; i++) {
      this.lanterns[i].rotation.z = Math.sin(this.time * 1.7 + i * 1.3) * 0.08;
    }
  }

  /** side 方向（東西南北）の辺にある出現口 */
  GetSpawnPointsOnSide(side: THREE.Vector3): THREE.Vector3[] {
    return this.spawns.filter((spawn) => spawn.side.dot(side) > 0.9).map((spawn) => spawn.position);
  }

  /** 壊れた樽を復活させる（近くにいるキャラと重ならないものだけ） */
  RespawnBarrels(blockingPositions: THREE.Vector3[]): void {
    for (const barrel of this.barrels) {
      if (barrel.isAlive) continue;
      const isBlocked = blockingPositions.some(
        (position) => Math.hypot(position.x - barrel.position.x, position.z - barrel.position.z) < 1.5,
      );
      if (!isBlocked) barrel.Respawn();
    }
    this.RefreshColliders();
  }

  RefreshColliders(): void {
    this.colliders.length = 0;
    this.colliders.push(...this.staticColliders);
    for (const barrel of this.barrels) {
      if (barrel.isAlive) this.colliders.push(barrel.collider);
    }
  }

  // ------------------------------------------------------------
  // 座標変換
  // ------------------------------------------------------------

  /** 大通りを横切る方向（along を 90 度回したもの） */
  private static GetAcross(along: THREE.Vector3): THREE.Vector3 {
    return new THREE.Vector3(-along.z, 0, along.x);
  }

  /** 大通りのローカル座標（u, v）をワールド座標へ */
  private static ArmToWorld(along: THREE.Vector3, u: number, v: number): THREE.Vector3 {
    return Level.GetAcross(along).multiplyScalar(u).addScaledVector(along, v);
  }

  private static QuadrantToWorld(quadrant: Quadrant, a: number, b: number): THREE.Vector3 {
    return new THREE.Vector3(quadrant.sx * a, 0, quadrant.sz * b);
  }

  private static QuadrantRect(quadrant: Quadrant, [aMin, aMax, bMin, bMax]: LocalRect): Rect {
    const x1 = quadrant.sx * aMin;
    const x2 = quadrant.sx * aMax;
    const z1 = quadrant.sz * bMin;
    const z2 = quadrant.sz * bMax;
    return { minX: Math.min(x1, x2), maxX: Math.max(x1, x2), minZ: Math.min(z1, z2), maxZ: Math.max(z1, z2) };
  }

  /** 物体の正面（+Z）を direction に向けるための Y 回転 */
  private static FacingRotation(direction: THREE.Vector3): number {
    return Math.atan2(direction.x, direction.z);
  }

  private IsInsideBlock(x: number, z: number): boolean {
    return this.blocks.some((block) => x > block.minX && x < block.maxX && z > block.minZ && z < block.maxZ);
  }

  /** プレイヤーが歩ける場所か（マップ内で、建物の中でない） */
  private IsWalkable(x: number, z: number): boolean {
    return Math.abs(x) < MAP_HALF_SIZE && Math.abs(z) < MAP_HALF_SIZE && !this.IsInsideBlock(x, z);
  }

  // ------------------------------------------------------------
  // 構築
  // ------------------------------------------------------------

  private BuildSkyAndLighting(scene: THREE.Scene): void {
    scene.background = new THREE.Color(0x3a2a5e);
    scene.fog = new THREE.FogExp2(0x8a5a78, 0.013);

    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(220, 24, 16),
      new THREE.MeshBasicMaterial({ map: CreateDuskSkyTexture(), side: THREE.BackSide, fog: false }),
    );
    scene.add(sky);

    scene.add(new THREE.HemisphereLight(0xa8a0ff, 0x6a4a3a, 1.5));

    // 夕日（低い角度から差し込むオレンジの光）
    const sun = new THREE.DirectionalLight(0xffa868, 2.2);
    sun.position.set(-30, 22, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const shadowCamera = sun.shadow.camera;
    const shadowRange = MAP_HALF_SIZE + 6;
    shadowCamera.left = -shadowRange;
    shadowCamera.right = shadowRange;
    shadowCamera.top = shadowRange;
    shadowCamera.bottom = -shadowRange;
    shadowCamera.near = 1;
    shadowCamera.far = 120;
    sun.shadow.bias = -0.0008;
    scene.add(sun);
  }

  /** 建物ブロック（区画のブロック・外周・大通りの延長部分）を集めて当たり判定を作る */
  private CollectBlocks(): void {
    for (const quadrant of QUADRANTS) {
      for (const localRect of QUADRANT_BLOCKS[quadrant.kind]) {
        this.blocks.push(Level.QuadrantRect(quadrant, localRect));
      }
    }
    // 大通りの延長部分（マップの外）の両側の建物
    for (const along of ARMS) {
      for (const side of [-1, 1]) {
        const p1 = Level.ArmToWorld(along, side * MAIN_HALF_WIDTH, MAP_HALF_SIZE);
        const p2 = Level.ArmToWorld(along, side * (MAIN_HALF_WIDTH + 12), VISUAL_STREET_LENGTH);
        this.blocks.push({
          minX: Math.min(p1.x, p2.x), maxX: Math.max(p1.x, p2.x), minZ: Math.min(p1.z, p2.z), maxZ: Math.max(p1.z, p2.z),
        });
      }
    }
    // 外周のブロック塀の向こうに見える建物
    const ringInner = MAP_HALF_SIZE + 3;
    const ringOuter = MAP_HALF_SIZE + 11;
    for (const sign of [-1, 1]) {
      for (const [from, to] of [[-ringOuter, -MAIN_HALF_WIDTH - 12], [MAIN_HALF_WIDTH + 12, ringOuter]]) {
        const inner = sign * ringInner;
        const outer = sign * ringOuter;
        this.blocks.push({ minX: from, maxX: to, minZ: Math.min(inner, outer), maxZ: Math.max(inner, outer) });
        this.blocks.push({ minX: Math.min(inner, outer), maxX: Math.max(inner, outer), minZ: from, maxZ: to });
      }
    }
    for (const block of this.blocks) {
      this.staticColliders.push({
        box: new THREE.Box3(new THREE.Vector3(block.minX, 0, block.minZ), new THREE.Vector3(block.maxX, 12, block.maxZ)),
        barrel: null,
      });
    }
  }

  private BuildGround(): void {
    const size = VISUAL_STREET_LENGTH * 2 + 10;
    this.group.add(this.CreateGroundPlane(CreatePavingTexture(), size, size, 0, 0, 0));

    // 大通りの歩道と縁石
    const sidewalkTexture = CreateSidewalkTexture();
    const curbMaterial = new THREE.MeshStandardMaterial({ color: 0xb8b0a4, roughness: 0.8 });
    const sidewalkWidth = MAIN_HALF_WIDTH - SIDEWALK_START;
    for (const along of ARMS) {
      for (const side of [-1, 1]) {
        const length = VISUAL_STREET_LENGTH - MAIN_HALF_WIDTH;
        const center = Level.ArmToWorld(along, side * (SIDEWALK_START + sidewalkWidth / 2), MAIN_HALF_WIDTH + length / 2);
        const isAlongZ = Math.abs(along.z) > 0.5;
        this.group.add(this.CreateGroundPlane(sidewalkTexture, isAlongZ ? sidewalkWidth : length, isAlongZ ? length : sidewalkWidth, center.x, center.z, 0.006));
        const curb = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, length), curbMaterial);
        const curbPosition = Level.ArmToWorld(along, side * SIDEWALK_START, MAIN_HALF_WIDTH + length / 2);
        curb.position.set(curbPosition.x, 0.05, curbPosition.z);
        curb.rotation.y = Level.FacingRotation(along);
        curb.receiveShadow = true;
        this.group.add(curb);
      }
    }
  }

  private CreateGroundPlane(texture: THREE.Texture, width: number, depth: number, x: number, z: number, y: number, color = 0xffffff): THREE.Mesh {
    const tiled = texture.clone();
    tiled.repeat.set(width / 4, depth / 4);
    tiled.needsUpdate = true;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, depth),
      new THREE.MeshStandardMaterial({ map: tiled, roughness: 0.9, color }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    return mesh;
  }

  /** 各ブロックの、歩ける場所に面した壁に店や建物の裏側を並べる */
  private BuildBlockBuildings(): void {
    for (const block of this.blocks) {
      const faces: { normal: THREE.Vector3; start: THREE.Vector3; end: THREE.Vector3 }[] = [
        { normal: new THREE.Vector3(0, 0, -1), start: new THREE.Vector3(block.maxX, 0, block.minZ), end: new THREE.Vector3(block.minX, 0, block.minZ) },
        { normal: new THREE.Vector3(0, 0, 1), start: new THREE.Vector3(block.minX, 0, block.maxZ), end: new THREE.Vector3(block.maxX, 0, block.maxZ) },
        { normal: new THREE.Vector3(-1, 0, 0), start: new THREE.Vector3(block.minX, 0, block.minZ), end: new THREE.Vector3(block.minX, 0, block.maxZ) },
        { normal: new THREE.Vector3(1, 0, 0), start: new THREE.Vector3(block.maxX, 0, block.maxZ), end: new THREE.Vector3(block.maxX, 0, block.minZ) },
      ];
      for (const face of faces) this.BuildFacadesOnFace(face.normal, face.start, face.end);
    }
  }

  private BuildFacadesOnFace(normal: THREE.Vector3, start: THREE.Vector3, end: THREE.Vector3): void {
    const length = start.distanceTo(end);
    const direction = end.clone().sub(start).normalize();
    // 面の前が見える場所（歩ける場所か、大通りの延長部分）になっている区間を探す
    const IsVisibleAt = (t: number) => {
      const point = start.clone().addScaledVector(direction, t).addScaledVector(normal, 1.0);
      if (this.IsInsideBlock(point.x, point.z)) return false;
      const isInMap = Math.abs(point.x) < MAP_HALF_SIZE && Math.abs(point.z) < MAP_HALF_SIZE;
      const isOnMainStreet = Math.abs(point.x) < MAIN_HALF_WIDTH || Math.abs(point.z) < MAIN_HALF_WIDTH;
      const isInRing = Math.abs(point.x) < MAP_HALF_SIZE + 3 && Math.abs(point.z) < MAP_HALF_SIZE + 3;
      return isInMap || (isOnMainStreet && Math.max(Math.abs(point.x), Math.abs(point.z)) < VISUAL_STREET_LENGTH) || isInRing;
    };
    let runStart = -1;
    for (let t = 0.5; t <= length + 0.5; t += 1) {
      const isVisible = t < length && IsVisibleAt(t);
      if (isVisible && runStart < 0) runStart = t - 0.5;
      if (!isVisible && runStart >= 0) {
        this.PlaceFacadeRun(normal, start, direction, runStart, Math.min(length, t - 0.5));
        runStart = -1;
      }
    }
  }

  /** 1 つの面の区間 [from, to] に建物を並べる */
  private PlaceFacadeRun(normal: THREE.Vector3, start: THREE.Vector3, direction: THREE.Vector3, from: number, to: number): void {
    let t = from;
    while (to - t >= 2) {
      const remaining = to - t;
      let width = 4.5 + Math.random() * 2.5;
      if (remaining - width < 2) width = remaining;
      const center = start.clone().addScaledVector(direction, t + width / 2);
      const facesMainStreet = Math.abs(center.x + normal.x * 2) < MAIN_HALF_WIDTH || Math.abs(center.z + normal.z * 2) < MAIN_HALF_WIDTH;
      const isOuterRing = Math.max(Math.abs(center.x), Math.abs(center.z)) > MAP_HALF_SIZE + 2 && !facesMainStreet;
      const height = isOuterRing ? 9 + Math.random() * 5 : 6.5 + Math.random() * 3.5;
      // 大通りと広場に面した側は店、狭い路地や外周は建物の裏側
      const isShop = facesMainStreet || (!isOuterRing && this.styleIndex % 3 !== 0);
      const building = isShop
        ? BuildShop(width, height, BUILDING_DEPTH, SHOP_STYLES[this.styleIndex % SHOP_STYLES.length])
        : BuildBackAlleyFacade(width, height, BUILDING_DEPTH, WALL_COLORS[this.styleIndex % WALL_COLORS.length], this.styleIndex);
      this.styleIndex += 3;
      if (isShop) this.lanterns.push(...((building.userData.swingingObjects as THREE.Object3D[] | undefined) ?? []));
      building.position.copy(center);
      building.rotation.y = Level.FacingRotation(normal);
      this.group.add(building);
      t += width;
    }
  }

  private BuildMainStreets(): void {
    ARMS.forEach((along, armIndex) => {
      const across = Level.GetAcross(along);
      for (const placement of ARM_LAYOUTS[armIndex % ARM_LAYOUTS.length]) {
        const position = Level.ArmToWorld(along, placement.x, placement.y);
        this.PlaceProp(placement, position, along, across.clone().multiplyScalar(-Math.sign(placement.x) || 1));
      }

      // 街灯（マップ内の 1 本だけ本物の光源を持つ）
      const lampSpots: [number, number][] = [[-4.6, 6.5], [4.6, 22.8], [-4.6, 36], [4.6, 48]];
      lampSpots.forEach(([u, v], index) => {
        const lamp = BuildStreetLamp();
        const position = Level.ArmToWorld(along, u, v);
        lamp.position.copy(position);
        lamp.rotation.y = Level.FacingRotation(across.clone().multiplyScalar(-Math.sign(u)));
        this.group.add(lamp);
        if (v < MAP_HALF_SIZE) this.AddColliderBox(position.x, position.z, 0.3, 0.3, 4.2);
        if (index === 0) {
          lamp.updateMatrixWorld(true);
          this.AddPointLight(lamp.localToWorld((lamp.userData.lightPosition as THREE.Vector3).clone()), 0xffb060, 12);
        }
      });

      // 電柱と電線
      const poleDistances = [18.5, 28.5, 41, 54];
      const poleSide = armIndex % 2 === 0 ? 1 : -1;
      const polePositions = poleDistances.map((v) => {
        const pole = BuildUtilityPole();
        const position = Level.ArmToWorld(along, poleSide * 4.75, v);
        pole.position.copy(position);
        pole.rotation.y = Level.FacingRotation(along);
        this.group.add(pole);
        if (v < MAP_HALF_SIZE) this.AddColliderBox(position.x, position.z, 0.36, 0.36, 9);
        return position;
      });
      for (let i = 0; i < polePositions.length - 1; i++) {
        for (const offset of [-0.7, 0.7]) {
          const start = polePositions[i].clone().addScaledVector(across, offset).setY(8.35);
          const end = polePositions[i + 1].clone().addScaledVector(across, offset).setY(8.35);
          this.wires.AddSaggingWire(start, end, 0.6);
        }
        const crossStart = polePositions[i].clone().setY(7.65);
        const crossEnd = Level.ArmToWorld(along, -poleSide * MAIN_HALF_WIDTH, poleDistances[i]).setY(7.2);
        this.wires.AddSaggingWire(crossStart, crossEnd, 0.8);
      }

      // 大通りを横切るガーランド
      for (const v of [10.5, 19.5, 26.5, 38, 50]) {
        const height = 5.6 + (v % 3) * 0.2;
        this.AddBuntingString(
          Level.ArmToWorld(along, -MAIN_HALF_WIDTH + 0.1, v).setY(height),
          Level.ArmToWorld(along, MAIN_HALF_WIDTH - 0.1, v).setY(height),
          0.5,
        );
      }

      // 通りの突き当たりの建物（遠景）
      const endShop = BuildShop(MAIN_HALF_WIDTH * 2 + 2, 11, BUILDING_DEPTH, SHOP_STYLES[(armIndex * 3 + 2) % SHOP_STYLES.length]);
      endShop.position.copy(along.clone().multiplyScalar(VISUAL_STREET_LENGTH));
      endShop.rotation.y = Level.FacingRotation(along.clone().negate());
      this.group.add(endShop);
    });
  }

  private BuildQuadrants(): void {
    for (const quadrant of QUADRANTS) {
      for (const placement of QUADRANT_PROPS[quadrant.kind]) {
        const position = Level.QuadrantToWorld(quadrant, placement.x, placement.y);
        // 区画内の小物は x 軸方向を基準に置く
        const facing = placement.facing
          ? new THREE.Vector3(quadrant.sx * placement.facing[0], 0, quadrant.sz * placement.facing[1])
          : new THREE.Vector3(0, 0, -quadrant.sz);
        this.PlaceProp(placement, position, new THREE.Vector3(1, 0, 0), facing);
      }

      if (quadrant.kind === 'alleys') this.DecorateAlleys(quadrant);
      if (quadrant.kind === 'park') this.DecoratePark(quadrant);
      if (quadrant.kind === 'parking') this.DecorateParking(quadrant);

      for (const spawn of QUADRANT_SPAWNS[quadrant.kind]) {
        this.spawns.push({
          position: Level.QuadrantToWorld(quadrant, spawn.a, spawn.b),
          side: spawn.edge === 'x' ? new THREE.Vector3(quadrant.sx, 0, 0) : new THREE.Vector3(0, 0, quadrant.sz),
        });
      }
    }
    for (const along of ARMS) {
      for (const u of [-2, 2]) this.spawns.push({ position: Level.ArmToWorld(along, u, MAP_HALF_SIZE - 2), side: along.clone() });
    }
    this.spawnPoints.push(...this.spawns.map((spawn) => spawn.position));
  }

  /** 路地：提灯を吊るした紐と、交差部分の明かり */
  private DecorateAlleys(quadrant: Quadrant): void {
    const Q = (a: number, b: number, y: number) => Level.QuadrantToWorld(quadrant, a, b).setY(y);
    this.AddBuntingString(Q(13.6, 9, 4.2), Q(17.4, 9, 4.2), 0.3);
    this.AddBuntingString(Q(9, 13.6, 4.4), Q(9, 17.4, 4.4), 0.3);
    this.AddBuntingString(Q(22, 12.6, 4.2), Q(22, 16.4, 4.2), 0.3);
    this.AddBuntingString(Q(12.6, 22, 4.3), Q(16.4, 22, 4.3), 0.3);
    for (const [a, b] of [[15.5, 13], [13, 15.5], [15, 15]]) {
      const lantern = BuildPaperLantern();
      lantern.position.copy(Q(a, b, 3.6));
      this.group.add(lantern);
      this.lanterns.push(lantern);
    }
    this.AddPointLight(Q(15, 15, 3.8), 0xff8a50, 8);
  }

  /** 公園：神社（鳥居・社殿）と地面 */
  private DecoratePark(quadrant: Quadrant): void {
    const Q = (a: number, b: number) => Level.QuadrantToWorld(quadrant, a, b);
    const dirt = this.CreateGroundPlane(CreateSidewalkTexture(), 18.5, 18.5, 0, 0, 0.004, 0x9a8a6a);
    const center = Q(11.5 + 18.5 / 2, 11.5 + 18.5 / 2);
    dirt.position.set(center.x, 0.004, center.z);
    this.group.add(dirt);

    // 社殿（区画の奥）。正面は大通り側を向く
    const shrineCenter = Q(26.25, 26.25);
    const shrine = BuildShrine(4.4, 4.0);
    shrine.position.copy(shrineCenter);
    shrine.rotation.y = Level.FacingRotation(new THREE.Vector3(0, 0, -quadrant.sz));
    this.group.add(shrine);
    this.lanterns.push(...((shrine.userData.swingingObjects as THREE.Object3D[] | undefined) ?? []));
    this.AddColliderBox(shrineCenter.x, shrineCenter.z, 5.0, 4.6, 4);

    // 鳥居（柱だけ当たり判定がある）
    const toriiCenter = Q(26.25, 19.8);
    const torii = BuildTorii();
    torii.position.copy(toriiCenter);
    torii.rotation.y = Level.FacingRotation(new THREE.Vector3(0, 0, -quadrant.sz));
    this.group.add(torii);
    for (const offset of [-1.2, 1.2]) this.AddColliderBox(toriiCenter.x + offset, toriiCenter.z, 0.4, 0.4, 3.6);
    this.AddPointLight(Q(26.25, 22.5).setY(3), 0xffa050, 8);
  }

  /** 駐車場：アスファルトと白線 */
  private DecorateParking(quadrant: Quadrant): void {
    const Q = (a: number, b: number) => Level.QuadrantToWorld(quadrant, a, b);
    const asphalt = this.CreateGroundPlane(CreatePavingTexture(), 17, 25, 0, 0, 0.004, 0x55505a);
    const center = Q(13 + 17 / 2, 5 + 25 / 2);
    asphalt.position.set(center.x, 0.004, center.z);
    this.group.add(asphalt);
    // 駐車枠の白線（車の列の間）
    const lineMaterial = new THREE.MeshBasicMaterial({ color: 0xe8e4d8 });
    for (const b of [15.5, 24.5]) {
      for (const a of [13.8, 19.25, 24.75]) {
        const line = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 5.2), lineMaterial);
        line.rotation.x = -Math.PI / 2;
        const position = Q(a, b);
        line.position.set(position.x, 0.01, position.z);
        this.group.add(line);
      }
    }
  }

  private BuildIntersection(): void {
    const planter = BuildPlanter(2.2, 2.2, 1.1);
    this.group.add(planter);
    this.AddColliderBox(0, 0, 2.2, 2.2, 1.1);
    const tree = BuildAutumnTree(0.9);
    tree.position.y = 1.1;
    this.group.add(tree);
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const pumpkin = BuildJackOLantern(1.2);
      pumpkin.position.set(Math.sin(angle) * 0.75, 1.1, Math.cos(angle) * 0.75);
      pumpkin.rotation.y = angle;
      this.group.add(pumpkin);
    }
    for (const [x, z] of [[3.3, -3.4], [-3.3, 3.4]]) {
      const crates = BuildCrateStack(3, Math.abs(x) > 0 ? 1 : 2);
      crates.position.set(x, 0, z);
      crates.rotation.y = Math.PI / 4;
      this.group.add(crates);
      this.AddColliderBox(x, z, 1.0, 1.0, 1.2);
    }
    const corner = MAIN_HALF_WIDTH - 0.1;
    this.AddBuntingString(new THREE.Vector3(-corner, 6.3, -corner), new THREE.Vector3(corner, 6.3, corner), 0.8);
    this.AddBuntingString(new THREE.Vector3(corner, 6.3, -corner), new THREE.Vector3(-corner, 6.3, corner), 0.8);
  }

  /** マップの端：大通りは工事用バリケード、それ以外はブロック塀 */
  private BuildMapEdges(): void {
    for (const along of ARMS) {
      const barricade = BuildBarricade(MAIN_HALF_WIDTH * 2);
      barricade.position.copy(along.clone().multiplyScalar(MAP_HALF_SIZE + 0.4));
      barricade.rotation.y = Level.FacingRotation(along.clone().negate());
      this.group.add(barricade);
    }
    // 外周に沿って歩ける場所が続く区間にブロック塀を立てる
    const edge = MAP_HALF_SIZE + 0.2;
    for (const along of ARMS) {
      const across = Level.GetAcross(along);
      let runStart: number | null = null;
      for (let u = -MAP_HALF_SIZE; u <= MAP_HALF_SIZE; u += 0.5) {
        const inside = Level.ArmToWorld(along, u, MAP_HALF_SIZE - 0.5);
        const needsWall = u < MAP_HALF_SIZE && Math.abs(u) > MAIN_HALF_WIDTH && this.IsWalkable(inside.x, inside.z);
        if (needsWall && runStart === null) runStart = u;
        if (!needsWall && runStart !== null) {
          const length = u - runStart;
          const wall = BuildBlockWall(length);
          const position = Level.ArmToWorld(along, runStart + length / 2, edge);
          wall.position.copy(position);
          // 塀の長さ方向（ローカル X）を外周に沿わせる
          wall.rotation.y = Math.atan2(-across.z, across.x);
          this.group.add(wall);
          runStart = null;
        }
      }
    }
  }

  /** ハロウィンのガーランドを紐に並べる（最後に InstancedMesh でまとめて描く） */
  private AddBuntingString(start: THREE.Vector3, end: THREE.Vector3, sag: number): void {
    this.wires.AddSaggingWire(start, end, sag);
    const length = start.distanceTo(end);
    const count = Math.floor(length / 0.55);
    const direction = end.clone().sub(start).normalize();
    const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), direction);
    const scale = new THREE.Vector3(1, 1, 1);
    for (let i = 1; i < count; i++) {
      const t = i / count;
      const point = start.clone().lerp(end, t);
      point.y -= Math.sin(t * Math.PI) * sag + 0.21;
      this.buntingMatrices[i % 2].push(new THREE.Matrix4().compose(point, quaternion, scale));
    }
  }

  private BuildBunting(): void {
    const flagGeometry = new THREE.PlaneGeometry(0.42, 0.42);
    this.buntingMatrices.forEach((matrices, kind) => {
      const material = new THREE.MeshStandardMaterial({
        map: CreateBuntingTexture(kind),
        transparent: true,
        alphaTest: 0.5,
        side: THREE.DoubleSide,
        roughness: 0.8,
      });
      const instanced = new THREE.InstancedMesh(flagGeometry, material, matrices.length);
      matrices.forEach((matrix, index) => instanced.setMatrixAt(index, matrix));
      instanced.instanceMatrix.needsUpdate = true;
      this.group.add(instanced);
    });
  }

  private BuildSpawnGates(): void {
    const portalGeometry = new THREE.RingGeometry(0.8, 1.6, 24, 1, 0, Math.PI * 1.6);
    for (const point of this.spawnPoints) {
      const portal = new THREE.Mesh(
        portalGeometry,
        new THREE.MeshBasicMaterial({ color: 0x9b30ff, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }),
      );
      portal.rotation.x = -Math.PI / 2;
      portal.position.set(point.x, 0.03, point.z);
      this.group.add(portal);
      this.portalMeshes.push(portal);
    }
  }

  /**
   * 小物を置く。along はその場所の「通りの向き」、towardCenter は通りの中央側（壁から離れる向き）
   */
  private PlaceProp(placement: PropPlacement, position: THREE.Vector3, along: THREE.Vector3, towardCenter: THREE.Vector3): void {
    const across = Level.GetAcross(along);
    const alongRotation = Level.FacingRotation(along);
    const rotated = placement.isRotated === true;
    /** along 方向の長さ、across 方向の長さから当たり判定を作る */
    const AddCollider = (alongLength: number, acrossLength: number, height: number) => {
      const halfX = Math.abs(along.x) * (alongLength / 2) + Math.abs(across.x) * (acrossLength / 2);
      const halfZ = Math.abs(along.z) * (alongLength / 2) + Math.abs(across.z) * (acrossLength / 2);
      this.AddColliderBox(position.x, position.z, halfX * 2, halfZ * 2, height);
    };
    let object: THREE.Object3D | null = null;

    switch (placement.kind) {
      case 'planter': {
        const length = placement.size ?? 3;
        object = BuildPlanter(1.0, length, 1.1);
        object.rotation.y = rotated ? alongRotation + Math.PI / 2 : alongRotation;
        AddCollider(rotated ? 1.0 : length, rotated ? length : 1.0, 1.1);
        break;
      }
      case 'crates': {
        const levels = placement.size ?? 3;
        object = BuildCrateStack(levels, Math.floor(Math.abs(position.x * 7 + position.z)) % 4);
        object.rotation.y = rotated ? alongRotation + Math.PI / 2 : alongRotation;
        AddCollider(rotated ? 1.1 : 0.8, rotated ? 0.8 : 1.1, levels * 0.4);
        break;
      }
      case 'vending': {
        object = BuildVendingMachine(Math.floor(Math.abs(position.x + position.z)) % 2);
        object.rotation.y = Level.FacingRotation(towardCenter);
        const isFacingAlong = Math.abs(towardCenter.dot(along)) > 0.5;
        AddCollider(isFacingAlong ? 0.8 : 1.0, isFacingAlong ? 1.0 : 0.8, 1.9);
        break;
      }
      case 'bench':
        object = BuildBench();
        object.rotation.y = Level.FacingRotation(towardCenter);
        AddCollider(1.8, 0.5, 0.9);
        break;
      case 'bicycle':
        object = BuildBicycle();
        object.rotation.y = rotated ? alongRotation + Math.PI / 2 : alongRotation;
        break;
      case 'chalkboard':
        object = BuildChalkboardSign();
        object.rotation.y = Level.FacingRotation(along.clone().negate());
        break;
      case 'manhole':
        object = BuildManhole();
        break;
      case 'garbage':
        object = BuildGarbageBags();
        object.rotation.y = Math.random() * Math.PI;
        break;
      case 'car': {
        object = BuildCar(Math.floor(Math.abs(position.x * 3 + position.z)) % 6);
        object.rotation.y = rotated ? alongRotation : alongRotation + Math.PI / 2;
        AddCollider(rotated ? 4.3 : 1.8, rotated ? 1.8 : 4.3, 1.45);
        break;
      }
      case 'hedge': {
        const length = placement.size ?? 4;
        object = BuildHedge(length, 1.05);
        object.rotation.y = rotated ? Math.PI / 2 : 0;
        AddCollider(rotated ? 0.8 : length, rotated ? length : 0.8, 1.05);
        break;
      }
      case 'tree':
        object = BuildAutumnTree(1.1);
        this.AddColliderBox(position.x, position.z, 0.5, 0.5, 4);
        break;
      case 'stoneLantern':
        object = BuildStoneLantern();
        this.AddColliderBox(position.x, position.z, 0.6, 0.6, 1.6);
        break;
      case 'parkingMeter':
        object = BuildParkingMeter();
        object.rotation.y = Level.FacingRotation(towardCenter);
        this.AddColliderBox(position.x, position.z, 0.5, 0.5, 1.7);
        break;
      case 'pumpkin':
        object = BuildJackOLantern(1.3);
        object.rotation.y = Math.random() * Math.PI;
        break;
      case 'barrel':
      case 'propane': {
        const barrel = new Barrel(position, placement.kind === 'propane');
        this.barrels.push(barrel);
        this.group.add(barrel.mesh);
        return;
      }
    }
    if (!object) return;
    object.position.x = position.x;
    object.position.z = position.z;
    this.group.add(object);
  }

  private AddPointLight(position: THREE.Vector3, color: number, intensity: number): void {
    const light = new THREE.PointLight(color, intensity, 15, 1.6);
    light.position.copy(position);
    this.group.add(light);
  }

  private AddColliderBox(x: number, z: number, width: number, depth: number, height: number): void {
    this.staticColliders.push({
      box: new THREE.Box3(
        new THREE.Vector3(x - width / 2, 0, z - depth / 2),
        new THREE.Vector3(x + width / 2, height, z + depth / 2),
      ),
      barrel: null,
    });
  }
}
