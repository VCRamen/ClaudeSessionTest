// 画面上の HUD（DOM）

import type { Player } from './Player';

function GetElement<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`#${id} が見つかりません`);
  return element as T;
}

export class Hud {
  private readonly root = GetElement('hud');
  private readonly waveInfo = GetElement('wave-info');
  private readonly enemyCount = GetElement('enemy-count');
  private readonly hpFill = GetElement('hp-fill');
  private readonly hpText = GetElement('hp-text');
  private readonly moneyText = GetElement('money-text');
  private readonly weaponName = GetElement('weapon-name');
  private readonly ammoText = GetElement('ammo-text');
  private readonly reloadBar = GetElement('reload-bar');
  private readonly reloadFill = GetElement('reload-fill');
  private readonly slotList = GetElement('slot-list');
  private readonly crosshair = GetElement('crosshair');
  private readonly hitMarker = GetElement('hit-marker');
  private readonly damageVignette = GetElement('damage-vignette');
  private readonly scopeOverlay = GetElement('scope-overlay');
  private readonly pickupPrompt = GetElement('pickup-prompt');
  private readonly coverPrompt = GetElement('cover-prompt');
  private readonly banner = GetElement('banner');
  private readonly bannerTitle = GetElement('banner-title');
  private readonly bannerSub = GetElement('banner-sub');
  private readonly notifications = GetElement('notifications');
  private readonly bossBar = GetElement('boss-bar');
  private readonly bossName = GetElement('boss-name');
  private readonly bossFill = GetElement('boss-fill');
  private readonly slotElements: HTMLElement[] = [];
  private readonly indicatorContainer = GetElement('direction-indicators');
  private readonly indicatorElements: HTMLElement[] = [];

  private hitMarkerTimer = 0;
  private damageTimer = 0;
  private bannerTimer = 0;

  constructor() {
    for (let i = 0; i < 4; i++) {
      const slot = document.createElement('div');
      slot.className = 'slot';
      this.slotList.appendChild(slot);
      this.slotElements.push(slot);
    }
  }

  SetVisible(isVisible: boolean): void {
    this.root.classList.toggle('hidden', !isVisible);
  }

  /** ショップ表示中は、ショップ側に出している所持金・HP などを HUD からは隠す */
  SetShopOpen(isOpen: boolean): void {
    this.root.classList.toggle('shop-open', isOpen);
  }

  SetWave(text: string, remaining: number): void {
    this.waveInfo.textContent = text;
    this.enemyCount.textContent = remaining > 0 ? `残り ${remaining} 体` : '';
  }

  UpdatePlayer(player: Player, spread: number): void {
    const hpRatio = Math.max(0, player.hp / player.maxHp);
    this.hpFill.style.width = `${hpRatio * 100}%`;
    this.hpFill.classList.toggle('low', hpRatio < 0.3);
    this.hpText.textContent = `${Math.ceil(player.hp)} / ${player.maxHp}`;
    this.moneyText.textContent = `$ ${player.money}`;

    const weapon = player.GetCurrentWeapon();
    if (weapon) {
      this.weaponName.textContent = weapon.GetDisplayName();
      const reserve = weapon.HasInfiniteAmmo() ? '∞' : `${weapon.reserve}`;
      this.ammoText.innerHTML = `<span class="${weapon.mag === 0 ? 'empty' : ''}">${weapon.mag}</span> / ${reserve}`;
    }
    const reloadProgress = player.GetReloadProgress();
    this.reloadBar.classList.toggle('hidden', reloadProgress < 0);
    if (reloadProgress >= 0) this.reloadFill.style.width = `${reloadProgress * 100}%`;

    for (let i = 0; i < this.slotElements.length; i++) {
      const slotWeapon = player.slots[i];
      const element = this.slotElements[i];
      element.classList.toggle('active', i === player.currentSlot);
      element.classList.toggle('empty', !slotWeapon);
      const ammo = slotWeapon ? (slotWeapon.HasInfiniteAmmo() ? `${slotWeapon.mag}/∞` : `${slotWeapon.mag}/${slotWeapon.reserve}`) : '';
      element.innerHTML = `<span class="key">${i + 1}</span><span class="name">${slotWeapon ? slotWeapon.GetDisplayName() : '— 空き —'}</span><span class="ammo">${ammo}</span>`;
    }

    // 拡散に応じてクロスヘアを広げる
    const gap = 6 + spread * 450;
    this.crosshair.style.setProperty('--gap', `${Math.min(60, gap)}px`);
  }

