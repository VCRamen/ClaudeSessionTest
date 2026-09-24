// プレイヤーの状態・移動・武器スロット管理

import * as THREE from 'three';
import {
  AIM_SENSITIVITY_MULTIPLIER, AIM_SPEED_MULTIPLIER, CROUCH_SPEED, GRAVITY, JUMP_SPEED, MAP_HALF_SIZE,
  MOUSE_SENSITIVITY, PLAYER_CROUCH_HEIGHT, PLAYER_HEIGHT, PLAYER_MAX_HP, PLAYER_RADIUS, PLAYER_START_MONEY,
  SPRINT_SPEED, WALK_SPEED, WEAPON_SLOT_COUNT,
} from './Config';
import { Clamp, GetGroundHeight, PushOutCircle } from './Collision';
import type { Collider } from './Collision';
import type { Input } from './Input';
import { WeaponInstance } from './Weapons';
import type { WeaponId } from './Weapons';

const PITCH_MIN = -1.2;
const PITCH_MAX = 1.1;

export class Player {
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  hp = PLAYER_MAX_HP;
  maxHp = PLAYER_MAX_HP;
  money = PLAYER_START_MONEY;
  isCrouching = false;
  isAiming = false;
  isSprinting = false;
  isGrounded = true;
  localForwardSpeed = 0;
  localRightSpeed = 0;

  readonly slots: (WeaponInstance | null)[] = new Array(WEAPON_SLOT_COUNT).fill(null);
  currentSlot = 0;
  fireCooldown = 0;
  reloadTimer = 0;
  reloadDuration = 0;
  spreadBloom = 0;
  recoilKick = 0;

  private isCrouchToggled = false;
  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly wish = new THREE.Vector3();

  Reset(start: THREE.Vector3, subWeapon: WeaponId): void {
    this.position.copy(start);
    this.velocity.set(0, 0, 0);
    this.yaw = 0;
    this.pitch = 0;
    this.maxHp = PLAYER_MAX_HP;
    this.hp = this.maxHp;
    this.money = PLAYER_START_MONEY;
    this.isCrouching = false;
    this.isCrouchToggled = false;
    this.slots.fill(null);
    this.slots[0] = new WeaponInstance('handgun');
    this.slots[1] = new WeaponInstance(subWeapon);
    this.slots[1].reserve = this.slots[1].GetMaxReserve();
    this.currentSlot = 0;
    this.fireCooldown = 0;
    this.reloadTimer = 0;
    this.spreadBloom = 0;
    this.recoilKick = 0;
  }

  GetCurrentWeapon(): WeaponInstance | null {
    return this.slots[this.currentSlot];
  }

  GetHeight(): number {
    return this.isCrouching ? PLAYER_CROUCH_HEIGHT : PLAYER_HEIGHT;
  }

