// パーティクル・弾道・爆発・マズルフラッシュなどの演出

import * as THREE from 'three';

const MAX_PARTICLES = 1500;
const TRACER_POOL_SIZE = 48;
const EXPLOSION_POOL_SIZE = 8;

class ParticleSystem {
  readonly points: THREE.Points;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly velocities: Float32Array;
  private readonly lifetimes: Float32Array;
  private readonly maxLifetimes: Float32Array;
  private readonly baseColors: Float32Array;
  private readonly gravity: Float32Array;
  private nextIndex = 0;

  constructor(size: number) {
    const geometry = new THREE.BufferGeometry();
    this.positions = new Float32Array(MAX_PARTICLES * 3).fill(-9999);
    this.colors = new Float32Array(MAX_PARTICLES * 3);
    this.velocities = new Float32Array(MAX_PARTICLES * 3);
    this.lifetimes = new Float32Array(MAX_PARTICLES);
    this.maxLifetimes = new Float32Array(MAX_PARTICLES).fill(1);
    this.baseColors = new Float32Array(MAX_PARTICLES * 3);
    this.gravity = new Float32Array(MAX_PARTICLES);
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    const material = new THREE.PointsMaterial({
      size,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
  }

  Emit(position: THREE.Vector3, count: number, color: THREE.Color, speed: number, lifetime: number, gravity: number, direction?: THREE.Vector3): void {
    for (let n = 0; n < count; n++) {
      const i = this.nextIndex;
      this.nextIndex = (this.nextIndex + 1) % MAX_PARTICLES;
      this.positions[i * 3] = position.x;
      this.positions[i * 3 + 1] = position.y;
      this.positions[i * 3 + 2] = position.z;
      let vx = Math.random() * 2 - 1;
      let vy = Math.random() * 2 - 1;
      let vz = Math.random() * 2 - 1;
      const length = Math.hypot(vx, vy, vz) || 1;
      const magnitude = speed * (0.4 + Math.random() * 0.6);
      vx = (vx / length) * magnitude;
      vy = (vy / length) * magnitude;
      vz = (vz / length) * magnitude;
      if (direction) {
        vx += direction.x * speed * 0.7;
        vy += direction.y * speed * 0.7;
        vz += direction.z * speed * 0.7;
      }
      this.velocities[i * 3] = vx;
      this.velocities[i * 3 + 1] = vy;
      this.velocities[i * 3 + 2] = vz;
      const life = lifetime * (0.6 + Math.random() * 0.4);
      this.lifetimes[i] = life;
      this.maxLifetimes[i] = life;
      this.gravity[i] = gravity;
      this.baseColors[i * 3] = color.r;
      this.baseColors[i * 3 + 1] = color.g;
      this.baseColors[i * 3 + 2] = color.b;
    }
  }

  Update(dt: number): void {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.lifetimes[i] <= 0) continue;
      this.lifetimes[i] -= dt;
      if (this.lifetimes[i] <= 0) {
        this.positions[i * 3 + 1] = -9999;
        continue;
      }
      this.velocities[i * 3 + 1] -= this.gravity[i] * dt;
      const drag = 1 - dt * 1.5;
      this.velocities[i * 3] *= drag;
      this.velocities[i * 3 + 2] *= drag;
      this.positions[i * 3] += this.velocities[i * 3] * dt;
      this.positions[i * 3 + 1] += this.velocities[i * 3 + 1] * dt;
      this.positions[i * 3 + 2] += this.velocities[i * 3 + 2] * dt;
      if (this.positions[i * 3 + 1] < 0.02) {
        this.positions[i * 3 + 1] = 0.02;
        this.velocities[i * 3 + 1] *= -0.3;
      }
      const fade = this.lifetimes[i] / this.maxLifetimes[i];
      this.colors[i * 3] = this.baseColors[i * 3] * fade;
      this.colors[i * 3 + 1] = this.baseColors[i * 3 + 1] * fade;
      this.colors[i * 3 + 2] = this.baseColors[i * 3 + 2] * fade;
    }
    const geometry = this.points.geometry;
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
  }
}

interface Tracer {
  line: THREE.Line;
  life: number;
}

interface Explosion {
  mesh: THREE.Mesh;
  life: number;
  radius: number;
}

export class Effects {
  private readonly sparks = new ParticleSystem(0.09);
  private readonly embers = new ParticleSystem(0.35);
  private readonly tracers: Tracer[] = [];
  private readonly explosions: Explosion[] = [];
  private readonly flashLight = new THREE.PointLight(0xff9040, 0, 18, 1.5);
  private readonly muzzleLight = new THREE.PointLight(0xffd080, 0, 8, 2);
  private readonly muzzleFlash: THREE.Mesh;
  private flashLife = 0;
  private muzzleLife = 0;
  private tracerIndex = 0;
  private explosionIndex = 0;
  private readonly tmpColor = new THREE.Color();

