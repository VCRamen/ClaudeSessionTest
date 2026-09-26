// 空と光の時間帯（夕方 → 日没後 → 夜）。Wave が進むにつれて夜が更けていく

import * as THREE from 'three';

interface TimeKeyframe {
  /** 0 = 夕方、1 = 夜 */
  time: number;
  /** 空のグラデーション（上端 0 が天頂、0.5 が地平線） */
  skyStops: [number, string][];
  sunColor: number;
  sunIntensity: number;
  sunPosition: THREE.Vector3;
  hemisphereSky: number;
  hemisphereGround: number;
  hemisphereIntensity: number;
  fogColor: number;
  fogDensity: number;
  starOpacity: number;
  moonOpacity: number;
}

const KEYFRAMES: TimeKeyframe[] = [
  {
    time: 0,
    skyStops: [[0, '#1b1440'], [0.22, '#3d2a6e'], [0.36, '#8a4f8f'], [0.45, '#e0806a'], [0.5, '#f6b36b'], [1, '#f6b36b']],
    sunColor: 0xffa868, sunIntensity: 2.2, sunPosition: new THREE.Vector3(-30, 22, 18),
    hemisphereSky: 0xa8a0ff, hemisphereGround: 0x6a4a3a, hemisphereIntensity: 1.5,
    fogColor: 0x8a5a78, fogDensity: 0.013, starOpacity: 0, moonOpacity: 0,
  },
  {
    time: 0.5,
    skyStops: [[0, '#0e0b2a'], [0.22, '#241d52'], [0.36, '#4a3070'], [0.45, '#9a4f6a'], [0.5, '#c8705a'], [1, '#c8705a']],
    sunColor: 0xff7a58, sunIntensity: 1.2, sunPosition: new THREE.Vector3(-40, 12, 22),
    hemisphereSky: 0x8a88e0, hemisphereGround: 0x4a3a3a, hemisphereIntensity: 1.1,
    fogColor: 0x5a3e62, fogDensity: 0.014, starOpacity: 0.35, moonOpacity: 0.5,
  },
  {
    time: 1,
    skyStops: [[0, '#04050e'], [0.22, '#0b1030'], [0.36, '#141c44'], [0.45, '#26305a'], [0.5, '#343a60'], [1, '#343a60']],
    // 夜は月明かり（青白い光が高い位置から）
    sunColor: 0x9ab0ff, sunIntensity: 0.9, sunPosition: new THREE.Vector3(20, 40, -15),
    hemisphereSky: 0x6070c0, hemisphereGround: 0x2a2030, hemisphereIntensity: 0.75,
    fogColor: 0x1c1c34, fogDensity: 0.016, starOpacity: 1, moonOpacity: 1,
  },
];

/** ビル街：夕方の「ブルーアワー」から夜へ。遠くのビル群が見えるよう霧は薄め */
const BLUE_HOUR_KEYFRAMES: TimeKeyframe[] = [
  {
    time: 0,
    skyStops: [[0, '#101a4a'], [0.22, '#22347a'], [0.36, '#3d4f9a'], [0.45, '#8a7aa8'], [0.5, '#e8a070'], [1, '#e8a070']],
    sunColor: 0xffb070, sunIntensity: 2.0, sunPosition: new THREE.Vector3(-30, 20, 22),
    hemisphereSky: 0x9aa8ff, hemisphereGround: 0x5a4a48, hemisphereIntensity: 1.5,
    fogColor: 0x4a5488, fogDensity: 0.007, starOpacity: 0, moonOpacity: 0,
  },
  {
    time: 0.5,
    skyStops: [[0, '#0a1036'], [0.22, '#18245e'], [0.36, '#2a3a7e'], [0.45, '#5a5a8e'], [0.5, '#b07868'], [1, '#b07868']],
    sunColor: 0xff8a60, sunIntensity: 1.2, sunPosition: new THREE.Vector3(-40, 12, 22),
    hemisphereSky: 0x8090e0, hemisphereGround: 0x40384a, hemisphereIntensity: 1.1,
    fogColor: 0x343c6a, fogDensity: 0.008, starOpacity: 0.3, moonOpacity: 0.5,
  },
  {
    time: 1,
    skyStops: [[0, '#03050f'], [0.22, '#0a1234'], [0.36, '#121e4a'], [0.45, '#243060'], [0.5, '#343c68'], [1, '#343c68']],
    sunColor: 0x9ab0ff, sunIntensity: 0.9, sunPosition: new THREE.Vector3(20, 40, -15),
    hemisphereSky: 0x6070c0, hemisphereGround: 0x2a2030, hemisphereIntensity: 0.8,
    fogColor: 0x1a1e38, fogDensity: 0.009, starOpacity: 0.8, moonOpacity: 1,
  },
];

