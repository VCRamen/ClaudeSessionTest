// 武器の定義とインスタンス（弾数・強化レベル）

import { MAX_WEAPON_LEVEL, SCOPE_DEFAULT_MAGNIFICATION } from './Config';

/** 武器の種類（モデル・効果音・スコープの有無などに使う） */
export type WeaponType = 'handgun' | 'smg' | 'shotgun' | 'rifle' | 'sniper' | 'launcher';

/** 武器の機種。同じ種類でも機種ごとに性能が違う */
export type WeaponId =
  | 'handgun' | 'magnum' | 'machinePistol'
  | 'smg' | 'rapidSmg' | 'heavySmg'
  | 'shotgun' | 'doubleBarrel' | 'autoShotgun'
  | 'rifle' | 'battleRifle' | 'burstRifle'
  | 'sniper' | 'dmr' | 'antiMateriel'
  | 'rocket' | 'grenadeLauncher';

export interface WeaponDef {
  id: WeaponId;
  type: WeaponType;
  name: string;
  /** 性能の特徴（拾うときに表示する） */
  description: string;
  /** 出現段階。Wave が進むと高い tier の武器がドロップするようになる */
  tier: number;
  damage: number;
  fireInterval: number;
  magSize: number;
  maxReserve: number;
  reloadTime: number;
  pellets: number;
  spread: number;
  /** エイム中の拡散倍率 */
  aimSpreadMultiplier: number;
  isAuto: boolean;
  /** 1 回引き金を引くと何発撃つか（バースト射撃） */
  burstCount: number;
  burstInterval: number;
  range: number;
  /** この距離を超えるとダメージが減衰し始める */
  falloffStart: number;
  /** 敵を何体まで貫通するか */
  pierce: number;
  isProjectile: boolean;
  projectileSpeed: number;
  /** 弾にかかる重力（グレネードは放物線を描く） */
  projectileGravity: number;
  explosionRadius: number;
  aimFov: number;
  /** スコープの最大倍率（スナイパーのみ。ホイールでここまで拡大できる） */
  maxScopeMagnification: number;
  recoil: number;
  /** モデルのアクセント色 */
  color: number;
}

type WeaponSpec = Pick<WeaponDef, 'id' | 'type' | 'name' | 'description' | 'tier' | 'damage' | 'fireInterval' | 'magSize' | 'maxReserve' | 'reloadTime'>
  & Partial<WeaponDef>;

const TYPE_DEFAULTS: Record<WeaponType, Partial<WeaponDef>> = {
  handgun: { spread: 0.014, aimSpreadMultiplier: 0.4, range: 80, falloffStart: 30, aimFov: 55, recoil: 0.014 },
  smg: { spread: 0.035, aimSpreadMultiplier: 0.6, isAuto: true, range: 50, falloffStart: 20, aimFov: 55, recoil: 0.006 },
  shotgun: { pellets: 9, spread: 0.09, aimSpreadMultiplier: 0.75, range: 30, falloffStart: 8, aimFov: 58, recoil: 0.05 },
  rifle: { spread: 0.022, aimSpreadMultiplier: 0.35, isAuto: true, range: 90, falloffStart: 40, aimFov: 48, recoil: 0.008 },
  sniper: { spread: 0.06, aimSpreadMultiplier: 0.02, range: 200, falloffStart: 200, pierce: 3, aimFov: 20, recoil: 0.06 },
  launcher: { spread: 0.01, aimSpreadMultiplier: 0.5, range: 150, falloffStart: 150, isProjectile: true, aimFov: 50, recoil: 0.05 },
};

function Define(spec: WeaponSpec): WeaponDef {
  return {
    pellets: 1, spread: 0.02, aimSpreadMultiplier: 0.5, isAuto: false, burstCount: 1, burstInterval: 0,
    range: 80, falloffStart: 30, pierce: 1, isProjectile: false, projectileSpeed: 0, projectileGravity: 0,
    explosionRadius: 0, aimFov: 55, maxScopeMagnification: 6, recoil: 0.01, color: 0x777788,
    ...TYPE_DEFAULTS[spec.type],
    ...spec,
  };
}

