// マップ（ハロウィンの墓地をイメージした閉鎖空間）の構築

import * as THREE from 'three';
import { MAP_HALF_SIZE } from './Config';
import { Barrel } from './Barrel';
import type { Collider } from './Collision';

const WALL_HEIGHT = 6;
const WALL_THICKNESS = 1;

interface BoxSpec {
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  material: THREE.Material;
}

function CreateGroundTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#3a3845';
  context.fillRect(0, 0, size, size);
  // 石畳風のタイル
  const tileSize = 64;
  for (let y = 0; y < size; y += tileSize) {
    for (let x = 0; x < size; x += tileSize) {
      const shade = 62 + Math.floor(Math.random() * 16);
      context.fillStyle = `rgb(${shade}, ${shade - 2}, ${shade + 8})`;
      context.fillRect(x + 2, y + 2, tileSize - 4, tileSize - 4);
    }
  }
  // ノイズ
  for (let i = 0; i < 1800; i++) {
    const shade = Math.floor(Math.random() * 60);
    context.fillStyle = `rgba(${shade}, ${shade}, ${shade + 10}, 0.25)`;
    context.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(MAP_HALF_SIZE / 2, MAP_HALF_SIZE / 2);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export class Level {
  readonly group = new THREE.Group();
  /** 静的な障害物 + 生存中の樽 */
  readonly colliders: Collider[] = [];
  readonly barrels: Barrel[] = [];
  readonly spawnPoints: THREE.Vector3[] = [];
  readonly playerStart = new THREE.Vector3(0, 0, 3);

  private readonly staticColliders: Collider[] = [];
  private readonly portalMeshes: THREE.Mesh[] = [];
  private readonly flameMeshes: THREE.Mesh[] = [];
  private time = 0;

  private readonly stoneMaterial = new THREE.MeshStandardMaterial({ color: 0x77718a, roughness: 0.9 });
  private readonly darkStoneMaterial = new THREE.MeshStandardMaterial({ color: 0x57526a, roughness: 0.95 });
  private readonly crateMaterial = new THREE.MeshStandardMaterial({ color: 0x8a6038, roughness: 0.85 });
  private readonly graveMaterial = new THREE.MeshStandardMaterial({ color: 0x7c7a86, roughness: 0.8 });
  private readonly woodMaterial = new THREE.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 1 });

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
    this.BuildLighting(scene);
    this.BuildGround();
    this.BuildWalls();
    this.BuildCover();
    this.BuildDecorations();
    this.BuildSpawnGates();
    this.BuildBarrels();
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
    for (let i = 0; i < this.flameMeshes.length; i++) {
      const flame = this.flameMeshes[i];
      flame.scale.setScalar(1 + Math.sin(this.time * 12 + i * 1.7) * 0.12);
    }
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

  private BuildLighting(scene: THREE.Scene): void {
    scene.background = new THREE.Color(0x140c24);
    scene.fog = new THREE.FogExp2(0x1a1030, 0.014);

    const hemisphere = new THREE.HemisphereLight(0x9c9cff, 0x3a2a30, 1.9);
    scene.add(hemisphere);

    const moon = new THREE.DirectionalLight(0xc8d0ff, 2.4);
    moon.position.set(-20, 35, 15);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    const shadowCamera = moon.shadow.camera;
    shadowCamera.left = -MAP_HALF_SIZE - 2;
    shadowCamera.right = MAP_HALF_SIZE + 2;
    shadowCamera.top = MAP_HALF_SIZE + 2;
    shadowCamera.bottom = -MAP_HALF_SIZE - 2;
    shadowCamera.near = 1;
    shadowCamera.far = 90;
    moon.shadow.bias = -0.0008;
    scene.add(moon);

    // 月
    const moonMesh = new THREE.Mesh(
      new THREE.SphereGeometry(4, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xfff4d0, fog: false }),
    );
    moonMesh.position.set(-70, 60, 50);
    scene.add(moonMesh);
  }

  private BuildGround(): void {
    const groundSize = MAP_HALF_SIZE * 2 + 4;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(groundSize, groundSize),
      new THREE.MeshStandardMaterial({ map: CreateGroundTexture(), roughness: 0.95 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.group.add(ground);
  }

  private BuildWalls(): void {
    const span = MAP_HALF_SIZE * 2 + WALL_THICKNESS * 2;
    const offset = MAP_HALF_SIZE + WALL_THICKNESS / 2;
    const walls: BoxSpec[] = [
      { x: 0, z: -offset, width: span, depth: WALL_THICKNESS, height: WALL_HEIGHT, material: this.darkStoneMaterial },
      { x: 0, z: offset, width: span, depth: WALL_THICKNESS, height: WALL_HEIGHT, material: this.darkStoneMaterial },
      { x: -offset, z: 0, width: WALL_THICKNESS, depth: span, height: WALL_HEIGHT, material: this.darkStoneMaterial },
      { x: offset, z: 0, width: WALL_THICKNESS, depth: span, height: WALL_HEIGHT, material: this.darkStoneMaterial },
    ];
    for (const wall of walls) this.AddBox(wall);

    // 壁の上の鉄柵風の装飾
    const spikeGeometry = new THREE.ConeGeometry(0.08, 0.6, 4);
    const spikeMaterial = new THREE.MeshStandardMaterial({ color: 0x1c1c22, metalness: 0.6, roughness: 0.5 });
    const spikeCountPerSide = 40;
    const spikes = new THREE.InstancedMesh(spikeGeometry, spikeMaterial, spikeCountPerSide * 4);
    const matrix = new THREE.Matrix4();
    let index = 0;
    for (let side = 0; side < 4; side++) {
      for (let i = 0; i < spikeCountPerSide; i++) {
        const along = -MAP_HALF_SIZE + (i + 0.5) * ((MAP_HALF_SIZE * 2) / spikeCountPerSide);
        const x = side < 2 ? along : side === 2 ? -offset : offset;
        const z = side < 2 ? (side === 0 ? -offset : offset) : along;
        matrix.makeTranslation(x, WALL_HEIGHT + 0.3, z);
        spikes.setMatrixAt(index++, matrix);
      }
    }
    this.group.add(spikes);
  }

  private BuildCover(): void {
    // 低い遮蔽物（しゃがめば隠れられる高さ）
    const crates: [number, number][] = [
      [-6, -4], [6, 4], [-10, 8], [10, -8], [-15, -15], [15, 15], [-4, 13],
      [4, -13], [18, -2], [-18, 2], [-23, -11], [23, 11], [12, 21], [-12, -21],
    ];
    for (const [x, z] of crates) {
      this.AddBox({ x, z, width: 1.5, depth: 1.5, height: 1.2, material: this.crateMaterial });
    }

    // 低い石壁
    const lowWalls: [number, number, number, number][] = [
      [0, -7, 6, 0.6], [0, 7, 6, 0.6], [-8, 0, 0.6, 5], [8, 0, 0.6, 5],
      [-24, 24, 5, 0.6], [24, -24, 5, 0.6],
    ];
    for (const [x, z, width, depth] of lowWalls) {
      this.AddBox({ x, z, width, depth, height: 1.1, material: this.stoneMaterial });
    }

    // 背の高い壁（立ったままでも隠れられる）
    const tallWalls: [number, number, number, number][] = [
      [-14, 0, 0.8, 8], [14, 0, 0.8, 8], [0, -18, 8, 0.8], [0, 18, 8, 0.8],
      [-20, -23, 6, 0.8], [20, 23, 6, 0.8], [23, -16, 0.8, 6], [-23, 16, 0.8, 6],
    ];
    for (const [x, z, width, depth] of tallWalls) {
      this.AddBox({ x, z, width, depth, height: 3, material: this.darkStoneMaterial });
    }

    // 柱
    const pillars: [number, number][] = [[-5, -20], [5, 20], [-20, 5], [20, -5], [-26, -4], [26, 4]];
    for (const [x, z] of pillars) {
      this.AddBox({ x, z, width: 1.1, depth: 1.1, height: 4, material: this.stoneMaterial });
    }

    // 墓石
    const graveyards: [number, number][] = [[16, -21], [-16, 21]];
    for (const [baseX, baseZ] of graveyards) {
      for (let row = 0; row < 2; row++) {
        for (let column = 0; column < 3; column++) {
          const x = baseX + (column - 1) * 2.4;
          const z = baseZ + (row - 0.5) * 3;
          this.AddBox({ x, z, width: 0.9, depth: 0.3, height: 1.0, material: this.graveMaterial });
          const top = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.3, 12, 1, false, 0, Math.PI), this.graveMaterial);
          // 半円柱を寝かせて上向きの丸い頭にする
          top.rotation.set(Math.PI / 2, 0, Math.PI / 2, 'ZYX');
          top.position.set(x, 1.0, z);
          top.castShadow = true;
          this.group.add(top);
        }
      }
    }
  }

  private BuildDecorations(): void {
    // 枯れ木
    const trees: [number, number][] = [[-25, 25], [25, -25], [-8, 24], [8, -24], [-27, -20], [27, 18]];
    for (const [x, z] of trees) {
      this.AddBox({ x, z, width: 0.6, depth: 0.6, height: 3.5, material: this.woodMaterial, isHidden: true });
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.35, 3.5, 7), this.woodMaterial);
      trunk.position.y = 1.75;
      trunk.castShadow = true;
      tree.add(trunk);
      for (let i = 0; i < 4; i++) {
        const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.1, 1.6, 5), this.woodMaterial);
        const angle = (i / 4) * Math.PI * 2 + Math.random();
        branch.position.set(Math.sin(angle) * 0.5, 2.6 + i * 0.25, Math.cos(angle) * 0.5);
        branch.rotation.set(Math.cos(angle) * 0.9, 0, -Math.sin(angle) * 0.9);
        branch.castShadow = true;
        tree.add(branch);
      }
      tree.position.set(x, 0, z);
      this.group.add(tree);
    }

    // 背の高い壁の上にジャック・オー・ランタンと灯り
    const lanternSpots: [number, number, number][] = [[-14, 3, 0], [14, 3, 0], [0, 3, -18], [0, 3, 18]];
    const pumpkinMaterial = new THREE.MeshStandardMaterial({ color: 0xff7518, roughness: 0.6 });
    const glowMaterial = new THREE.MeshBasicMaterial({ color: 0xffd060 });
    for (const [x, y, z] of lanternSpots) {
      const pumpkin = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 10), pumpkinMaterial);
      pumpkin.scale.set(1, 0.8, 1);
      pumpkin.position.set(x, y + 0.28, z);
      this.group.add(pumpkin);
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), glowMaterial);
      flame.position.set(x, y + 0.7, z);
      this.group.add(flame);
      this.flameMeshes.push(flame);
      const light = new THREE.PointLight(0xff8a2a, 14, 16, 1.6);
      light.position.set(x, y + 1.2, z);
      this.group.add(light);
    }
  }

  private BuildSpawnGates(): void {
    const inset = MAP_HALF_SIZE - 2;
    const points: [number, number][] = [
      [0, -inset], [0, inset], [-inset, 0], [inset, 0],
      [-inset + 2, -inset + 2], [inset - 2, inset - 2], [inset - 2, -inset + 2], [-inset + 2, inset - 2],
    ];
    const portalGeometry = new THREE.RingGeometry(0.8, 1.6, 24, 1, 0, Math.PI * 1.6);
    for (const [x, z] of points) {
      this.spawnPoints.push(new THREE.Vector3(x, 0, z));
      const portal = new THREE.Mesh(
        portalGeometry,
        new THREE.MeshBasicMaterial({
          color: 0x9b30ff,
          transparent: true,
          opacity: 0.5,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      portal.rotation.x = -Math.PI / 2;
      portal.position.set(x, 0.03, z);
      this.group.add(portal);
      this.portalMeshes.push(portal);
    }
  }

  private BuildBarrels(): void {
    const normalBarrels: [number, number][] = [
      [-7, -6], [7, 6], [-12, 10], [12, -10], [3, -16], [-3, 16], [-19, -4], [19, 4], [16, 17], [-16, -17],
      [-9, 20], [9, -20],
    ];
    const explosiveBarrels: [number, number][] = [
      [-13, -13], [13, 13], [-2.5, -19.5], [2.5, 19.5], [20, -12], [-20, 12],
    ];
    for (const [x, z] of normalBarrels) this.AddBarrel(x, z, false);
    for (const [x, z] of explosiveBarrels) this.AddBarrel(x, z, true);
  }

  private AddBarrel(x: number, z: number, isExplosive: boolean): void {
    const barrel = new Barrel(new THREE.Vector3(x, 0, z), isExplosive);
    this.barrels.push(barrel);
    this.group.add(barrel.mesh);
  }

  private AddBox(spec: BoxSpec & { isHidden?: boolean }): void {
    const { x, z, width, depth, height, material } = spec;
    if (!spec.isHidden) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
      mesh.position.set(x, height / 2, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
    this.staticColliders.push({
      box: new THREE.Box3(
        new THREE.Vector3(x - width / 2, 0, z - depth / 2),
        new THREE.Vector3(x + width / 2, height, z + depth / 2),
      ),
      barrel: null,
    });
  }
}