  /** 敵が狙う位置（胸のあたり） */
  GetTargetPosition(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.position.x, this.position.y + this.GetHeight() * 0.7, this.position.z);
  }

  GetForward(out: THREE.Vector3): THREE.Vector3 {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  IsReloading(): boolean {
    return this.reloadTimer > 0;
  }

  GetReloadProgress(): number {
    if (!this.IsReloading() || this.reloadDuration <= 0) return -1;
    return 1 - this.reloadTimer / this.reloadDuration;
  }

  StartReload(): boolean {
    const weapon = this.GetCurrentWeapon();
    if (!weapon || this.IsReloading() || !weapon.CanReload()) return false;
    this.reloadDuration = weapon.GetReloadTime();
    this.reloadTimer = this.reloadDuration;
    return true;
  }

  CancelReload(): void {
    this.reloadTimer = 0;
  }

  SwitchToSlot(index: number): boolean {
    if (index === this.currentSlot || !this.slots[index]) return false;
    this.currentSlot = index;
    this.CancelReload();
    this.fireCooldown = Math.max(this.fireCooldown, 0.25);
    return true;
  }

  /** マウスホイールで隣の武器へ（空きスロットは飛ばす） */
  CycleWeapon(direction: number): boolean {
    for (let step = 1; step < WEAPON_SLOT_COUNT; step++) {
      const index = (this.currentSlot + direction * step + WEAPON_SLOT_COUNT * step) % WEAPON_SLOT_COUNT;
      if (this.slots[index]) return this.SwitchToSlot(index);
    }
    return false;
  }

  /** 武器をスロットに登録し、元の武器を返す */
  AssignWeapon(index: number, weapon: WeaponInstance): WeaponInstance | null {
    const previous = this.slots[index];
    this.slots[index] = weapon;
    if (index === this.currentSlot) {
      this.CancelReload();
      this.fireCooldown = Math.max(this.fireCooldown, 0.25);
    }
    return previous;
  }

  /** 視点操作と移動 */
  UpdateMovement(dt: number, input: Input, colliders: Collider[]): void {
    this.isAiming = input.isRightDown;
    const sensitivity = MOUSE_SENSITIVITY * (this.isAiming ? AIM_SENSITIVITY_MULTIPLIER : 1);
    this.yaw -= input.mouseDeltaX * sensitivity;
    this.pitch = Clamp(this.pitch - input.mouseDeltaY * sensitivity, PITCH_MIN, PITCH_MAX);

    // リコイルで跳ね上がった視点を少しずつ戻す
    if (this.recoilKick > 0) {
      const recover = Math.min(this.recoilKick, dt * 0.25);
      this.recoilKick -= recover;
      this.pitch = Clamp(this.pitch - recover * 0.5, PITCH_MIN, PITCH_MAX);
    }
    this.spreadBloom *= Math.exp(-dt * 5);

    if (input.WasPressed('KeyC')) this.isCrouchToggled = !this.isCrouchToggled;
    this.isCrouching = this.isCrouchToggled || input.IsDown('ControlLeft') || input.IsDown('ControlRight');

    this.GetForward(this.forward);
    this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const moveForward = (input.IsDown('KeyW') ? 1 : 0) - (input.IsDown('KeyS') ? 1 : 0);
    const moveRight = (input.IsDown('KeyD') ? 1 : 0) - (input.IsDown('KeyA') ? 1 : 0);
    this.wish.set(0, 0, 0).addScaledVector(this.forward, moveForward).addScaledVector(this.right, moveRight);
    if (this.wish.lengthSq() > 0) this.wish.normalize();

    this.isSprinting = input.IsDown('ShiftLeft') && moveForward > 0 && !this.isAiming && !this.isCrouching;
    if (this.isSprinting && this.isCrouchToggled) this.isCrouchToggled = false;
    let speed = this.isCrouching ? CROUCH_SPEED : this.isSprinting ? SPRINT_SPEED : WALK_SPEED;
    if (this.isAiming) speed *= AIM_SPEED_MULTIPLIER;

    const control = this.isGrounded ? 12 : 3;
    const blend = 1 - Math.exp(-dt * control);
    this.velocity.x += (this.wish.x * speed - this.velocity.x) * blend;
    this.velocity.z += (this.wish.z * speed - this.velocity.z) * blend;

    if (input.WasPressed('Space') && this.isGrounded) {
      this.velocity.y = JUMP_SPEED;
      this.isGrounded = false;
      this.isCrouchToggled = false;
    }

    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    PushOutCircle(this.position, PLAYER_RADIUS, this.GetHeight(), colliders);
    const limit = MAP_HALF_SIZE - PLAYER_RADIUS;
    this.position.x = Clamp(this.position.x, -limit, limit);
    this.position.z = Clamp(this.position.z, -limit, limit);

    this.velocity.y -= GRAVITY * dt;
    this.position.y += this.velocity.y * dt;
    const ground = GetGroundHeight(this.position, PLAYER_RADIUS, colliders);
    if (this.position.y <= ground) {
      this.position.y = ground;
      this.velocity.y = 0;
      this.isGrounded = true;
    } else {
      this.isGrounded = this.position.y - ground < 0.05 && this.velocity.y <= 0;
    }

    this.localForwardSpeed = this.velocity.x * this.forward.x + this.velocity.z * this.forward.z;
    this.localRightSpeed = this.velocity.x * this.right.x + this.velocity.z * this.right.z;
  }

  /** 射撃間隔・リロードのタイマー更新。リロード完了時に true */
  UpdateTimers(dt: number): boolean {
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    if (this.reloadTimer <= 0) return false;
    this.reloadTimer -= dt;
    if (this.reloadTimer > 0) return false;
    this.reloadTimer = 0;
    this.GetCurrentWeapon()?.FinishReload();
    return true;
  }
}