export type SkyPalette = 'dusk' | 'blueHour';

const PALETTES: Record<SkyPalette, TimeKeyframe[]> = {
  dusk: KEYFRAMES,
  blueHour: BLUE_HOUR_KEYFRAMES,
};

/** 空の時間帯が移り変わるのにかける時間（秒） */
const TRANSITION_TIME = 6;
const SKY_RADIUS = 220;

const tmpColorA = new THREE.Color();
const tmpColorB = new THREE.Color();

function LerpColor(a: number | string, b: number | string, t: number): THREE.Color {
  tmpColorA.set(a);
  tmpColorB.set(b);
  return tmpColorA.clone().lerp(tmpColorB, t);
}

export class SkySystem {
  private readonly scene: THREE.Scene;
  private readonly fog: THREE.FogExp2;
  private readonly sun: THREE.DirectionalLight;
  private readonly hemisphere: THREE.HemisphereLight;
  private readonly skyCanvas = document.createElement('canvas');
  private readonly skyTexture: THREE.CanvasTexture;
  private readonly stars: THREE.Points;
  private readonly moon: THREE.Mesh;
  private readonly sky: THREE.Mesh;
  private readonly keyframes: TimeKeyframe[];
  private currentTime = 0;
  private targetTime = 0;
  private startTime = 0;
  private transitionElapsed = TRANSITION_TIME;

  constructor(scene: THREE.Scene, shadowRange: number, palette: SkyPalette = 'dusk') {
    this.scene = scene;
    this.keyframes = PALETTES[palette];
    this.fog = new THREE.FogExp2(0x8a5a78, 0.013);
    scene.fog = this.fog;
    scene.background = new THREE.Color(0x3a2a5e);

    this.skyCanvas.width = 16;
    this.skyCanvas.height = 512;
    this.skyTexture = new THREE.CanvasTexture(this.skyCanvas);
    this.skyTexture.colorSpace = THREE.SRGBColorSpace;
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(SKY_RADIUS, 24, 16),
      new THREE.MeshBasicMaterial({ map: this.skyTexture, side: THREE.BackSide, fog: false }),
    );
    scene.add(this.sky);

    // 星（空の上半分にばらまく）
    const starPositions: number[] = [];
    for (let i = 0; i < 700; i++) {
      const theta = Math.random() * Math.PI * 2;
      const height = 0.12 + Math.random() * 0.88;
      const ring = Math.sqrt(1 - height * height);
      const radius = SKY_RADIUS - 5;
      starPositions.push(Math.cos(theta) * ring * radius, height * radius, Math.sin(theta) * ring * radius);
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
    this.stars = new THREE.Points(
      starGeometry,
      new THREE.PointsMaterial({ color: 0xffffff, size: 1.8, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }),
    );
    scene.add(this.stars);

    this.moon = new THREE.Mesh(
      new THREE.SphereGeometry(7, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xfff4d0, transparent: true, opacity: 0, fog: false }),
    );
    this.moon.position.set(90, 120, -70);
    scene.add(this.moon);

    this.hemisphere = new THREE.HemisphereLight(0xa8a0ff, 0x6a4a3a, 1.5);
    scene.add(this.hemisphere);

