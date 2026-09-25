// マップ：ハロウィン飾りの商店街（十字路）。4 本の通りの先がそれぞれ敵の出現口になる

import * as THREE from 'three';
import { MAP_HALF_SIZE } from './Config';
import { Barrel } from './Barrel';
import type { Collider } from './Collision';
import {
  BuildBarricade, BuildBench, BuildBicycle, BuildChalkboardSign, BuildCrateStack, BuildJackOLantern, BuildManhole,
  BuildPaperLantern, BuildPlanter, BuildShop, BuildStreetLamp, BuildUtilityPole, BuildVendingMachine, SHOP_STYLES,
} from './CityProps';
import { CreateBuntingTexture, CreateDuskSkyTexture, CreatePavingTexture, CreateSidewalkTexture } from './CityTextures';
import { BatchStaticMeshes, MarkDynamic, WireBatch } from './StaticBatcher';

/** 通りの半幅（歩道を含む）。これより外側は建物 */
const STREET_HALF_WIDTH = 8;
/** 歩道が始まる位置（通りの中心からの距離） */
const SIDEWALK_START = 5.6;
/** 見た目上、通りがマップの外までどこまで続くか */
const VISUAL_STREET_LENGTH = 62;
const BUILDING_DEPTH = 6;

/** 4 本の通り（北・南・西・東）。along は中心から外へ向かう方向 */
const ARMS = [
  new THREE.Vector3(0, 0, -1),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(1, 0, 0),
];

type PropKind = 'planter' | 'crates' | 'vending' | 'bench' | 'bicycle' | 'chalkboard' | 'manhole' | 'barrel' | 'propane';

/** 通りのローカル座標での配置（u = 通りを横切る方向、v = 中心からの距離） */
interface PropPlacement {
  kind: PropKind;
  u: number;
  v: number;
  /** プランターの長さ・コンテナの段数など */
  size?: number;
  /** プランターを通りに対して横向き（通りを横切る向き）に置く。正面から来る敵の弾を防げる */
  isAcross?: boolean;
}

/** 通りごとの遮蔽物・小物の配置パターン（2 種類を交互に使い、向きで変化をつける） */
const ARM_LAYOUTS: PropPlacement[][] = [
  [
    { kind: 'planter', u: -4.6, v: 12, size: 3, isAcross: true },
    { kind: 'planter', u: 5.0, v: 18.5, size: 3 },
    { kind: 'planter', u: -4.6, v: 25, size: 3, isAcross: true },
    { kind: 'crates', u: -1.8, v: 15, size: 3 },
    { kind: 'crates', u: 2.2, v: 22, size: 2 },
    { kind: 'crates', u: 0.4, v: 27.5, size: 3 },
    { kind: 'vending', u: 7.1, v: 10.5 },
    { kind: 'vending', u: -7.1, v: 19.5 },
    { kind: 'bench', u: -6.9, v: 16 },
    { kind: 'bicycle', u: 6.6, v: 14 },
    { kind: 'chalkboard', u: -6.3, v: 22.5 },
    { kind: 'manhole', u: 1.2, v: 17.5 },
    { kind: 'barrel', u: 6.6, v: 24 },
    { kind: 'barrel', u: -6.6, v: 9.8 },
    { kind: 'propane', u: -3.2, v: 19.5 },
  ],
  [
    { kind: 'planter', u: 4.6, v: 11.5, size: 3, isAcross: true },
    { kind: 'planter', u: -5.0, v: 17.5, size: 2.5 },
    { kind: 'planter', u: 4.6, v: 24.5, size: 3, isAcross: true },
    { kind: 'crates', u: 1.6, v: 14, size: 3 },
    { kind: 'crates', u: -2.4, v: 21, size: 3 },
    { kind: 'crates', u: -0.2, v: 26.5, size: 2 },
    { kind: 'vending', u: -7.1, v: 11 },
    { kind: 'vending', u: 7.1, v: 20.5 },
    { kind: 'bench', u: 6.9, v: 16.5 },
    { kind: 'bicycle', u: -6.6, v: 14.5 },
    { kind: 'bicycle', u: -6.6, v: 15.4 },
    { kind: 'chalkboard', u: 6.3, v: 27 },
    { kind: 'manhole', u: -1.0, v: 18 },
    { kind: 'barrel', u: -6.6, v: 24 },
    { kind: 'barrel', u: 6.6, v: 9.8 },
    { kind: 'propane', u: 3.4, v: 18 },
  ],
];

