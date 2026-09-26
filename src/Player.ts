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
import { FindCover } from './Cover';
import type { CoverSpot } from './Cover';
import { WeaponInstance } from './Weapons';
import type { WeaponId } from './Weapons';

const PITCH_MIN = -1.2;
const PITCH_MAX = 1.1;
/** 壁の端から何 m 以内なら「端にいる」（身を乗り出せる） */
const COVER_EDGE_DISTANCE = 0.45;
/** 身を乗り出してから撃てるまでの時間 */
const POP_OUT_READY_TIME = 0.12;
/** 壁から離れる入力をこの時間続けるとカバーを解除 */
const COVER_EXIT_HOLD_TIME = 0.2;

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
  /** エイム中の視点感度の倍率（スコープの倍率が高いほど小さくする） */
  aimSensitivityScale = AIM_SENSITIVITY_MULTIPLIER;

  /** 張り付いている壁（張り付いていなければ null） */
  cover: CoverSpot | null = null;
  /** 壁に沿ってどちら向きか（tangent 方向に +1 / -1）。身を乗り出す側 */
  coverSide = 1;
  /** カバー中に身を乗り出して構えているか */
  isPoppedOut = false;
  private coverT = 0;
  private peekAmount = 0;
  /** 壁沿いの移動が別の物に阻まれている側（+1 / -1、阻まれていなければ 0） */
  private coverBlockedSide = 0;
  /** 張り付いたときにカメラを自動で向ける残り時間と、その向き */
  private cameraAssistTimer = 0;
  private cameraAssistYaw = 0;
  private coverExitTimer = 0;
  private popOutTime = 0;

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
    this.ExitCover();
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

  IsInCover(): boolean {
    return this.cover !== null;
  }

  /** 撃てる状態か（カバー中は身を乗り出している間だけ） */
  CanFire(): boolean {
    return !this.cover || (this.isPoppedOut && this.popOutTime >= POP_OUT_READY_TIME);
  }

  /** 壁の端（身を乗り出せる位置）にいるか。壁沿いに置かれた物で行き止まりの場合も含む */
  IsAtCoverEdge(): boolean {
    return this.IsAtCoverCorner() || (this.cover !== null && this.coverBlockedSide === this.coverSide);
  }

  /** 壁の角にいるか（角からは横へ回り込んで身を乗り出す） */
  private IsAtCoverCorner(): boolean {
    if (!this.cover) return false;
    return this.coverSide > 0
      ? this.coverT >= this.cover.maxT - COVER_EDGE_DISTANCE
      : this.coverT <= this.cover.minT + COVER_EDGE_DISTANCE;
  }

  /** キャラクターモデルの向き（Y 回転）。張り付き中は壁や遮蔽物に背をつける */
  GetAvatarYaw(): number {
    if (this.cover && !this.isPoppedOut) return Math.atan2(this.cover.normal.x, this.cover.normal.z);
    return this.yaw + Math.PI;
  }

  /** 張り付いた向きに合わせてカメラを自動で回す */
  private StartCoverCameraAssist(): void {
    const cover = this.cover;
    if (!cover) return;
    // キャラクターの前（壁から離れた側）から、壁と身を乗り出す側を斜めに見る。キャラクターの前面が映る
    const lookX = -cover.normal.x * 0.75 + cover.tangent.x * this.coverSide * 0.65;
    const lookZ = -cover.normal.z * 0.75 + cover.tangent.z * this.coverSide * 0.65;
    this.cameraAssistYaw = Math.atan2(-lookX, -lookZ);
    this.cameraAssistTimer = 0.5;
  }

  private UpdateCameraAssist(dt: number, input: Input): void {
    if (this.cameraAssistTimer <= 0) return;
    // マウスを動かしたらプレイヤーの操作を優先する
    if (Math.abs(input.mouseDeltaX) > 2) {
      this.cameraAssistTimer = 0;
      return;
    }
    this.cameraAssistTimer -= dt;
    let difference = this.cameraAssistYaw - this.yaw;
    difference = Math.atan2(Math.sin(difference), Math.cos(difference));
    this.yaw += difference * (1 - Math.exp(-dt * 10));
  }

  /** カバー中に顔を向ける側（モデルから見て左が +1、右が -1） */
  GetCoverLook(): number {
    if (!this.cover) return 0;
    const normal = this.cover.normal;
    const lookX = this.cover.tangent.x * this.coverSide;
    const lookZ = this.cover.tangent.z * this.coverSide;
    return lookX * normal.z - lookZ * normal.x > 0 ? 1 : -1;
  }

  /** 近くの壁に張り付く。張り付けたら true */
  TryEnterCover(colliders: Collider[]): boolean {
    const direction = this.wish.lengthSq() > 0.01 ? this.wish : this.forward;
    const spot = FindCover(this.position, direction, colliders);
    if (!spot) return false;
    this.cover = spot;
    const t = this.position.x * spot.tangent.x + this.position.z * spot.tangent.z;
    this.coverT = Clamp(t, spot.minT + 0.05, spot.maxT - 0.05);
    this.coverSide = this.forward.dot(spot.tangent) >= 0 ? 1 : -1;
    this.velocity.set(0, 0, 0);
    this.isCrouchToggled = false;
    this.peekAmount = 0;
    this.coverExitTimer = 0;
    this.coverBlockedSide = 0;
    this.StartCoverCameraAssist();
    return true;
  }

  ExitCover(): void {
    this.cover = null;
    this.cameraAssistTimer = 0;
    this.isPoppedOut = false;
    this.peekAmount = 0;
    this.popOutTime = 0;
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
    const sensitivity = MOUSE_SENSITIVITY * (this.isAiming ? this.aimSensitivityScale : 1);
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

    if (input.WasPressed('KeyQ')) {
      if (this.cover) this.ExitCover();
      else this.TryEnterCover(colliders);
    }
    if (this.cover) {
      this.UpdateCover(dt, input, colliders);
      return;
    }

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

  /** 張り付き中の移動（壁に沿った移動と、身を乗り出す動き） */
  private UpdateCover(dt: number, input: Input, colliders: Collider[]): void {
    const cover = this.cover!;
    const along = this.wish.dot(cover.tangent);
    const away = this.wish.dot(cover.normal);

    // 壁から離れる方向へ入力し続けたら解除
    if (away > 0.7) {
      this.coverExitTimer += dt;
      if (this.coverExitTimer >= COVER_EXIT_HOLD_TIME) {
        this.ExitCover();
        return;
      }
    } else {
      this.coverExitTimer = 0;
    }

    // 構える（右クリック）か撃つ（左クリック）と身を乗り出す。高い壁は端にいるときだけ
    const wantsPopOut = input.isRightDown || input.isLeftDown;
    this.isPoppedOut = wantsPopOut && (cover.isLow || this.IsAtCoverEdge());
    this.popOutTime = this.isPoppedOut ? this.popOutTime + dt : 0;
    this.isAiming = this.isPoppedOut;
    this.isSprinting = false;
    this.isCrouching = cover.isLow && !this.isPoppedOut;

    this.UpdateCameraAssist(dt, input);
    const isMoving = !this.isPoppedOut && Math.abs(along) > 0.2;
    if (isMoving) {
      const newSide = along > 0 ? 1 : -1;
      // 向きを変えたら、カメラも反対側へ向け直す
      if (newSide !== this.coverSide) {
        this.coverSide = newSide;
        this.StartCoverCameraAssist();
      }
      this.coverSide = newSide;
      const speed = cover.isLow ? CROUCH_SPEED : WALK_SPEED * 0.6;
      this.coverT += Math.sign(along) * speed * dt;
    }
    this.coverT = Clamp(this.coverT, cover.minT + 0.05, cover.maxT - 0.05);
    const intendedT = this.coverT;

    // 高い壁から身を乗り出す：角なら横へ回り込み、物で行き止まりなら壁から一歩離れる
    const peekTarget = this.isPoppedOut && !cover.isLow ? 1 : 0;
    this.peekAmount += (peekTarget - this.peekAmount) * (1 - Math.exp(-dt * 14));
    const isCorner = this.IsAtCoverCorner();
    const edgeT = this.coverSide > 0 ? cover.maxT : cover.minT;
    const peekT = isCorner ? edgeT + this.coverSide * (PLAYER_RADIUS + 0.35) : this.coverT;
    const t = this.coverT + (peekT - this.coverT) * this.peekAmount;
    const offset = cover.faceDistance + PLAYER_RADIUS + 0.03 + this.peekAmount * (isCorner ? 0.25 : 0.75);

    const previousX = this.position.x;
    const previousZ = this.position.z;
    this.position.x = cover.tangent.x * t + cover.normal.x * offset;
    this.position.z = cover.tangent.z * t + cover.normal.z * offset;
    // 壁際に置かれた別の物（自販機など）にはめり込まない
    const others = colliders.filter((collider) => collider !== cover.collider);
    PushOutCircle(this.position, PLAYER_RADIUS, this.GetHeight(), others);
    if (this.peekAmount < 0.01) {
      this.coverT = this.position.x * cover.tangent.x + this.position.z * cover.tangent.z;
      // 押し戻された＝その先は物でふさがっている
      if (isMoving) this.coverBlockedSide = Math.abs(this.coverT - intendedT) > 0.01 ? this.coverSide : 0;
    }
    this.position.y = GetGroundHeight(this.position, PLAYER_RADIUS, others);
    this.velocity.set(0, 0, 0);
    this.isGrounded = true;

    // アニメーション用の移動速度（モデルの向き基準）
    const velocityX = (this.position.x - previousX) / Math.max(dt, 1e-4);
    const velocityZ = (this.position.z - previousZ) / Math.max(dt, 1e-4);
    const facingYaw = this.GetAvatarYaw();
    const facingX = Math.sin(facingYaw);
    const facingZ = Math.cos(facingYaw);
    this.localForwardSpeed = velocityX * facingX + velocityZ * facingZ;
    this.localRightSpeed = velocityX * -facingZ + velocityZ * facingX;
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
