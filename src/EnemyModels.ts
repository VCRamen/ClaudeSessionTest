// ハロウィン系モンスターの簡易モデル（+Z が正面）

import * as THREE from 'three';

export interface EnemyModel {
  group: THREE.Group;
  /** 羽ばたきなどのアニメーション用 */
  Animate: (time: number, moveAmount: number) => void;
}

const eyeGlowMaterial = new THREE.MeshBasicMaterial({ color: 0xffdd33, side: THREE.DoubleSide });
const redEyeMaterial = new THREE.MeshBasicMaterial({ color: 0xff2020 });
const blackMaterial = new THREE.MeshBasicMaterial({ color: 0x050505 });

function CreateCarvedEye(size: number): THREE.Mesh {
  // 3 分割の円 = 三角形。頂点を上に向ける
  const eye = new THREE.Mesh(new THREE.CircleGeometry(size, 3), eyeGlowMaterial);
  eye.rotation.z = Math.PI / 2;
  return eye;
}

function CreatePumpkinHead(radius: number): THREE.Group {
  const head = new THREE.Group();
  const pumpkinMaterial = new THREE.MeshStandardMaterial({ color: 0xff7518, roughness: 0.55, emissive: 0x401000 });
  // 縦の溝を表現するため少しずつ回した楕円体を重ねる
  for (let i = 0; i < 4; i++) {
    const lobe = new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 12), pumpkinMaterial);
    lobe.scale.set(0.75, 0.85, 1.0);
    lobe.rotation.y = (i / 4) * Math.PI;
    lobe.castShadow = true;
    head.add(lobe);
  }
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.1, radius * 0.16, radius * 0.45, 6),
    new THREE.MeshStandardMaterial({ color: 0x3d6b21 }),
  );
  stem.position.y = radius * 0.95;
  stem.rotation.z = 0.25;
  head.add(stem);

  for (const side of [-1, 1]) {
    const eye = CreateCarvedEye(radius * 0.2);
    eye.position.set(side * radius * 0.35, radius * 0.2, radius * 1.0);
    head.add(eye);
  }
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(radius * 0.9, radius * 0.18, radius * 0.1), eyeGlowMaterial);
  mouth.position.set(0, -radius * 0.3, radius * 0.93);
  head.add(mouth);
  for (let i = -1; i <= 1; i += 2) {
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(radius * 0.12, radius * 0.12, radius * 0.12), pumpkinMaterial);
    tooth.position.set(i * radius * 0.2, -radius * 0.24, radius * 0.95);
    head.add(tooth);
  }
  return head;
}

/** カボチャ頭の魔導士（火球を撃つ） */
export function BuildPumpkinModel(): EnemyModel {
  const group = new THREE.Group();
  const robeMaterial = new THREE.MeshStandardMaterial({ color: 0x2c1a40, roughness: 0.9 });
  const robe = new THREE.Mesh(new THREE.ConeGeometry(0.48, 1.1, 10), robeMaterial);
  robe.position.y = 0.55;
  robe.castShadow = true;
  group.add(robe);

  const head = CreatePumpkinHead(0.42);
  head.position.y = 1.38;
  group.add(head);

  // 杖
  const staff = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 6), new THREE.MeshStandardMaterial({ color: 0x4a3020 }));
  staff.add(stick);
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff6a00 }));
  orb.position.y = 0.75;
  staff.add(orb);
  staff.position.set(0.45, 0.8, 0.2);
  group.add(staff);

  return {
    group,
    Animate: (time, moveAmount) => {
      head.rotation.z = Math.sin(time * 6) * 0.08 * moveAmount;
      head.position.y = 1.38 + Math.abs(Math.sin(time * 6)) * 0.05 * moveAmount;
      orb.scale.setScalar(1 + Math.sin(time * 10) * 0.2);
    },
  };
}