    this.sun = new THREE.DirectionalLight(0xffa868, 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const shadowCamera = this.sun.shadow.camera;
    shadowCamera.left = -shadowRange;
    shadowCamera.right = shadowRange;
    shadowCamera.top = shadowRange;
    shadowCamera.bottom = -shadowRange;
    shadowCamera.near = 1;
    shadowCamera.far = 150;
    this.sun.shadow.bias = -0.0008;
    scene.add(this.sun);

    this.Apply(0);
  }

  /** 時間帯を指定する（0 = 夕方、1 = 夜）。isImmediate でなければ数秒かけて移り変わる */
  SetTime(time: number, isImmediate = false): void {
    const clamped = Math.min(1, Math.max(0, time));
    if (isImmediate) {
      this.currentTime = clamped;
      this.targetTime = clamped;
      this.transitionElapsed = TRANSITION_TIME;
      this.Apply(clamped);
      return;
    }
    this.startTime = this.currentTime;
    this.targetTime = clamped;
    this.transitionElapsed = 0;
  }

  Update(dt: number): void {
    if (this.transitionElapsed >= TRANSITION_TIME) return;
    this.transitionElapsed = Math.min(TRANSITION_TIME, this.transitionElapsed + dt);
    const progress = this.transitionElapsed / TRANSITION_TIME;
    const eased = progress * progress * (3 - 2 * progress);
    this.currentTime = this.startTime + (this.targetTime - this.startTime) * eased;
    this.Apply(this.currentTime);
  }

  /** シーンから取り除き、GPU のリソースを解放する（ステージの切り替え時） */
  Dispose(): void {
    this.scene.remove(this.sky, this.stars, this.moon, this.hemisphere, this.sun);
    for (const object of [this.sky, this.stars, this.moon]) {
      object.geometry.dispose();
      (object.material as THREE.Material).dispose();
    }
    this.skyTexture.dispose();
    this.sun.shadow.map?.dispose();
    if (this.scene.fog === this.fog) this.scene.fog = null;
  }

  private Apply(time: number): void {
    const keyframes = this.keyframes;
    let index = 0;
    while (index < keyframes.length - 2 && time > keyframes[index + 1].time) index++;
    const from = keyframes[index];
    const to = keyframes[index + 1];
    const t = Math.min(1, Math.max(0, (time - from.time) / (to.time - from.time)));

    // 空のグラデーション
    const context = this.skyCanvas.getContext('2d')!;
    const gradient = context.createLinearGradient(0, 0, 0, this.skyCanvas.height);
    from.skyStops.forEach(([stop, color], i) => {
      gradient.addColorStop(stop, `#${LerpColor(color, to.skyStops[i][1], t).getHexString()}`);
    });
    context.fillStyle = gradient;
    context.fillRect(0, 0, this.skyCanvas.width, this.skyCanvas.height);
    this.skyTexture.needsUpdate = true;

    this.sun.color.copy(LerpColor(from.sunColor, to.sunColor, t));
    this.sun.intensity = from.sunIntensity + (to.sunIntensity - from.sunIntensity) * t;
    this.sun.position.lerpVectors(from.sunPosition, to.sunPosition, t);
    this.hemisphere.color.copy(LerpColor(from.hemisphereSky, to.hemisphereSky, t));
    this.hemisphere.groundColor.copy(LerpColor(from.hemisphereGround, to.hemisphereGround, t));
    this.hemisphere.intensity = from.hemisphereIntensity + (to.hemisphereIntensity - from.hemisphereIntensity) * t;
    this.fog.color.copy(LerpColor(from.fogColor, to.fogColor, t));
    this.fog.density = from.fogDensity + (to.fogDensity - from.fogDensity) * t;
    (this.scene.background as THREE.Color).copy(this.fog.color);
    (this.stars.material as THREE.PointsMaterial).opacity = from.starOpacity + (to.starOpacity - from.starOpacity) * t;
    (this.moon.material as THREE.MeshBasicMaterial).opacity = from.moonOpacity + (to.moonOpacity - from.moonOpacity) * t;
  }
}
