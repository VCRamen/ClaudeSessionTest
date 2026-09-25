// プレイヤーの見た目（VRM またはマネキン）と、コードで生成する簡易モーション

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import { BuildGunMesh } from './WeaponModels';
import type { WeaponId } from './Weapons';

export interface AvatarPoseState {
  forwardSpeed: number;
  rightSpeed: number;
  isCrouching: boolean;
  isAiming: boolean;
  isSprinting: boolean;
  isGrounded: boolean;
  aimPitch: number;
  /** 0〜1 のリロード進行度。リロード中でなければ -1 */
  reloadProgress: number;
  recoil: number;
  /** 壁に背をつけて張り付いているポーズ */
  isCoverPose: boolean;
  /** 張り付き中に顔を向ける側（モデルから見て左が +1、右が -1） */
  coverLook: number;
}

/** 腕の骨が向いている方向（VRM の正規化ボーンの T ポーズ基準） */
const RIGHT_ARM_REST_DIRECTION = new THREE.Vector3(-1, 0, 0);
const LEFT_ARM_REST_DIRECTION = new THREE.Vector3(1, 0, 0);
interface CoverArmPose {
  rightUpper: THREE.Vector3;
  rightLower: THREE.Vector3;
  leftUpper: THREE.Vector3;
  leftLower: THREE.Vector3;
  /** 銃の向き（X：上下、Y：左右） */
  gunPitch: number;
  gunYaw: number;
}

/**
 * 張り付きポーズの腕の向き（モデル空間：+Z が正面、+X がキャラクターの左）
 * 高い壁：銃を顔の横で上に向け、両手で持つ。低い遮蔽物：しゃがんで銃を体の前で斜めに抱える
 */
const HIGH_COVER_ARMS: CoverArmPose = {
  rightUpper: new THREE.Vector3(-0.3, -0.8, 0.5).normalize(),
  rightLower: new THREE.Vector3(0.2, 0.9, 0.35).normalize(),
  leftUpper: new THREE.Vector3(0.25, -0.85, 0.45).normalize(),
  leftLower: new THREE.Vector3(-0.75, 0.35, 0.55).normalize(),
  gunPitch: -1.45,
  gunYaw: 0,
};
const LOW_COVER_ARMS: CoverArmPose = {
  rightUpper: new THREE.Vector3(-0.35, -0.9, 0.2).normalize(),
  rightLower: new THREE.Vector3(0.45, 0.35, 0.8).normalize(),
  leftUpper: new THREE.Vector3(0.25, -0.8, 0.5).normalize(),
  leftLower: new THREE.Vector3(-0.35, 0.65, 0.65).normalize(),
  gunPitch: -0.9,
  gunYaw: 0.6,
};

const tmpDirection = new THREE.Vector3();
const tmpInverse = new THREE.Quaternion();

/** 骨を、親の座標系で見た方向 direction に向ける */
function PointBone(bone: THREE.Object3D | null, restDirection: THREE.Vector3, direction: THREE.Vector3): void {
  if (bone) bone.quaternion.setFromUnitVectors(restDirection, direction);
}

/** 上腕を向けた後、前腕をモデル空間の方向 direction に向ける */
function PointLowerArm(upper: THREE.Object3D | null, lower: THREE.Object3D | null, restDirection: THREE.Vector3, direction: THREE.Vector3): void {
  if (!upper || !lower) return;
  tmpInverse.copy(upper.quaternion).invert();
  tmpDirection.copy(direction).applyQuaternion(tmpInverse).normalize();
  lower.quaternion.setFromUnitVectors(restDirection, tmpDirection);
}

/** マネキンの Head ボーン相当（首の付け根）の高さ。VRM はこの高さに Head ボーンが来るよう拡大縮小する */
const MANNEQUIN_HEAD_BONE_HEIGHT = 1.62;
const DEFAULT_HEIGHT = 1.65;
/** 手の位置に対する銃の位置（グリップを握っているように見える位置） */
const GUN_OFFSET_IN_HAND = new THREE.Vector3(0, 0.05, 0.03);

const tmpHandPosition = new THREE.Vector3();