export class Level {
  readonly group = new THREE.Group();
  /** 静的な障害物 + 生存中の樽 */
  readonly colliders: Collider[] = [];
  readonly barrels: Barrel[] = [];
  readonly spawnPoints: THREE.Vector3[] = [];
  readonly playerStart = new THREE.Vector3(0, 0, 4.5);

  private readonly staticColliders: Collider[] = [];
  private readonly portalMeshes: THREE.Mesh[] = [];
  private readonly lanterns: THREE.Object3D[] = [];
  private readonly wires = new WireBatch();
  private time = 0;

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
    this.BuildSkyAndLighting(scene);
    this.BuildGround();
    this.BuildBuildings();
    this.BuildStreetFurniture();
    this.BuildIntersection();
    this.BuildBunting();
    this.BuildMapEdges();
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

  /** side 方向（単位ベクトル）の通りの先にあるスポーン地点 */
  GetSpawnPointsOnSide(side: THREE.Vector3): THREE.Vector3[] {
    return this.spawnPoints.filter((point) => (point.x * side.x + point.z * side.z) / point.length() > 0.5);
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

  /** 通りを横切る方向（along を 90 度回したもの） */
  private static GetAcross(along: THREE.Vector3): THREE.Vector3 {
    return new THREE.Vector3(-along.z, 0, along.x);
  }

  /** 通りのローカル座標（u, v）をワールド座標へ */
  private static ToWorld(along: THREE.Vector3, u: number, v: number): THREE.Vector3 {
    return Level.GetAcross(along).multiplyScalar(u).addScaledVector(along, v);
  }

  /** 物体の正面（+Z）を direction に向けるための Y 回転 */
  private static FacingRotation(direction: THREE.Vector3): number {
    return Math.atan2(direction.x, direction.z);
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

    const hemisphere = new THREE.HemisphereLight(0xa8a0ff, 0x6a4a3a, 1.5);
    scene.add(hemisphere);

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

  private BuildGround(): void {
    const pavingTexture = CreatePavingTexture();
    const sidewalkTexture = CreateSidewalkTexture();
    const width = STREET_HALF_WIDTH * 2;

    // 南北の通り（交差点を含む）と、東西の通りの左右
    const northSouth = this.CreateGroundPlane(pavingTexture, width, VISUAL_STREET_LENGTH * 2);
    this.group.add(northSouth);
    for (const sign of [-1, 1]) {
      const eastWest = this.CreateGroundPlane(pavingTexture, VISUAL_STREET_LENGTH - STREET_HALF_WIDTH, width);
      eastWest.position.x = sign * (STREET_HALF_WIDTH + (VISUAL_STREET_LENGTH - STREET_HALF_WIDTH) / 2);
      this.group.add(eastWest);
    }

    // 歩道と縁石
    const curbMaterial = new THREE.MeshStandardMaterial({ color: 0xb8b0a4, roughness: 0.8 });
    const sidewalkWidth = STREET_HALF_WIDTH - SIDEWALK_START;
    for (const along of ARMS) {
      for (const side of [-1, 1]) {
        const length = VISUAL_STREET_LENGTH - STREET_HALF_WIDTH;
        const sidewalk = this.CreateGroundPlane(sidewalkTexture, sidewalkWidth, length, 0.006);
        const center = Level.ToWorld(along, side * (SIDEWALK_START + sidewalkWidth / 2), STREET_HALF_WIDTH + length / 2);
        sidewalk.position.set(center.x, 0.006, center.z);
        sidewalk.rotation.z = Level.FacingRotation(along);
        this.group.add(sidewalk);

        const curb = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, length), curbMaterial);
        const curbPosition = Level.ToWorld(along, side * SIDEWALK_START, STREET_HALF_WIDTH + length / 2);
        curb.position.set(curbPosition.x, 0.05, curbPosition.z);
        curb.rotation.y = Level.FacingRotation(along);
        curb.receiveShadow = true;
        this.group.add(curb);
      }
    }
  }

  private CreateGroundPlane(texture: THREE.Texture, width: number, depth: number, y = 0): THREE.Mesh {
    const tiled = texture.clone();
    tiled.repeat.set(width / 4, depth / 4);
    tiled.needsUpdate = true;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, depth),
      new THREE.MeshStandardMaterial({ map: tiled, roughness: 0.9 }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = y;
    mesh.receiveShadow = true;
    return mesh;
  }