export const WEAPON_DEFS: Record<WeaponId, WeaponDef> = {
  // ---- ハンドガン ----
  handgun: Define({
    id: 'handgun', type: 'handgun', name: 'ハンドガン', description: '予備弾無限の標準拳銃', tier: 0,
    damage: 22, fireInterval: 0.2, magSize: 12, maxReserve: Infinity, reloadTime: 1.1,
  }),
  magnum: Define({
    id: 'magnum', type: 'handgun', name: 'マグナム', description: '一撃が重いが 6 発しか入らない', tier: 1,
    damage: 60, fireInterval: 0.45, magSize: 6, maxReserve: 48, reloadTime: 1.8, recoil: 0.045, pierce: 2, color: 0xc0a060,
  }),
  machinePistol: Define({
    id: 'machinePistol', type: 'handgun', name: 'マシンピストル', description: '片手で撃てるフルオート。近距離向け', tier: 0,
    damage: 10, fireInterval: 0.06, magSize: 20, maxReserve: 160, reloadTime: 1.2, isAuto: true, spread: 0.045, recoil: 0.006, color: 0x5a9ad8,
  }),
  // ---- サブマシンガン ----
  smg: Define({
    id: 'smg', type: 'smg', name: 'サブマシンガン', description: '扱いやすい標準 SMG', tier: 0,
    damage: 11, fireInterval: 0.07, magSize: 30, maxReserve: 180, reloadTime: 1.6,
  }),
  rapidSmg: Define({
    id: 'rapidSmg', type: 'smg', name: 'ラピッド SMG', description: '超高速連射。ブレは大きい', tier: 1,
    damage: 9, fireInterval: 0.045, magSize: 40, maxReserve: 240, reloadTime: 1.7, spread: 0.05, color: 0xe0d040,
  }),
  heavySmg: Define({
    id: 'heavySmg', type: 'smg', name: 'ヘビー SMG', description: '重い弾で威力が高いが連射は遅め', tier: 1,
    damage: 18, fireInterval: 0.1, magSize: 25, maxReserve: 150, reloadTime: 1.9, recoil: 0.011, color: 0x8a5a3a,
  }),
  // ---- ショットガン ----
  shotgun: Define({
    id: 'shotgun', type: 'shotgun', name: 'ポンプショットガン', description: '近距離で強力な標準ショットガン', tier: 0,
    damage: 13, fireInterval: 0.85, magSize: 6, maxReserve: 36, reloadTime: 2.2,
  }),
  doubleBarrel: Define({
    id: 'doubleBarrel', type: 'shotgun', name: 'ダブルバレル', description: '2 連発の超火力。すぐ弾切れする', tier: 1,
    damage: 15, fireInterval: 0.25, magSize: 2, maxReserve: 30, reloadTime: 1.6, pellets: 12, spread: 0.11, recoil: 0.07, color: 0x6a4028,
  }),
  autoShotgun: Define({
    id: 'autoShotgun', type: 'shotgun', name: 'オートショットガン', description: '連射できるショットガン', tier: 2,
    damage: 10, fireInterval: 0.3, magSize: 10, maxReserve: 60, reloadTime: 2.6, pellets: 8, isAuto: true, recoil: 0.035, color: 0x40a060,
  }),
  // ---- ライフル ----
  rifle: Define({
    id: 'rifle', type: 'rifle', name: 'アサルトライフル', description: 'どの距離でも戦える万能ライフル', tier: 1,
    damage: 24, fireInterval: 0.1, magSize: 30, maxReserve: 180, reloadTime: 1.9,
  }),
  battleRifle: Define({
    id: 'battleRifle', type: 'rifle', name: 'バトルライフル', description: '高威力・2 体貫通。装弾数は少なめ', tier: 2,
    damage: 42, fireInterval: 0.16, magSize: 20, maxReserve: 120, reloadTime: 2.2, pierce: 2, recoil: 0.016, color: 0x6a6a40,
  }),
  burstRifle: Define({
    id: 'burstRifle', type: 'rifle', name: 'バーストライフル', description: '1 回で 3 発撃つ精密ライフル', tier: 2,
    damage: 28, fireInterval: 0.38, magSize: 30, maxReserve: 180, reloadTime: 1.9, isAuto: false, burstCount: 3, burstInterval: 0.065,
    spread: 0.012, recoil: 0.009, color: 0x4a7ac0,
  }),
  // ---- スナイパー ----
  sniper: Define({
    id: 'sniper', type: 'sniper', name: 'スナイパーライフル', description: '高威力のボルトアクション。3 体貫通', tier: 2,
    damage: 140, fireInterval: 1.1, magSize: 5, maxReserve: 30, reloadTime: 2.5,
  }),
  dmr: Define({
    id: 'dmr', type: 'sniper', name: 'マークスマンライフル', description: '連射できる半自動狙撃銃。貫通なし', tier: 2,
    damage: 65, fireInterval: 0.3, magSize: 10, maxReserve: 60, reloadTime: 2.2, pierce: 1, aimFov: 30, maxScopeMagnification: 4, recoil: 0.03, color: 0x7a8a50,
  }),
  antiMateriel: Define({
    id: 'antiMateriel', type: 'sniper', name: '対物ライフル', description: '壁以外すべてを貫く超火力。3 発のみ', tier: 3,
    damage: 320, fireInterval: 1.8, magSize: 3, maxReserve: 15, reloadTime: 3.2, pierce: 8, aimFov: 16, maxScopeMagnification: 8, recoil: 0.12, color: 0x3a3a3a,
  }),
  // ---- ランチャー ----
  rocket: Define({
    id: 'rocket', type: 'launcher', name: 'ロケットランチャー', description: '直進して大爆発するロケット弾', tier: 3,
    damage: 160, fireInterval: 1.2, magSize: 1, maxReserve: 8, reloadTime: 2.4, projectileSpeed: 32, explosionRadius: 4.5, color: 0xffb13d,
  }),
  grenadeLauncher: Define({
    id: 'grenadeLauncher', type: 'launcher', name: 'グレネードランチャー', description: '放物線を描く榴弾。物陰の敵も狙える', tier: 3,
    damage: 110, fireInterval: 0.6, magSize: 6, maxReserve: 30, reloadTime: 3.0, projectileSpeed: 24, projectileGravity: 14,
    explosionRadius: 3.6, recoil: 0.04, color: 0x5a7a3a,
  }),
};