interface Rig {
  hips: THREE.Object3D | null;
  spine: THREE.Object3D | null;
  chest: THREE.Object3D | null;
  upperChest: THREE.Object3D | null;
  neck: THREE.Object3D | null;
  head: THREE.Object3D | null;
  leftUpperArm: THREE.Object3D | null;
  leftLowerArm: THREE.Object3D | null;
  leftHand: THREE.Object3D | null;
  rightUpperArm: THREE.Object3D | null;
  rightLowerArm: THREE.Object3D | null;
  rightHand: THREE.Object3D | null;
  leftUpperLeg: THREE.Object3D | null;
  leftLowerLeg: THREE.Object3D | null;
  leftFoot: THREE.Object3D | null;
  rightUpperLeg: THREE.Object3D | null;
  rightLowerLeg: THREE.Object3D | null;
  rightFoot: THREE.Object3D | null;
}

export class PlayerAvatar {
  /** プレイヤーの足元に置き、Y 回転で向きを表す（モデルは +Z が正面） */
  readonly root = new THREE.Group();

  private readonly modelHolder = new THREE.Group();
  private readonly gunPivot = new THREE.Group();
  private gunMesh: THREE.Group | null = null;
  private muzzle: THREE.Object3D | null = null;
  private currentWeaponId: WeaponId | null = null;

  private vrm: VRM | null = null;
  /** VRM 0.x のモデルか（ボーンの向きの扱いが 1.0 と違う） */
  private isVrm0 = false;
  private rig: Rig | null = null;
  private mannequin: Mannequin;
  private hipsRestPosition = new THREE.Vector3();
  private modelScale = 1;

  private walkPhase = 0;
  private crouchAmount = 0;
  /** 低い遮蔽物の陰で深くしゃがむ度合い（0〜1） */
  private squatAmount = 0;
  private airAmount = 0;
  private moveAmount = 0;
  private smoothedForward = 0;
  private smoothedRight = 0;
  private time = 0;

  constructor() {
    this.root.add(this.modelHolder);
    this.root.add(this.gunPivot);
    this.mannequin = new Mannequin();
    this.modelHolder.add(this.mannequin.group);
  }

  HasVrm(): boolean {
    return this.vrm !== null;
  }