  private BuildBuildings(): void {
    // 建物の当たり判定：十字路の 4 つの角のブロック
    const far = VISUAL_STREET_LENGTH;
    for (const signX of [-1, 1]) {
      for (const signZ of [-1, 1]) {
        const minX = signX > 0 ? STREET_HALF_WIDTH : -far;
        const maxX = signX > 0 ? far : -STREET_HALF_WIDTH;
        const minZ = signZ > 0 ? STREET_HALF_WIDTH : -far;
        const maxZ = signZ > 0 ? far : -STREET_HALF_WIDTH;
        this.staticColliders.push({
          box: new THREE.Box3(new THREE.Vector3(minX, 0, minZ), new THREE.Vector3(maxX, 12, maxZ)),
          barrel: null,
        });
      }
    }

    // 通りに面した店を並べる。南北の通りは角を東西の通りの店に譲る
    let styleIndex = 0;
    ARMS.forEach((along, armIndex) => {
      const isNorthSouth = armIndex < 2;
      for (const side of [-1, 1]) {
        const facing = Level.GetAcross(along).multiplyScalar(-side);
        let v = isNorthSouth ? STREET_HALF_WIDTH + BUILDING_DEPTH : STREET_HALF_WIDTH;
        while (v < VISUAL_STREET_LENGTH) {
          const width = Math.min(4.5 + Math.random() * 2.5, VISUAL_STREET_LENGTH - v);
          if (width < 2) break;
          const height = 6.5 + Math.random() * 3.5;
          const style = SHOP_STYLES[styleIndex % SHOP_STYLES.length];
          styleIndex += 3;
          const shop = BuildShop(width, height, BUILDING_DEPTH, style);
          const position = Level.ToWorld(along, side * STREET_HALF_WIDTH, v + width / 2);
          shop.position.copy(position);
          shop.rotation.y = Level.FacingRotation(facing);
          this.group.add(shop);
          this.lanterns.push(...((shop.userData.swingingObjects as THREE.Object3D[] | undefined) ?? []));
          v += width;
        }
      }
      styleIndex += 1;

      // 通りの突き当たりの建物（遠景）
      const endShop = BuildShop(STREET_HALF_WIDTH * 2 + 2, 11, BUILDING_DEPTH, SHOP_STYLES[(armIndex * 3 + 2) % SHOP_STYLES.length]);
      endShop.position.copy(along.clone().multiplyScalar(VISUAL_STREET_LENGTH));
      endShop.rotation.y = Level.FacingRotation(along.clone().negate());
      this.group.add(endShop);
    });
  }

  private BuildStreetFurniture(): void {
    ARMS.forEach((along, armIndex) => {
      const across = Level.GetAcross(along);
      const layout = ARM_LAYOUTS[armIndex % ARM_LAYOUTS.length];
      for (const placement of layout) this.PlaceProp(along, placement);

      // 街灯（マップ内のものだけ本物の光源を持つ）
      const lampSpots: [number, number][] = [[-6.3, 11], [6.3, 21], [-6.3, 36], [6.3, 48]];
      lampSpots.forEach(([u, v], index) => {
        const lamp = BuildStreetLamp();
        const position = Level.ToWorld(along, u, v);
        lamp.position.copy(position);
        lamp.rotation.y = Level.FacingRotation(across.clone().multiplyScalar(-Math.sign(u)));
        this.group.add(lamp);
        if (v < MAP_HALF_SIZE) this.AddColliderBox(position.x, position.z, 0.3, 0.3, 4.2);
        if (index === 0) {
          lamp.updateMatrixWorld(true);
          const light = new THREE.PointLight(0xffb060, 12, 16, 1.6);
          light.position.copy(lamp.localToWorld((lamp.userData.lightPosition as THREE.Vector3).clone()));
          this.group.add(light);
        }
      });

      // 電柱と電線
      const polePositions: THREE.Vector3[] = [];
      const poleDistances = [15.5, 28.5, 41, 54];
      const poleSide = armIndex % 2 === 0 ? 1 : -1;
      for (const v of poleDistances) {
        const pole = BuildUtilityPole();
        const position = Level.ToWorld(along, poleSide * 7.4, v);
        pole.position.copy(position);
        pole.rotation.y = Level.FacingRotation(along);
        this.group.add(pole);
        if (v < MAP_HALF_SIZE) this.AddColliderBox(position.x, position.z, 0.36, 0.36, 9);
        polePositions.push(position);
      }
      for (let i = 0; i < polePositions.length - 1; i++) {
        for (const offset of [-0.7, 0.7]) {
          const start = polePositions[i].clone().addScaledVector(across, offset).setY(8.35);
          const end = polePositions[i + 1].clone().addScaledVector(across, offset).setY(8.35);
          this.wires.AddSaggingWire(start, end, 0.6);
        }
        // 通りを横切る電線
        const crossStart = polePositions[i].clone().setY(7.65);
        const crossEnd = Level.ToWorld(along, -poleSide * STREET_HALF_WIDTH, poleDistances[i]).setY(7.2);
        this.wires.AddSaggingWire(crossStart, crossEnd, 0.8);
      }
    });
  }