  constructor(scene: THREE.Scene) {
    scene.add(this.sparks.points, this.embers.points, this.flashLight, this.muzzleLight);

    for (let i = 0; i < TRACER_POOL_SIZE; i++) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const line = new THREE.Line(
        geometry,
        new THREE.LineBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      line.frustumCulled = false;
      line.visible = false;
      scene.add(line);
      this.tracers.push({ line, life: 0 });
    }

    for (let i = 0; i < EXPLOSION_POOL_SIZE; i++) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(1, 20, 14),
        new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      mesh.visible = false;
      scene.add(mesh);
      this.explosions.push({ mesh, life: 0, radius: 1 });
    }

    this.muzzleFlash = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.muzzleFlash.visible = false;
    scene.add(this.muzzleFlash);
  }

  SpawnTracer(from: THREE.Vector3, to: THREE.Vector3, color = 0xfff2b0): void {
    const tracer = this.tracers[this.tracerIndex];
    this.tracerIndex = (this.tracerIndex + 1) % TRACER_POOL_SIZE;
    const attribute = tracer.line.geometry.attributes.position as THREE.BufferAttribute;
    attribute.setXYZ(0, from.x, from.y, from.z);
    attribute.setXYZ(1, to.x, to.y, to.z);
    attribute.needsUpdate = true;
    (tracer.line.material as THREE.LineBasicMaterial).color.setHex(color);
    tracer.life = 0.07;
    tracer.line.visible = true;
  }

  SpawnImpact(position: THREE.Vector3, normal: THREE.Vector3 | null, color: number, count = 8): void {
    this.tmpColor.setHex(color);
    this.sparks.Emit(position, count, this.tmpColor, 4, 0.35, 9, normal ?? undefined);
  }

  SpawnBurst(position: THREE.Vector3, color: number, count: number, speed = 5): void {
    this.tmpColor.setHex(color);
    this.embers.Emit(position, count, this.tmpColor, speed, 0.7, 6);
  }

  SpawnExplosion(position: THREE.Vector3, radius: number): void {
    const explosion = this.explosions[this.explosionIndex];
    this.explosionIndex = (this.explosionIndex + 1) % EXPLOSION_POOL_SIZE;
    explosion.mesh.position.copy(position);
    explosion.life = 0.45;
    explosion.radius = radius;
    explosion.mesh.visible = true;

    this.tmpColor.setHex(0xff7a20);
    this.embers.Emit(position, 70, this.tmpColor, radius * 3, 0.9, 5);
    this.tmpColor.setHex(0xffe070);
    this.sparks.Emit(position, 60, this.tmpColor, radius * 4, 0.6, 12);

    this.flashLight.position.copy(position);
    this.flashLight.position.y += 1;
    this.flashLight.intensity = 60;
    this.flashLife = 0.25;
  }

  ShowMuzzleFlash(position: THREE.Vector3): void {
    this.muzzleFlash.position.copy(position);
    this.muzzleFlash.visible = true;
    this.muzzleFlash.scale.setScalar(0.8 + Math.random() * 0.6);
    this.muzzleLight.position.copy(position);
    this.muzzleLight.intensity = 6;
    this.muzzleLife = 0.05;
  }

  Update(dt: number): void {
    this.sparks.Update(dt);
    this.embers.Update(dt);

    for (const tracer of this.tracers) {
      if (tracer.life <= 0) continue;
      tracer.life -= dt;
      const material = tracer.line.material as THREE.LineBasicMaterial;
      material.opacity = Math.max(0, tracer.life / 0.07);
      if (tracer.life <= 0) tracer.line.visible = false;
    }

    for (const explosion of this.explosions) {
      if (explosion.life <= 0) continue;
      explosion.life -= dt;
      const progress = 1 - explosion.life / 0.45;
      explosion.mesh.scale.setScalar(explosion.radius * (0.3 + progress * 0.9));
      (explosion.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.8 * (1 - progress));
      if (explosion.life <= 0) explosion.mesh.visible = false;
    }

    if (this.flashLife > 0) {
      this.flashLife -= dt;
      this.flashLight.intensity = Math.max(0, (this.flashLife / 0.25) * 60);
    }
    if (this.muzzleLife > 0) {
      this.muzzleLife -= dt;
      if (this.muzzleLife <= 0) {
        this.muzzleFlash.visible = false;
        this.muzzleLight.intensity = 0;
      }
    }
  }
}
