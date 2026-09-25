// Wave 終了時のショップ（回復・武器強化・弾薬補充）

import type { Player } from './Player';
import { FormatUpgradePreview, FormatWeaponStatsHtml } from './WeaponStats';

const HEAL_SMALL_AMOUNT = 30;
const HEAL_SMALL_COST = 40;
const FULL_HEAL_COST_PER_HP = 1.3;
const MAX_HP_UP_AMOUNT = 20;
const MAX_HP_UP_BASE_COST = 150;

export interface ShopCallbacks {
  OnPurchase: () => void;
  OnNextWave: () => void;
}

export class Shop {
  private readonly root = document.getElementById('shop-screen')!;
  private readonly content = document.getElementById('shop-content')!;
  /** 所持金と HP（スクロールしても隠れないように、一覧の外に置く） */
  private readonly status = document.getElementById('shop-status')!;
  private readonly title = document.getElementById('shop-title')!;
  private readonly nextButton = document.getElementById('shop-next') as HTMLButtonElement;
  private player: Player | null = null;
  private maxHpUpgrades = 0;
  private readonly callbacks: ShopCallbacks;

  constructor(callbacks: ShopCallbacks) {
    this.callbacks = callbacks;
    this.nextButton.addEventListener('click', () => {
      this.Close();
      this.callbacks.OnNextWave();
    });
  }

  ResetProgress(): void {
    this.maxHpUpgrades = 0;
  }

  Open(player: Player, clearedWave: number, nextWave: number): void {
    this.player = player;
    this.title.textContent = `WAVE ${clearedWave} クリア！`;
    this.nextButton.textContent = `Wave ${nextWave} を開始 ▶`;
    this.root.classList.remove('hidden');
    this.Render();
  }

  Close(): void {
    this.root.classList.add('hidden');
  }

  private Render(): void {
    const player = this.player;
    if (!player) return;
    const scrollTop = this.content.scrollTop;
    this.content.innerHTML = '';
    this.status.innerHTML = `<div>所持金 <strong class="money">$ ${player.money}</strong></div><div>HP <strong>${Math.ceil(player.hp)} / ${player.maxHp}</strong></div>`;

    const healSection = this.CreateSection('回復');
    const missingHp = Math.ceil(player.maxHp - player.hp);
    this.AddItem(healSection, `HP +${HEAL_SMALL_AMOUNT}`, '少しだけ回復する', HEAL_SMALL_COST, missingHp > 0, () => {
      player.hp = Math.min(player.maxHp, player.hp + HEAL_SMALL_AMOUNT);
    });
    const fullHealCost = Math.max(1, Math.ceil(missingHp * FULL_HEAL_COST_PER_HP));
    this.AddItem(healSection, '全回復', `HP を最大まで回復（${missingHp} 回復）`, fullHealCost, missingHp > 0, () => {
      player.hp = player.maxHp;
    });
    const maxHpCost = MAX_HP_UP_BASE_COST * (this.maxHpUpgrades + 1);
    this.AddItem(healSection, `最大 HP +${MAX_HP_UP_AMOUNT}`, '最大 HP を増やす（同時に同量回復）', maxHpCost, true, () => {
      player.maxHp += MAX_HP_UP_AMOUNT;
      player.hp += MAX_HP_UP_AMOUNT;
      this.maxHpUpgrades++;
    });

    const weaponSection = this.CreateSection('武器');
    player.slots.forEach((weapon, index) => {
      if (!weapon) return;
      // 武器ごとに現在の性能を数値で表示し、その下に強化・弾薬補充を並べる
      const card = document.createElement('div');
      card.className = 'shop-weapon';
      card.innerHTML = `<div class="shop-weapon-name">[${index + 1}] ${weapon.GetDisplayName()}</div>`
        + `<div class="shop-weapon-desc">${weapon.def.description}</div>${FormatWeaponStatsHtml(weapon)}`;
      weaponSection.appendChild(card);
      if (weapon.IsMaxLevel()) {
        this.AddItem(card, '強化', '最大レベルです', 0, false, () => {});
      } else {
        this.AddItem(card, `強化（Lv${weapon.level} → Lv${weapon.level + 1}）`, FormatUpgradePreview(weapon),
          weapon.GetUpgradeCost(), true, () => weapon.Upgrade());
      }
      if (!weapon.HasInfiniteAmmo()) {
        this.AddItem(card, '弾薬補充', `予備弾 ${weapon.reserve} / ${weapon.GetMaxReserve()}`,
          weapon.GetAmmoRefillCost(), weapon.NeedsAmmo(), () => weapon.RefillAmmo(1));
      }
    });
    this.content.scrollTop = scrollTop;
  }

  private CreateSection(title: string): HTMLElement {
    const section = document.createElement('div');
    section.className = 'shop-section';
    section.innerHTML = `<h3>${title}</h3>`;
    this.content.appendChild(section);
    return section;
  }

  private AddItem(section: HTMLElement, name: string, description: string, cost: number, isAvailable: boolean, onBuy: () => void): void {
    const player = this.player!;
    const item = document.createElement('div');
    item.className = 'shop-item';
    const button = document.createElement('button');
    const canAfford = player.money >= cost;
    button.disabled = !isAvailable || !canAfford;
    button.textContent = isAvailable ? `$ ${cost}` : '—';
    button.addEventListener('click', () => {
      if (player.money < cost) return;
      player.money -= cost;
      onBuy();
      this.callbacks.OnPurchase();
      this.Render();
    });
    const text = document.createElement('div');
    text.className = 'shop-item-text';
    text.innerHTML = `<div class="shop-item-name">${name}</div><div class="shop-item-desc">${description}</div>`;
    item.append(text, button);
    section.appendChild(item);
  }
}