/** Wave 番号に応じてドロップしうる最大 tier */
export function GetMaxDropTier(wave: number): number {
  if (wave >= 7) return 3;
  if (wave >= 5) return 2;
  if (wave >= 3) return 1;
  return 0;
}

/** Wave に応じたドロップ武器をランダムに選ぶ（新しい tier ほど出やすい） */
export function PickRandomDropWeapon(wave: number): WeaponInstance {
  const maxTier = GetMaxDropTier(wave);
  const candidates = Object.values(WEAPON_DEFS).filter((def) => def.id !== 'handgun' && def.tier <= maxTier);
  const weights = candidates.map((def) => 1 + def.tier * 0.8);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = Math.random() * total;
  let chosen = candidates[0];
  for (let i = 0; i < candidates.length; i++) {
    roll -= weights[i];
    if (roll <= 0) {
      chosen = candidates[i];
      break;
    }
  }
  // 後半の Wave ほど強化済みの武器が出やすい
  const maxBonusLevel = Math.min(2, Math.floor(wave / 4));
  const level = 1 + Math.floor(Math.random() * (maxBonusLevel + 1));
  return new WeaponInstance(chosen.id, level);
}

export class WeaponInstance {
  readonly def: WeaponDef;
  level: number;
  mag: number;
  reserve: number;
  /** スコープの倍率（スナイパーのみ使う。持ち替えても覚えておく） */
  scopeMagnification = SCOPE_DEFAULT_MAGNIFICATION;

  constructor(id: WeaponId, level = 1) {
    this.def = WEAPON_DEFS[id];
    this.level = level;
    this.mag = this.GetMagSize();
    this.reserve = this.def.maxReserve === Infinity ? Infinity : Math.floor(this.GetMaxReserve() * 0.5);
  }

  GetDamage(): number {
    return this.def.damage * (1 + 0.2 * (this.level - 1));
  }

  GetMagSize(): number {
    return Math.max(1, Math.round(this.def.magSize * (1 + 0.15 * (this.level - 1))));
  }

  GetReloadTime(): number {
    return this.def.reloadTime * (1 - 0.08 * (this.level - 1));
  }

  GetFireInterval(): number {
    return this.def.fireInterval * (1 - 0.04 * (this.level - 1));
  }

  GetMaxReserve(): number {
    return this.def.maxReserve === Infinity ? Infinity : Math.round(this.def.maxReserve * (1 + 0.15 * (this.level - 1)));
  }

  HasInfiniteAmmo(): boolean {
    return this.reserve === Infinity;
  }

  CanReload(): boolean {
    return this.mag < this.GetMagSize() && this.reserve > 0;
  }

  FinishReload(): void {
    const needed = this.GetMagSize() - this.mag;
    const taken = Math.min(needed, this.reserve);
    this.mag += taken;
    if (!this.HasInfiniteAmmo()) this.reserve -= taken;
  }

  IsMaxLevel(): boolean {
    return this.level >= MAX_WEAPON_LEVEL;
  }

  GetUpgradeCost(): number {
    return Math.round(80 * this.level * (1 + this.def.tier * 0.5));
  }

  Upgrade(): void {
    if (this.IsMaxLevel()) return;
    const previousMagSize = this.GetMagSize();
    this.level++;
    this.mag += this.GetMagSize() - previousMagSize;
  }

  NeedsAmmo(): boolean {
    return !this.HasInfiniteAmmo() && this.reserve < this.GetMaxReserve();
  }

  GetAmmoRefillCost(): number {
    return 30 + this.def.tier * 25;
  }

  RefillAmmo(ratio: number): void {
    if (this.HasInfiniteAmmo()) return;
    const maxReserve = this.GetMaxReserve();
    this.reserve = Math.min(maxReserve, this.reserve + Math.ceil(maxReserve * ratio));
  }

  /**
   * 同じ種類の武器を拾ったときのボーナス。
   * レベルを 1 上げ（拾った武器の方が高ければそのレベルまで）、弾薬を全回復する。
   * レベルが上がったら true
   */
  AbsorbDuplicate(other: WeaponInstance): boolean {
    const previousLevel = this.level;
    const targetLevel = Math.min(MAX_WEAPON_LEVEL, Math.max(this.level + 1, other.level));
    while (this.level < targetLevel) this.Upgrade();
    this.mag = this.GetMagSize();
    if (!this.HasInfiniteAmmo()) this.reserve = this.GetMaxReserve();
    return this.level > previousLevel;
  }

  GetDisplayName(): string {
    return `${this.def.name} Lv${this.level}`;
  }
}
