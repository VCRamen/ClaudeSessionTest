// 武器の性能を「能力名：基礎値 + Lv による強化値」の形で表示する

import { GetMagSizeAtLevel } from './Weapons';
import type { WeaponInstance } from './Weapons';

interface StatLine {
  name: string;
  /** Lv1 のときの値 */
  base: number;
  /** 現在のレベルでの値 */
  current: number;
  unit: string;
  /** 小数点以下の桁数 */
  digits: number;
  /** 付け足す説明（ショットガンの「×9 発」など） */
  suffix?: string;
}

function Round(value: number, digits: number): string {
  const text = value.toFixed(digits);
  return digits > 0 ? text.replace(/\.?0+$/, '') : text;
}

/** レベルを指定して性能値を計算する（強化後のプレビュー用） */
function GetStatsAtLevel(weapon: WeaponInstance, level: number): StatLine[] {
  const def = weapon.def;
  const bonus = level - 1;
  const lines: StatLine[] = [];
  lines.push({
    name: '威力', base: def.damage, current: def.damage * (1 + 0.2 * bonus), unit: '', digits: 1,
    suffix: def.pellets > 1 ? ` ×${def.pellets}発` : undefined,
  });
  lines.push({
    name: '連射', base: def.burstCount / def.fireInterval, current: def.burstCount / (def.fireInterval * (1 - 0.04 * bonus)), unit: '発/秒', digits: 1,
    suffix: def.burstCount > 1 ? `（${def.burstCount}点バースト）` : undefined,
  });
  lines.push({
    name: '装弾数', base: def.magSize, current: GetMagSizeAtLevel(def, level), unit: '発', digits: 0,
  });
  lines.push({
    name: 'リロード', base: def.reloadTime, current: def.reloadTime * (1 - 0.08 * bonus), unit: '秒', digits: 2,
  });
  if (def.maxReserve !== Infinity) {
    lines.push({
      name: '予備弾', base: def.maxReserve, current: Math.round(def.maxReserve * (1 + 0.15 * bonus)), unit: '発', digits: 0,
    });
  }
  return lines;
}

/** レベルでは変わらない特徴（貫通・爆発など） */
function GetTraits(weapon: WeaponInstance): string[] {
  const def = weapon.def;
  const traits: string[] = [];
  if (def.maxReserve === Infinity) traits.push('予備弾 ∞');
  if (def.pierce > 1) traits.push(`貫通 ${def.pierce}体`);
  if (def.explosionRadius > 0) traits.push(`爆発範囲 ${def.explosionRadius}m`);
  if (def.projectileGravity > 0) traits.push('山なりに飛ぶ');
  if (def.isAuto) traits.push('フルオート');
  if (def.falloffStart < 15) traits.push('遠距離で威力減衰');
  return traits;
}

/** 性能一覧の HTML（「威力 24 +4.8」の形式） */
export function FormatWeaponStatsHtml(weapon: WeaponInstance): string {
  const rows = GetStatsAtLevel(weapon, weapon.level).map((line) => {
    const difference = line.current - line.base;
    const hasBonus = Math.abs(difference) >= Math.pow(10, -line.digits) / 2;
    const sign = difference >= 0 ? '+' : '−';
    const bonus = hasBonus ? `<span class="stat-bonus">${sign}${Round(Math.abs(difference), line.digits)}</span>` : '';
    return `<span class="stat-name">${line.name}</span>`
      + `<span class="stat-value">${Round(line.base, line.digits)}${bonus}<span class="stat-unit">${line.unit}${line.suffix ?? ''}</span></span>`;
  });
  const traits = GetTraits(weapon);
  const traitsHtml = traits.length > 0 ? `<div class="stat-traits">${traits.join('　')}</div>` : '';
  return `<div class="weapon-stats">${rows.join('')}</div>${traitsHtml}`;
}

/** 次のレベルで何がどれだけ上がるか（ショップの強化ボタン用） */
export function FormatUpgradePreview(weapon: WeaponInstance): string {
  const now = GetStatsAtLevel(weapon, weapon.level);
  const next = GetStatsAtLevel(weapon, weapon.level + 1);
  const parts = now.map((line, index) => {
    const difference = next[index].current - line.current;
    if (Math.abs(difference) < Math.pow(10, -line.digits) / 2) return null;
    const sign = difference >= 0 ? '+' : '−';
    return `${line.name} ${sign}${Round(Math.abs(difference), line.digits)}${line.unit}`;
  }).filter((part): part is string => part !== null);
  return `Lv${weapon.level + 1}：${parts.join('、')}`;
}