  private PlaceProp(along: THREE.Vector3, placement: PropPlacement): void {
    const across = Level.GetAcross(along);
    const position = Level.ToWorld(along, placement.u, placement.v);
    /** 通りの中央を向く方向 */
    const towardCenter = across.clone().multiplyScalar(-Math.sign(placement.u) || 1);
    const alongRotation = Level.FacingRotation(along);
    let object: THREE.Object3D | null = null;

    switch (placement.kind) {
      case 'planter': {
        const length = placement.size ?? 3;
        object = BuildPlanter(1.0, length, 1.1);
        const acrossLength = placement.isAcross ? length : 1.0;
        const alongLength = placement.isAcross ? 1.0 : length;
        object.rotation.y = placement.isAcross ? alongRotation + Math.PI / 2 : alongRotation;
        const halfX = Math.abs(across.x) * (acrossLength / 2) + Math.abs(along.x) * (alongLength / 2);
        const halfZ = Math.abs(across.z) * (acrossLength / 2) + Math.abs(along.z) * (alongLength / 2);
        this.AddColliderBox(position.x, position.z, halfX * 2, halfZ * 2, 1.1);
        break;
      }
      case 'crates': {
        const levels = placement.size ?? 3;
        object = BuildCrateStack(levels, Math.floor(Math.abs(placement.u * 7 + placement.v)) % 4);
        object.rotation.y = alongRotation;
        const halfX = Math.abs(across.x) * 0.55 + Math.abs(along.x) * 0.4;
        const halfZ = Math.abs(across.z) * 0.55 + Math.abs(along.z) * 0.4;
        this.AddColliderBox(position.x, position.z, halfX * 2, halfZ * 2, levels * 0.4);
        break;
      }
      case 'vending': {
        object = BuildVendingMachine(Math.floor(placement.v) % 2);
        object.rotation.y = Level.FacingRotation(towardCenter);
        const halfX = Math.abs(across.x) * 0.4 + Math.abs(along.x) * 0.5;
        const halfZ = Math.abs(across.z) * 0.4 + Math.abs(along.z) * 0.5;
        this.AddColliderBox(position.x, position.z, halfX * 2, halfZ * 2, 1.9);
        break;
      }
      case 'bench': {
        object = BuildBench();
        object.rotation.y = Level.FacingRotation(towardCenter);
        const halfX = Math.abs(across.x) * 0.25 + Math.abs(along.x) * 0.9;
        const halfZ = Math.abs(across.z) * 0.25 + Math.abs(along.z) * 0.9;
        this.AddColliderBox(position.x, position.z, halfX * 2, halfZ * 2, 0.9);
        break;
      }
      case 'bicycle':
        object = BuildBicycle();
        object.rotation.y = alongRotation;
        break;
      case 'chalkboard':
        object = BuildChalkboardSign();
        object.rotation.y = Level.FacingRotation(along.clone().negate());
        break;
      case 'manhole':
        object = BuildManhole();
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

  private BuildIntersection(): void {
    // 中央の大きなプランターと木
    const planter = BuildPlanter(3.2, 3.2, 1.1);
    this.group.add(planter);
    this.AddColliderBox(0, 0, 3.2, 3.2, 1.1);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.26, 3.2, 8), new THREE.MeshStandardMaterial({ color: 0x5a3e2a }));
    trunk.position.y = 2.5;
    trunk.castShadow = true;
    this.group.add(trunk);
    const leavesMaterial = new THREE.MeshStandardMaterial({ color: 0xc8662a, roughness: 0.9 });
    for (let i = 0; i < 5; i++) {
      const leaves = new THREE.Mesh(new THREE.SphereGeometry(1.1, 10, 8), leavesMaterial);
      const angle = (i / 5) * Math.PI * 2;
      leaves.position.set(Math.sin(angle) * 0.8, 4.3 + (i % 2) * 0.5, Math.cos(angle) * 0.8);
      leaves.castShadow = true;
      this.group.add(leaves);
    }
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const pumpkin = BuildJackOLantern(1.4);
      pumpkin.position.set(Math.sin(angle) * 1.1, 1.1, Math.cos(angle) * 1.1);
      pumpkin.rotation.y = angle;
      this.group.add(pumpkin);
    }

