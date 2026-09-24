// 武器の定義とインスタンス（弾数・強化レベル）

import { MAX_WEAPON_LEVEL } from './Config';

export type WeaponId = 'handgun' | 'smg' | 'shotgun' | 'rifle' | 'sniper' | 'rocket';

export interface WeaponDef {
  id: WeaponId;
  name: string;
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
  range: number;
  /** この距離を超えるとダメージが減衰し始める */
  falloffStart: number;
  /** 敵を何体まで貫通するか */
  pierce: number;
  isProjectile: boolean;
  projectileSpeed: number;
  explosionRadius: number;
  aimFov: number;
  recoil: number;
  color: number;
}

export const WEAPON_DEFS: Record<WeaponId, WeaponDef> = {
  handgun: {
    id: 'handgun', name: 'ハンドガン', tier: 0,
    damage: 22, fireInterval: 0.2, magSize: 12, maxReserve: Infinity, reloadTime: 1.1,
    pellets: 1, spread: 0.014, aimSpreadMultiplier: 0.4, isAuto: false, range: 80, falloffStart: 30, pierce: 1,
    isProjectile: false, projectileSpeed: 0, explosionRadius: 0, aimFov: 55, recoil: 0.014, color: 0xd0d0d0,
  },
  smg: {
    id: 'smg', name: 'サブマシンガン', tier: 0,
    damage: 11, fireInterval: 0.07, magSize: 30, maxReserve: 180, reloadTime: 1.6,
    pellets: 1, spread: 0.035, aimSpreadMultiplier: 0.6, isAuto: true, range: 50, falloffStart: 20, pierce: 1,
    isProjectile: false, projectileSpeed: 0, explosionRadius: 0, aimFov: 55, recoil: 0.006, color: 0x6ad1ff,
  },
  shotgun: {
    id: 'shotgun', name: 'ショットガン', tier: 0,
    damage: 13, fireInterval: 0.85, magSize: 6, maxReserve: 36, reloadTime: 2.2,
    pellets: 9, spread: 0.09, aimSpreadMultiplier: 0.75, isAuto: false, range: 30, falloffStart: 8, pierce: 1,
    isProjectile: false, projectileSpeed: 0, explosionRadius: 0, aimFov: 58, recoil: 0.05, color: 0x6ad1ff,
  },
  rifle: {
    id: 'rifle', name: 'アサルトライフル', tier: 1,
    damage: 24, fireInterval: 0.1, magSize: 30, maxReserve: 180, reloadTime: 1.9,
    pellets: 1, spread: 0.022, aimSpreadMultiplier: 0.35, isAuto: true, range: 90, falloffStart: 40, pierce: 1,
    isProjectile: false, projectileSpeed: 0, explosionRadius: 0, aimFov: 48, recoil: 0.008, color: 0x7dff7d,
  },
  sniper: {
    id: 'sniper', name: 'スナイパーライフル', tier: 2,
    damage: 140, fireInterval: 1.1, magSize: 5, maxReserve: 30, reloadTime: 2.5,
    pellets: 1, spread: 0.06, aimSpreadMultiplier: 0.02, isAuto: false, range: 200, falloffStart: 200, pierce: 3,
    isProjectile: false, projectileSpeed: 0, explosionRadius: 0, aimFov: 20, recoil: 0.06, color: 0xc27dff,
  },
  rocket: {
    id: 'rocket', name: 'ロケットランチャー', tier: 3,
    damage: 160, fireInterval: 1.2, magSize: 1, maxReserve: 8, reloadTime: 2.4,
    pellets: 1, spread: 0.01, aimSpreadMultiplier: 0.5, isAuto: false, range: 150, falloffStart: 150, pierce: 1,
    isProjectile: true, projectileSpeed: 32, explosionRadius: 4.5, aimFov: 50, recoil: 0.05, color: 0xffb13d,
  },
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