/** ゴースト（ゆっくりした追尾弾を撃つ） */
export function BuildGhostModel(): EnemyModel {
  const group = new THREE.Group();
  const ghostMaterial = new THREE.MeshStandardMaterial({
    color: 0xe8f0ff,
    emissive: 0x6f7fbf,
    emissiveIntensity: 0.5,
    transparent: true,
    opacity: 0.85,
    roughness: 0.3,
  });
  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 18, 14, 0, Math.PI * 2, 0, Math.PI / 2), ghostMaterial);
  group.add(headMesh);
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.15, 0.9, 18, 1, true), ghostMaterial);
  tail.position.y = -0.45;
  group.add(tail);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), blackMaterial);
    eye.scale.set(1, 1.5, 0.5);
    eye.position.set(side * 0.17, 0.18, 0.44);
    group.add(eye);
  }
  const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), blackMaterial);
  mouth.scale.set(1, 1.4, 0.4);
  mouth.position.set(0, -0.05, 0.47);
  group.add(mouth);
  const arms: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.45, 8), ghostMaterial);
    arm.position.set(side * 0.5, -0.15, 0.1);
    arm.rotation.z = side * 1.9;
    group.add(arm);
    arms.push(arm);
  }
  return {
    group,
    Animate: (time) => {
      tail.rotation.y = time * 2;
      tail.scale.x = 1 + Math.sin(time * 5) * 0.06;
      arms[0].rotation.x = Math.sin(time * 4) * 0.4;
      arms[1].rotation.x = -Math.sin(time * 4) * 0.4;
    },
  };
}

/** コウモリ（高速で接近して噛みつく） */
export function BuildBatModel(): EnemyModel {
  const group = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x2a1535, roughness: 0.8 });
  const wingMaterial = new THREE.MeshStandardMaterial({ color: 0x3d1f4d, side: THREE.DoubleSide, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), bodyMaterial);
  body.scale.set(1, 0.9, 1.1);
  group.add(body);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 4), bodyMaterial);
    ear.position.set(side * 0.1, 0.22, 0.02);
    group.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), redEyeMaterial);
    eye.position.set(side * 0.08, 0.05, 0.2);
    group.add(eye);
  }
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0);
  wingShape.lineTo(0.7, 0.25);
  wingShape.lineTo(0.6, -0.05);
  wingShape.lineTo(0.45, 0.02);
  wingShape.lineTo(0.3, -0.1);
  wingShape.lineTo(0.15, 0);
  wingShape.lineTo(0, -0.15);
  const wingGeometry = new THREE.ShapeGeometry(wingShape);
  const wings: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    const wing = new THREE.Mesh(wingGeometry, wingMaterial);
    wing.rotation.x = -Math.PI / 2;
    wing.scale.x = side;
    pivot.add(wing);
    pivot.position.set(side * 0.12, 0.02, 0);
    group.add(pivot);
    wings.push(pivot);
  }
  return {
    group,
    Animate: (time) => {
      const flap = Math.sin(time * 22) * 0.9;
      wings[0].rotation.z = flap;
      wings[1].rotation.z = -flap;
    },
  };
}

/** ボス：パンプキンキング */
export function BuildPumpkinKingModel(): EnemyModel {
  const group = new THREE.Group();
  const capeMaterial = new THREE.MeshStandardMaterial({ color: 0x3a0a14, roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.2, 12), capeMaterial);
  body.position.y = 1.1;
  body.castShadow = true;
  group.add(body);
  const head = CreatePumpkinHead(0.95);
  head.position.y = 2.9;
  group.add(head);

  const crownMaterial = new THREE.MeshStandardMaterial({ color: 0xffc400, metalness: 0.9, roughness: 0.25, emissive: 0x402800 });
  const crown = new THREE.Group();
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 0.2, 12, 1, true), crownMaterial);
  crown.add(band);
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.35, 4), crownMaterial);
    spike.position.set(Math.sin(angle) * 0.5, 0.25, Math.cos(angle) * 0.5);
    crown.add(spike);
  }
  crown.position.y = 3.85;
  group.add(crown);

  const hands: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff5a00 }));
    hand.position.set(side * 1.1, 1.8, 0.5);
    group.add(hand);
    hands.push(hand);
  }
  return {
    group,
    Animate: (time, moveAmount) => {
      head.rotation.z = Math.sin(time * 2) * 0.05;
      crown.rotation.y = time * 0.5;
      body.rotation.z = Math.sin(time * 3) * 0.03 * moveAmount;
      for (let i = 0; i < hands.length; i++) {
        hands[i].position.y = 1.8 + Math.sin(time * 3 + i * Math.PI) * 0.15;
      }
    },
  };
}