  SetScope(isVisible: boolean): void {
    this.scopeOverlay.classList.toggle('hidden', !isVisible);
    this.crosshair.classList.toggle('hidden', isVisible);
  }

  SetPickupPrompt(text: string | null): void {
    this.pickupPrompt.classList.toggle('hidden', !text);
    if (text) this.pickupPrompt.innerHTML = text;
  }

  SetCoverPrompt(html: string | null): void {
    this.coverPrompt.classList.toggle('hidden', !html);
    if (html && this.coverPrompt.innerHTML !== html) this.coverPrompt.innerHTML = html;
  }

  SetBoss(name: string | null, ratio: number): void {
    this.bossBar.classList.toggle('hidden', name === null);
    if (name !== null) {
      this.bossName.textContent = name;
      this.bossFill.style.width = `${Math.max(0, ratio) * 100}%`;
    }
  }

  /** 画面中央を囲む方向インジケーター（angle は正面 0、時計回りが正のラジアン） */
  SetIndicators(indicators: { angle: number; opacity: number; kind: string }[]): void {
    while (this.indicatorElements.length < indicators.length) {
      const element = document.createElement('div');
      this.indicatorContainer.appendChild(element);
      this.indicatorElements.push(element);
    }
    for (let i = 0; i < this.indicatorElements.length; i++) {
      const element = this.indicatorElements[i];
      const indicator = indicators[i];
      if (!indicator) {
        element.style.display = 'none';
        continue;
      }
      element.style.display = '';
      element.className = `indicator ${indicator.kind}`;
      element.style.transform = `rotate(${indicator.angle}rad)`;
      element.style.opacity = `${indicator.opacity}`;
    }
  }

  ShowHitMarker(isKill: boolean): void {
    this.hitMarker.classList.remove('hidden');
    this.hitMarker.classList.toggle('kill', isKill);
    this.hitMarkerTimer = isKill ? 0.25 : 0.12;
  }

  FlashDamage(strength: number): void {
    this.damageTimer = Math.max(this.damageTimer, 0.2 + Math.min(1, strength) * 0.4);
  }

  /** ゲーム開始時に一時的な演出をリセットする */
  Reset(): void {
    this.damageTimer = 0;
    this.hitMarkerTimer = 0;
    this.bannerTimer = 0;
    this.damageVignette.style.opacity = '0';
    this.hitMarker.classList.add('hidden');
    this.banner.classList.add('hidden');
    this.notifications.innerHTML = '';
    this.SetBoss(null, 0);
    this.SetPickupPrompt(null);
    this.SetCoverPrompt(null);
    this.SetIndicators([]);
    this.SetShopOpen(false);
  }

  ShowBanner(title: string, subtitle: string, duration = 2.5): void {
    this.bannerTitle.textContent = title;
    this.bannerSub.textContent = subtitle;
    this.banner.classList.remove('hidden');
    this.bannerTimer = duration;
  }

  Notify(text: string, className = ''): void {
    const element = document.createElement('div');
    element.className = `notification ${className}`;
    element.textContent = text;
    this.notifications.prepend(element);
    while (this.notifications.children.length > 6) this.notifications.lastElementChild?.remove();
    window.setTimeout(() => element.remove(), 2500);
  }

  Update(dt: number, hpRatio: number): void {
    if (this.hitMarkerTimer > 0) {
      this.hitMarkerTimer -= dt;
      if (this.hitMarkerTimer <= 0) this.hitMarker.classList.add('hidden');
    }
    this.damageTimer = Math.max(0, this.damageTimer - dt);
    const lowHealthPulse = hpRatio < 0.3 ? 0.25 + Math.sin(performance.now() / 200) * 0.1 : 0;
    this.damageVignette.style.opacity = `${Math.min(1, this.damageTimer * 2 + lowHealthPulse)}`;
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.banner.classList.add('hidden');
    }
  }
}