    // 交差点の角の小さな遮蔽物
    const crateSpots: [number, number, number][] = [[4.6, -4.6, 3], [-4.6, 4.6, 3], [5.2, 5.0, 2], [-5.0, -5.2, 2]];
    crateSpots.forEach(([x, z, levels], index) => {
      const crates = BuildCrateStack(levels, index);
      crates.position.set(x, 0, z);
      crates.rotation.y = Math.PI / 4;
      this.group.add(crates);
      this.AddColliderBox(x, z, 1.0, 1.0, levels * 0.4);
    });

    // 交差点の中央でも提灯を吊るす
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      const lantern = BuildPaperLantern();
      lantern.position.set(Math.sin(angle) * 6, 5.2, Math.cos(angle) * 6);
      this.group.add(lantern);
      this.lanterns.push(lantern);
    }
    const centerLight = new THREE.PointLight(0xff9a50, 10, 14, 1.6);
    centerLight.position.set(0, 5, 0);
    this.group.add(centerLight);
  }

  /** 通りを横切るハロウィンのガーランド */
  private BuildBunting(): void {
    const flagGeometry = new THREE.PlaneGeometry(0.42, 0.42);
    const materials = [0, 1].map((kind) => new THREE.MeshStandardMaterial({
      map: CreateBuntingTexture(kind),
      transparent: true,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
      roughness: 0.8,
    }));
    const flagMatrices: THREE.Matrix4[][] = [[], []];
    const tmpMatrix = new THREE.Matrix4();
    const tmpQuaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);

    const AddString = (start: THREE.Vector3, end: THREE.Vector3, sag: number) => {
      this.wires.AddSaggingWire(start, end, sag);
      const length = start.distanceTo(end);
      const count = Math.floor(length / 0.55);
      const direction = end.clone().sub(start).normalize();
      tmpQuaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), direction);
      for (let i = 1; i < count; i++) {
        const t = i / count;
        const point = start.clone().lerp(end, t);
        point.y -= Math.sin(t * Math.PI) * sag + 0.21;
        tmpMatrix.compose(point, tmpQuaternion, scale);
        flagMatrices[i % 2].push(tmpMatrix.clone());
      }
    };

    for (const along of ARMS) {
      for (const v of [12.5, 19.5, 26.5, 38, 50]) {
        const height = 5.6 + (v % 3) * 0.2;
        const start = Level.ToWorld(along, -STREET_HALF_WIDTH + 0.1, v).setY(height);
        const end = Level.ToWorld(along, STREET_HALF_WIDTH - 0.1, v).setY(height);
        AddString(start, end, 0.6);
      }
    }
    // 交差点は角から角へ斜めに
    const corner = STREET_HALF_WIDTH - 0.1;
    AddString(new THREE.Vector3(-corner, 6.3, -corner), new THREE.Vector3(corner, 6.3, corner), 1.0);
    AddString(new THREE.Vector3(corner, 6.3, -corner), new THREE.Vector3(-corner, 6.3, corner), 1.0);

    flagMatrices.forEach((matrices, kind) => {
      const instanced = new THREE.InstancedMesh(flagGeometry, materials[kind], matrices.length);
      matrices.forEach((matrix, index) => instanced.setMatrixAt(index, matrix));
      instanced.instanceMatrix.needsUpdate = true;
      this.group.add(instanced);
    });
  }

  /** マップの端：通りをふさぐ工事用バリケード */
  private BuildMapEdges(): void {
    for (const along of ARMS) {
      const barricade = BuildBarricade(STREET_HALF_WIDTH * 2);
      barricade.position.copy(along.clone().multiplyScalar(MAP_HALF_SIZE + 0.4));
      barricade.rotation.y = Level.FacingRotation(along.clone().negate());
      this.group.add(barricade);
    }
  }

  private BuildSpawnGates(): void {
    const portalGeometry = new THREE.RingGeometry(0.8, 1.6, 24, 1, 0, Math.PI * 1.6);
    for (const along of ARMS) {
      for (const u of [-4, 0, 4]) {
        const point = Level.ToWorld(along, u, MAP_HALF_SIZE - 2);
        this.spawnPoints.push(point);
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