  async LoadVrmFromFile(file: File): Promise<string> {
    const url = URL.createObjectURL(file);
    try {
      const loader = new GLTFLoader();
      loader.register((parser) => new VRMLoaderPlugin(parser));
      const gltf = await loader.loadAsync(url);
      const vrm = gltf.userData.vrm as VRM | undefined;
      if (!vrm) throw new Error('VRM データが見つかりませんでした');

      VRMUtils.removeUnnecessaryVertices(gltf.scene);
      VRMUtils.combineSkeletons(gltf.scene);
      VRMUtils.rotateVRM0(vrm);
      vrm.scene.traverse((object) => {
        object.frustumCulled = false;
        if ((object as THREE.Mesh).isMesh) {
          object.castShadow = true;
        }
      });

      this.SetVrm(vrm);
      const meta = vrm.meta as unknown as { name?: string; title?: string };
      return meta.name ?? meta.title ?? file.name;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  SetWeapon(id: WeaponId | null): void {
    if (id === this.currentWeaponId) return;
    this.currentWeaponId = id;
    if (this.gunMesh) {
      this.gunPivot.remove(this.gunMesh);
      this.gunMesh = null;
      this.muzzle = null;
    }
    if (!id) return;
    this.gunMesh = BuildGunMesh(id);
    this.gunMesh.position.copy(GUN_OFFSET_IN_HAND);
    this.gunPivot.add(this.gunMesh);
    this.muzzle = this.gunMesh.getObjectByName('muzzle') ?? null;
  }

  GetMuzzleWorldPosition(out: THREE.Vector3): THREE.Vector3 {
    if (this.muzzle) return this.muzzle.getWorldPosition(out);
    return this.gunPivot.getWorldPosition(out);
  }

  Update(dt: number, state: AvatarPoseState): void {
    this.time += dt;
    const blend = 1 - Math.exp(-dt * 12);
    this.crouchAmount += ((state.isCrouching ? 1 : 0) - this.crouchAmount) * blend;
    this.squatAmount += ((state.isCoverPose && state.isCrouching ? 1 : 0) - this.squatAmount) * blend;
    this.airAmount += ((state.isGrounded ? 0 : 1) - this.airAmount) * blend;
    this.smoothedForward += (state.forwardSpeed - this.smoothedForward) * blend;
    this.smoothedRight += (state.rightSpeed - this.smoothedRight) * blend;
    const speed = Math.hypot(this.smoothedForward, this.smoothedRight);
    this.moveAmount = Math.min(1, speed / 4.5);
    if (state.isGrounded) {
      this.walkPhase += dt * (4 + speed * 1.3) * (speed > 0.2 ? 1 : 0);
    }

    if (this.vrm && this.rig) {
      this.PoseVrm(state);
      this.vrm.update(dt);
    } else {
      this.mannequin.Pose(state, this.walkPhase, this.moveAmount, this.crouchAmount, this.squatAmount, this.airAmount,
        this.smoothedForward, this.smoothedRight);
    }
    this.AttachGunToHand(state);
  }

  /** ポーズ後の右手の位置に銃を置き、エイム方向に向ける */
  private AttachGunToHand(state: AvatarPoseState): void {
    const hand = this.rig?.rightHand ?? this.mannequin.rightHandAnchor;
    this.root.updateMatrixWorld(true);
    hand.getWorldPosition(tmpHandPosition);
    this.root.worldToLocal(tmpHandPosition);
    this.gunPivot.position.copy(tmpHandPosition);
    if (state.isCoverPose) {
      const arms = state.isCrouching ? LOW_COVER_ARMS : HIGH_COVER_ARMS;
      this.gunPivot.rotation.set(arms.gunPitch, arms.gunYaw, 0);
    } else {
      this.gunPivot.rotation.set(-state.aimPitch - state.recoil * 2, 0, 0);
    }
    if (state.reloadProgress >= 0) {
      const reloadTilt = Math.sin(state.reloadProgress * Math.PI);
      this.gunPivot.rotation.x += reloadTilt * 0.6;
      this.gunPivot.rotation.z = reloadTilt * 0.5;
    }
  }

  private SetVrm(vrm: VRM): void {
    if (this.vrm) {
      this.modelHolder.remove(this.vrm.scene);
      VRMUtils.deepDispose(this.vrm.scene);
    }
    this.mannequin.group.visible = false;
    this.vrm = vrm;
    this.isVrm0 = (vrm.meta as unknown as { metaVersion?: string }).metaVersion === '0';
    this.modelHolder.add(vrm.scene);

    const humanoid = vrm.humanoid;
    const GetBone = (name: VRMHumanBoneName) => humanoid.getNormalizedBoneNode(name);
    this.rig = {
      hips: GetBone('hips'),
      spine: GetBone('spine'),
      chest: GetBone('chest'),
      upperChest: GetBone('upperChest'),
      neck: GetBone('neck'),
      head: GetBone('head'),
      leftUpperArm: GetBone('leftUpperArm'),
      leftLowerArm: GetBone('leftLowerArm'),
      leftHand: GetBone('leftHand'),
      rightUpperArm: GetBone('rightUpperArm'),
      rightLowerArm: GetBone('rightLowerArm'),
      rightHand: GetBone('rightHand'),
      leftUpperLeg: GetBone('leftUpperLeg'),
      leftLowerLeg: GetBone('leftLowerLeg'),
      leftFoot: GetBone('leftFoot'),
      rightUpperLeg: GetBone('rightUpperLeg'),
      rightLowerLeg: GetBone('rightLowerLeg'),
      rightFoot: GetBone('rightFoot'),
    };
    humanoid.resetNormalizedPose();
    vrm.update(0);
    if (this.rig.hips) this.hipsRestPosition.copy(this.rig.hips.position);

    // Head ボーンの高さがマネキンの頭の位置と揃うように拡大縮小する
    this.modelHolder.scale.setScalar(1);
    this.root.updateMatrixWorld(true);
    const headPosition = new THREE.Vector3();
    if (this.rig.head) {
      this.rig.head.getWorldPosition(headPosition);
      this.root.worldToLocal(headPosition);
    }
    if (headPosition.y > 0.1) {
      this.modelScale = MANNEQUIN_HEAD_BONE_HEIGHT / headPosition.y;
    } else {
      const bounds = new THREE.Box3().setFromObject(vrm.scene);
      this.modelScale = DEFAULT_HEIGHT / Math.max(0.1, bounds.max.y - bounds.min.y);
    }
    this.modelHolder.scale.setScalar(this.modelScale);
    this.root.updateMatrixWorld(true);
  }

  /** VRM の正規化ボーンを直接回してポーズを作る（モデルは +Z が正面） */
  private PoseVrm(state: AvatarPoseState): void {
    const rig = this.rig!;
    const crouch = this.crouchAmount;
    const air = this.airAmount;
    const move = this.moveAmount * (1 - air);
    const speed = Math.max(0.01, Math.hypot(this.smoothedForward, this.smoothedRight));
    const forwardRatio = this.smoothedForward / speed;
    const rightRatio = this.smoothedRight / speed;
    const swing = Math.sin(this.walkPhase);
    const swingCos = Math.cos(this.walkPhase);
    const stride = move * (state.isSprinting ? 0.8 : 0.55) * (1 - crouch * 0.4);

    // 腰
    if (rig.hips) {
      const hipsDrop = (crouch * 0.3 + this.squatAmount * 0.38) * this.hipsRestPosition.y;
      const bob = Math.abs(swingCos) * 0.03 * move;
      rig.hips.position.set(
        this.hipsRestPosition.x,
        this.hipsRestPosition.y - hipsDrop - bob,
        this.hipsRestPosition.z,
      );
      rig.hips.rotation.set(0, 0, 0);
    }

    // 脚：前後の振り（負の X 回転で脚が前に出る）
    // 低い遮蔽物の陰では膝を開いて深くしゃがむ
    const squat = this.squatAmount;
    const legBaseX = -crouch * 1.0 - squat * 0.6 - air * 0.5;
    const kneeBase = crouch * 1.7 + squat * 0.8 + air * 0.9;
    const kneeSpread = squat * 0.18;
    const strafeSwing = swing * stride * rightRatio * 0.5;
    SetRotation(rig.leftUpperLeg, legBaseX - swing * stride * forwardRatio, 0, -strafeSwing + kneeSpread);
    SetRotation(rig.rightUpperLeg, legBaseX + swing * stride * forwardRatio, 0, -strafeSwing - kneeSpread);
    SetRotation(rig.leftLowerLeg, kneeBase + Math.max(0, -swingCos) * stride * 1.4, 0, 0);
    SetRotation(rig.rightLowerLeg, kneeBase + Math.max(0, swingCos) * stride * 1.4, 0, 0);
    // 足の裏が地面と平行になるように、太ももとすねの角度を打ち消す
    const footX = -(legBaseX + kneeBase) * (1 - air);
    SetRotation(rig.leftFoot, footX, 0, 0);
    SetRotation(rig.rightFoot, footX, 0, 0);

    // 上半身：エイムの上下に合わせて反らす
    const pitch = state.aimPitch;
    const lean = crouch * 0.3 + (state.isSprinting ? 0.15 : 0);
    SetRotation(rig.spine, lean - pitch * 0.3, 0.12, 0);
    SetRotation(rig.chest, -pitch * 0.35, 0.1, 0);
    SetRotation(rig.upperChest, -pitch * 0.2, 0.05, 0);
    SetRotation(rig.neck, -pitch * 0.1, -0.12, 0);
    SetRotation(rig.head, -pitch * 0.1 - lean * 0.5, -0.12, 0);

    // 腕：銃を両手で前に構える
    const reload = state.reloadProgress >= 0 ? Math.sin(state.reloadProgress * Math.PI) : 0;
    const recoil = state.recoil * 3;
    SetRotation(rig.rightUpperArm, -recoil, 1.25, 0.35);
    SetRotation(rig.rightLowerArm, 0, 0.35, 0);
    SetRotation(rig.rightHand, 0, 0, 0);
    SetRotation(rig.leftUpperArm, -recoil + reload * 0.5, -1.15, -0.4 - reload * 0.4);
    SetRotation(rig.leftLowerArm, 0, -1.0 + reload * 0.6, 0);
    SetRotation(rig.leftHand, 0, 0, 0);

    if (state.isCoverPose) this.PoseVrmCover(state);
    if (this.isVrm0) this.ConvertPoseToVrm0();
  }

  /** 壁に背をつけるポーズ（高い壁は立って銃を顔の横に、低い遮蔽物はしゃがんで銃を斜めに抱える） */
  private PoseVrmCover(state: AvatarPoseState): void {
    const rig = this.rig!;
    const crouch = this.crouchAmount;
    const look = state.coverLook;
    const arms = state.isCrouching ? LOW_COVER_ARMS : HIGH_COVER_ARMS;
    SetRotation(rig.spine, -0.08 + crouch * 0.25, 0, 0);
    SetRotation(rig.chest, 0, look * 0.15, 0);
    SetRotation(rig.upperChest, 0, 0, 0);
    SetRotation(rig.neck, 0, look * 0.35, 0);
    SetRotation(rig.head, 0.05, look * 0.6, look * -0.08);
    PointBone(rig.rightUpperArm, RIGHT_ARM_REST_DIRECTION, arms.rightUpper);
    PointLowerArm(rig.rightUpperArm, rig.rightLowerArm, RIGHT_ARM_REST_DIRECTION, arms.rightLower);
    PointBone(rig.leftUpperArm, LEFT_ARM_REST_DIRECTION, arms.leftUpper);
    PointLowerArm(rig.leftUpperArm, rig.leftLowerArm, LEFT_ARM_REST_DIRECTION, arms.leftLower);
  }

  /**
   * ポーズは VRM 1.0 の向き（+Z が正面）で作っている。VRM 0.x の正規化ボーンはモデル本来の向き（-Z が正面）の
   * ままなので、Y 軸まわりに 180 度回した座標系へ変換する（クォータニオンの X と Z の符号を反転）
   */
  private ConvertPoseToVrm0(): void {
    for (const bone of Object.values(this.rig!)) {
      if (!bone) continue;
      const q = bone.quaternion;
      q.set(-q.x, q.y, -q.z, q.w);
    }
  }
}

function SetRotation(bone: THREE.Object3D | null, x: number, y: number, z: number): void {
  if (bone) bone.rotation.set(x, y, z);
}

/** VRM 未読み込み時に表示する簡易マネキン */
class Mannequin {
  readonly group = new THREE.Group();
  /** 右手の位置（銃を持たせる場所） */
  readonly rightHandAnchor = new THREE.Object3D();

  private readonly pelvis = new THREE.Group();
  private readonly torso = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly leftLeg: LimbPivot;
  private readonly rightLeg: LimbPivot;
  private readonly leftArm = new THREE.Group();
  private readonly rightArm = new THREE.Group();

  constructor() {
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x3d5a80, roughness: 0.6 });
    const jointMaterial = new THREE.MeshStandardMaterial({ color: 0x98c1d9, roughness: 0.5 });
    const skinMaterial = new THREE.MeshStandardMaterial({ color: 0xe0c3a8, roughness: 0.7 });

    this.pelvis.position.y = 0.95;
    this.group.add(this.pelvis);

    const hipMesh = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.2), bodyMaterial);
    hipMesh.castShadow = true;
    this.pelvis.add(hipMesh);

    this.torso.position.y = 0.05;
    this.pelvis.add(this.torso);
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.22), bodyMaterial);
    chest.position.y = 0.3;
    chest.castShadow = true;
    this.torso.add(chest);

    this.head.position.y = 0.62;
    this.torso.add(this.head);
    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), skinMaterial);
    headMesh.position.y = 0.12;
    headMesh.castShadow = true;
    this.head.add(headMesh);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.05), jointMaterial);
    visor.position.set(0, 0.14, 0.11);
    this.head.add(visor);

    // 腕は前方（+Z）へ伸ばした状態で作る
    for (const [arm, side] of [[this.leftArm, 1], [this.rightArm, -1]] as const) {
      arm.position.set(0.24 * side, 0.5, 0);
      this.torso.add(arm);
      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.5), jointMaterial);
      upper.position.z = 0.22;
      upper.castShadow = true;
      arm.add(upper);
    }
    this.rightHandAnchor.position.set(0, 0, 0.47);
    this.rightArm.add(this.rightHandAnchor);
    this.leftArm.rotation.set(0.1, -0.5, 0);
    this.rightArm.rotation.set(0.15, 0.25, 0);

    this.leftLeg = new LimbPivot(bodyMaterial, jointMaterial);
    this.leftLeg.root.position.set(0.1, 0, 0);
    this.pelvis.add(this.leftLeg.root);
    this.rightLeg = new LimbPivot(bodyMaterial, jointMaterial);
    this.rightLeg.root.position.set(-0.1, 0, 0);
    this.pelvis.add(this.rightLeg.root);
  }

  Pose(
    state: AvatarPoseState,
    walkPhase: number,
    moveAmount: number,
    crouch: number,
    squat: number,
    air: number,
    forwardSpeed: number,
    rightSpeed: number,
  ): void {
    const speed = Math.max(0.01, Math.hypot(forwardSpeed, rightSpeed));
    const forwardRatio = forwardSpeed / speed;
    const rightRatio = rightSpeed / speed;
    const move = moveAmount * (1 - air);
    const stride = move * (state.isSprinting ? 0.8 : 0.55);
    const swing = Math.sin(walkPhase);
    const swingCos = Math.cos(walkPhase);

    this.pelvis.position.y = 0.95 - crouch * 0.38 - squat * 0.3 - Math.abs(swingCos) * 0.03 * move;
    const legBase = -crouch * 1.1 - squat * 0.55 - air * 0.5;
    const kneeBase = crouch * 1.9 + squat * 0.7 + air * 0.9;
    this.leftLeg.Set(legBase - swing * stride * forwardRatio, -swing * stride * rightRatio * 0.5,
      kneeBase + Math.max(0, -swingCos) * stride * 1.4);
    this.rightLeg.Set(legBase + swing * stride * forwardRatio, -swing * stride * rightRatio * 0.5,
      kneeBase + Math.max(0, swingCos) * stride * 1.4);

    this.torso.rotation.set(crouch * 0.3 - state.aimPitch * 0.4, 0, 0);
    this.head.rotation.set(-state.aimPitch * 0.3, 0, 0);
    const armPitch = -state.aimPitch * 0.6 + state.recoil * -3;
    const reload = state.reloadProgress >= 0 ? Math.sin(state.reloadProgress * Math.PI) : 0;
    this.rightArm.rotation.set(0.15 + armPitch, 0.25, 0);
    this.leftArm.rotation.set(0.1 + armPitch + reload * 0.8, -0.5 + reload * 0.3, 0);
    if (state.isCoverPose) {
      // 壁に背をつけて顔を横に向ける。高い壁は銃を顔の横に、低い遮蔽物は体の前に構える
      this.torso.rotation.set(crouch * 0.25 - 0.05, state.coverLook * 0.15, 0);
      this.head.rotation.set(0, state.coverLook * 0.8, 0);
      if (state.isCrouching) {
        this.rightArm.rotation.set(0.7, 0.3, 0);
        this.leftArm.rotation.set(0.3, -0.6, 0);
      } else {
        this.rightArm.rotation.set(-0.7, 0.2, 0);
        this.leftArm.rotation.set(-0.2, -0.7, 0);
      }
    }
  }
}

class LimbPivot {
  readonly root = new THREE.Group();
  private readonly knee = new THREE.Group();

  constructor(upperMaterial: THREE.Material, lowerMaterial: THREE.Material) {
    const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.45, 0.14), upperMaterial);
    thigh.position.y = -0.22;
    thigh.castShadow = true;
    this.root.add(thigh);
    this.knee.position.y = -0.45;
    this.root.add(this.knee);
    const shin = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.45, 0.12), lowerMaterial);
    shin.position.y = -0.24;
    shin.castShadow = true;
    this.knee.add(shin);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.06, 0.22), upperMaterial);
    foot.position.set(0, -0.47, 0.05);
    foot.castShadow = true;
    this.knee.add(foot);
  }

  Set(hipPitch: number, hipRoll: number, kneePitch: number): void {
    this.root.rotation.set(hipPitch, 0, hipRoll);
    this.knee.rotation.set(kneePitch, 0, 0);
  }
}
