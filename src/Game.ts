// ゲーム全体の進行管理（状態遷移・Wave・戦闘・カメラ）

import * as THREE from 'three';
import {
  CAMERA_AIM_DISTANCE, CAMERA_DISTANCE, CAMERA_FOV, CAMERA_SHOULDER_OFFSET, HEALTH_PICKUP_AMOUNT,
  MAP_HALF_SIZE, MAX_ALIVE_ENEMIES, PICKUP_RANGE, PLAYER_RADIUS, TOTAL_WAVES, WALK_SPEED,
} from './Config';
import { Input } from './Input';
import { Sfx } from './Audio';
import { Hud } from './Hud';
import { Shop } from './Shop';
import { Level } from './Level';
import { NavGrid } from './NavGrid';
import { Effects } from './Effects';
import { ProjectileSystem } from './Projectiles';
import type { Projectile, ProjectileContext } from './Projectiles';
import { PickupManager } from './Pickups';
import type { Pickup } from './Pickups';
import { PlayerAvatar } from './Avatar';
import { Player } from './Player';
import { BuildWaveComposition, Enemy } from './Enemy';
import type { EnemyContext, EnemyKind } from './Enemy';
import { IntersectRaySphere, RaycastColliders } from './Collision';
import type { ColliderHit } from './Collision';
import { PickRandomDropWeapon } from './Weapons';
import type { WeaponId, WeaponInstance } from './Weapons';
import type { Barrel } from './Barrel';

type GameState = 'title' | 'playing' | 'paused' | 'shop' | 'result';
type DropSource = 'enemy' | 'barrel';

const DROP_CHANCES: Record<DropSource, { weapon: number; health: number; ammo: number }> = {
  enemy: { weapon: 0.12, health: 0.1, ammo: 0.14 },
  barrel: { weapon: 0.55, health: 0.25, ammo: 0.2 },
};
const ENEMY_COLORS: Record<EnemyKind, number> = {
  pumpkin: 0xff8a20,
  ghost: 0xd0e0ff,
  bat: 0x9b40ff,
  boss: 0xff5010,
};
const TIER_CSS_COLORS = ['#6ad1ff', '#7dff7d', '#c27dff', '#ffb13d'];
const WAVE_CLEAR_DELAY = 4;
const BARREL_REWARD = 5;
const EXPLOSIVE_BARREL_RADIUS = 4;
const EXPLOSIVE_BARREL_DAMAGE = 90;
const MAX_AIM_DISTANCE = 200;
const LOCK_GRACE_TIME = 0.6;
/** 単発武器のクリックを先行入力として受け付ける時間 */
const FIRE_BUFFER_TIME = 0.15;

const tmpMuzzle = new THREE.Vector3();
const tmpAim = new THREE.Vector3();
const tmpDirection = new THREE.Vector3();
const tmpCenter = new THREE.Vector3();
const tmpPoint = new THREE.Vector3();
const tmpUp = new THREE.Vector3();
const tmpSide = new THREE.Vector3();
const tmpPivot = new THREE.Vector3();
const tmpDesired = new THREE.Vector3();
const tmpLook = new THREE.Vector3();
const tmpRight = new THREE.Vector3();

/** 敵の襲来方向の候補（北・南・西・東） */
const SPAWN_SIDES = [
  new THREE.Vector3(0, 0, -1),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(1, 0, 0),
];
/** 回り込み部隊が出現し始める Wave と、その割合 */
const FLANK_SPAWN_START_WAVE = 4;
const FLANK_SPAWN_RATIO = 0.2;
const DAMAGE_INDICATOR_TIME = 1.2;
const THREAT_INDICATOR_TIME = 5;

type IndicatorKind = 'damage' | 'threat';

interface DirectionIndicator {
  source: THREE.Vector3;
  timer: number;
  duration: number;
  kind: IndicatorKind;
}

interface PendingBarrel {
  barrel: Barrel;
  timer: number;
}

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly input: Input;
  private readonly sfx = new Sfx();
  private readonly hud = new Hud();
  private readonly shop: Shop;
  private readonly level: Level;
  private readonly nav = new NavGrid();
  private readonly effects: Effects;
  private readonly projectiles: ProjectileSystem;
  private readonly pickups: PickupManager;
  private readonly avatar = new PlayerAvatar();
  private readonly player = new Player();
  private enemies: Enemy[] = [];

  private state: GameState = 'title';
  private wave = 0;
  private isEndless = false;
  private isWaveActive = false;
  private spawnQueue: EnemyKind[] = [];
  private spawnTimer = 0;
  private waveClearTimer = -1;
  private selectedSubWeapon: WeaponId = 'smg';
  private kills = 0;
  private playTime = 0;
  private navTimer = 0;
  private cameraShake = 0;
  private cameraDistance = CAMERA_DISTANCE;
  private cameraHeight = 1.6;
  private currentFov = CAMERA_FOV;
  private recoilAnimation = 0;
  private fireBufferTimer = 0;
  private titleAngle = 0;
  private lockRequestTime = 0;
  private lastFrameTime = performance.now();
  private readonly pendingBarrels: PendingBarrel[] = [];
  private readonly flankers = new Set<Enemy>();
  private readonly indicators: DirectionIndicator[] = [];
  private primarySide = SPAWN_SIDES[0];
  private flankSide = SPAWN_SIDES[2];
  private readonly playerTarget = new THREE.Vector3();
  private readonly playerSegmentBottom = new THREE.Vector3();
  private readonly playerSegmentTop = new THREE.Vector3();
  private readonly enemyContext: EnemyContext;
  private readonly projectileContext: ProjectileContext;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;

    this.camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.05, 300);
    this.camera.rotation.order = 'YXZ';
    this.input = new Input(canvas);
    this.level = new Level(this.scene);
    this.nav.Rebuild(this.level.colliders);
    this.effects = new Effects(this.scene);
    this.projectiles = new ProjectileSystem(this.scene);
    this.pickups = new PickupManager(this.scene);
    this.scene.add(this.avatar.root);
    this.avatar.root.position.copy(this.level.playerStart);
    this.avatar.SetWeapon('handgun');

    this.shop = new Shop({
      OnPurchase: () => this.sfx.PlayCoin(),
      OnNextWave: () => {
        this.StartNextWave();
        this.RequestLock();
      },
    });

    this.enemyContext = {
      playerPosition: this.player.position,
      playerTarget: this.playerTarget,
      colliders: this.level.colliders,
      nav: this.nav,
      enemies: this.enemies,
      camera: this.camera,
      FireProjectile: (enemy, origin, direction) => {
        const def = enemy.def;
        this.projectiles.SpawnEnemyProjectile(origin, direction, def.projectileSpeed, def.projectileDamage * enemy.damageScale,
          def.projectileSize, def.projectileColor, def.projectileHoming);
        this.sfx.PlayEnemyShot();
      },
      MeleePlayer: (enemy) => this.DamagePlayer(enemy.def.meleeDamage * enemy.damageScale, enemy.position),
      RequestFlankToken: (enemy) => {
        // 回り込める敵の数を制限し、正面と真横から同時に撃たれ続けないようにする
        const maxFlankers = Math.min(3, 1 + Math.floor(this.wave / 4));
        if (this.flankers.size >= maxFlankers) return false;
        this.flankers.add(enemy);
        return true;
      },
      SummonBats: (enemy, count) => {
        for (let i = 0; i < count; i++) {
          const angle = Math.random() * Math.PI * 2;
          const position = enemy.position.clone().add(new THREE.Vector3(Math.sin(angle) * 2, 0, Math.cos(angle) * 2));
          this.AddEnemy('bat', position);
          this.effects.SpawnBurst(new THREE.Vector3(position.x, 1.5, position.z), 0x9b40ff, 20);
        }
      },
    };

    this.projectileContext = {
      colliders: this.level.colliders,
      enemies: this.enemies,
      playerSegmentBottom: this.playerSegmentBottom,
      playerSegmentTop: this.playerSegmentTop,
      playerTarget: this.playerTarget,
      OnHitPlayer: (projectile) => {
        this.effects.SpawnImpact(projectile.position, null, projectile.color, 10);
        this.DamagePlayer(projectile.damage, projectile.origin);
      },
      OnHitCollider: (projectile, hit) => this.OnProjectileHitCollider(projectile, hit),
      OnHitEnemy: (projectile, enemy, point) => {
        if (projectile.explosionRadius > 0) {
          this.Explode(point, projectile.explosionRadius, projectile.damage, true);
        } else {
          this.DamageEnemy(enemy, projectile.damage, point, false);
        }
      },
      OnTrail: (projectile) => {
        if (projectile.isFromPlayer && Math.random() < 0.8) {
          this.effects.SpawnImpact(projectile.position, null, 0xffa040, 1);
        }
      },
    };

    this.SetupUi();
    this.input.OnLockChange((isLocked) => this.OnLockChange(isLocked));
    canvas.addEventListener('click', () => {
      if (this.state === 'playing' && !this.input.isLocked) this.RequestLock();
    });
    window.addEventListener('resize', () => this.Resize());
    this.Resize();
    requestAnimationFrame(this.Loop);
  }

  // ------------------------------------------------------------
  // UI
  // ------------------------------------------------------------

  private SetupUi(): void {
    const titleScreen = document.getElementById('title-screen')!;
    const fileInput = document.getElementById('vrm-file') as HTMLInputElement;
    const dropZone = document.getElementById('drop-zone')!;
    const dropOverlay = document.getElementById('drop-overlay')!;

    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (file) void this.LoadVrm(file);
      fileInput.value = '';
    });
    dropZone.addEventListener('click', (event) => {
      if (event.target !== fileInput) fileInput.click();
    });

    let dragDepth = 0;
    window.addEventListener('dragenter', (event) => {
      if (this.state !== 'title') return;
      event.preventDefault();
      dragDepth++;
      dropOverlay.classList.remove('hidden');
    });
    window.addEventListener('dragleave', () => {
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) dropOverlay.classList.add('hidden');
    });
    window.addEventListener('dragover', (event) => event.preventDefault());
    window.addEventListener('drop', (event) => {
      event.preventDefault();
      dragDepth = 0;
      dropOverlay.classList.add('hidden');
      if (this.state !== 'title') return;
      const file = event.dataTransfer?.files?.[0];
      if (file) void this.LoadVrm(file);
    });

    const weaponButtons = document.querySelectorAll<HTMLButtonElement>('[data-sub-weapon]');
    weaponButtons.forEach((button) => {
      button.addEventListener('click', () => {
        this.selectedSubWeapon = button.dataset.subWeapon as WeaponId;
        weaponButtons.forEach((other) => other.classList.toggle('selected', other === button));
      });
    });

    document.getElementById('start-button')!.addEventListener('click', () => {
      titleScreen.classList.add('hidden');
      this.StartGame();
    });
    document.getElementById('resume-button')!.addEventListener('click', () => this.RequestLock());
    document.getElementById('pause-title-button')!.addEventListener('click', () => this.ReturnToTitle());
    document.getElementById('result-retry')!.addEventListener('click', () => this.StartGame());
    document.getElementById('result-endless')!.addEventListener('click', () => {
      this.isEndless = true;
      document.getElementById('result-screen')!.classList.add('hidden');
      this.OpenShop();
    });
    document.getElementById('result-title')!.addEventListener('click', () => this.ReturnToTitle());
  }

  private async LoadVrm(file: File): Promise<void> {
    const status = document.getElementById('vrm-status')!;
    if (!file.name.toLowerCase().endsWith('.vrm')) {
      status.textContent = '⚠ .vrm ファイルを選択してください';
      status.className = 'vrm-status error';
      return;
    }
    status.textContent = '読み込み中…';
    status.className = 'vrm-status';
    try {
      const name = await this.avatar.LoadVrmFromFile(file);
      status.textContent = `✔ 「${name}」を読み込みました`;
      status.className = 'vrm-status success';
    } catch (error) {
      console.error(error);
      status.textContent = `⚠ 読み込みに失敗しました: ${(error as Error).message}`;
      status.className = 'vrm-status error';
    }
  }

  private RequestLock(): void {
    this.lockRequestTime = performance.now();
    this.input.RequestLock();
  }

  private OnLockChange(isLocked: boolean): void {
    const pauseScreen = document.getElementById('pause-screen')!;
    if (!isLocked && this.state === 'playing') {
      this.state = 'paused';
      pauseScreen.classList.remove('hidden');
    } else if (isLocked && this.state === 'paused') {
      this.state = 'playing';
      pauseScreen.classList.add('hidden');
    }
  }

  private Resize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------
  // 進行
  // ------------------------------------------------------------

  private StartGame(): void {
    this.sfx.Unlock();
    this.ClearField();
    for (const id of ['title-screen', 'result-screen', 'pause-screen']) {
      document.getElementById(id)!.classList.add('hidden');
    }
    this.shop.Close();
    this.shop.ResetProgress();
    this.player.Reset(this.level.playerStart, this.selectedSubWeapon);
    this.avatar.root.visible = true;
    this.wave = 0;
    this.isEndless = false;
    this.kills = 0;
    this.playTime = 0;
    this.hud.Reset();
    this.hud.SetVisible(true);
    this.StartNextWave();
    this.RequestLock();
  }

  private ClearField(): void {
    for (const enemy of this.enemies) this.scene.remove(enemy.mesh, enemy.healthBar);
    this.enemies.length = 0;
    this.projectiles.Clear();
    this.pickups.Clear();
    this.pendingBarrels.length = 0;
    this.flankers.clear();
    this.indicators.length = 0;
    this.spawnQueue = [];
    this.level.RespawnBarrels([]);
    this.nav.Rebuild(this.level.colliders);
  }

  private StartNextWave(): void {
    this.wave++;
    this.spawnQueue = BuildWaveComposition(this.wave);
    this.spawnTimer = 1.5;
    this.isWaveActive = true;
    this.waveClearTimer = -1;
    this.level.RespawnBarrels([this.player.position, ...this.enemies.map((enemy) => enemy.position)]);
    this.nav.Rebuild(this.level.colliders);
    this.state = 'playing';
    this.ChooseSpawnSides();

    const hasBoss = this.spawnQueue.includes('boss');
    let subtitle = `${this.spawnQueue.length} 体のモンスターが襲来！`;
    if (hasBoss) subtitle = '👑 パンプキンキング出現！';
    else if (this.wave === TOTAL_WAVES) subtitle = '最終 Wave';
    this.hud.ShowBanner(`WAVE ${this.wave}`, subtitle);
    this.sfx.PlayWaveStart();
  }

  /** この Wave の主な襲来方向（プレイヤーから遠い側）と、回り込み部隊の方向を決める */
  private ChooseSpawnSides(): void {
    const player = this.player.position;
    const DistanceToSide = (side: THREE.Vector3) => Math.hypot(side.x * MAP_HALF_SIZE - player.x, side.z * MAP_HALF_SIZE - player.z);
    const sortedSides = [...SPAWN_SIDES].sort((a, b) => DistanceToSide(b) - DistanceToSide(a));
    this.primarySide = sortedSides[Math.floor(Math.random() * 2)];
    const perpendicularSides = SPAWN_SIDES.filter((side) => Math.abs(side.dot(this.primarySide)) < 0.5);
    perpendicularSides.sort((a, b) => DistanceToSide(b) - DistanceToSide(a));
    this.flankSide = perpendicularSides[0];

    const indicatorSource = this.primarySide.clone().multiplyScalar(MAP_HALF_SIZE);
    this.indicators.push({ source: indicatorSource, timer: THREAT_INDICATOR_TIME, duration: THREAT_INDICATOR_TIME, kind: 'threat' });
  }

  private OnWaveCleared(): void {
    this.isWaveActive = false;
    this.waveClearTimer = WAVE_CLEAR_DELAY;
    const bonus = 50 + this.wave * 10;
    this.player.money += bonus;
    const isFinal = this.wave === TOTAL_WAVES && !this.isEndless;
    this.hud.ShowBanner('WAVE CLEAR', `ボーナス +$${bonus}　${isFinal ? '' : 'まもなくショップが開きます'}`, WAVE_CLEAR_DELAY);
    this.sfx.PlayWaveClear();
  }

  private OpenShop(): void {
    this.state = 'shop';
    this.input.ExitLock();
    this.hud.SetPickupPrompt(null);
    this.shop.Open(this.player, this.wave, this.wave + 1);
  }

  private ShowResult(isVictory: boolean): void {
    this.state = 'result';
    this.input.ExitLock();
    const screen = document.getElementById('result-screen')!;
    document.getElementById('result-heading')!.textContent = isVictory ? 'ALL WAVES CLEAR!' : 'GAME OVER';
    screen.classList.toggle('victory', isVictory);
    const minutes = Math.floor(this.playTime / 60);
    const seconds = Math.floor(this.playTime % 60).toString().padStart(2, '0');
    document.getElementById('result-stats')!.innerHTML = `
      <div><span>到達 Wave</span><strong>${this.wave}</strong></div>
      <div><span>撃破数</span><strong>${this.kills}</strong></div>
      <div><span>所持金</span><strong>$ ${this.player.money}</strong></div>
      <div><span>プレイ時間</span><strong>${minutes}:${seconds}</strong></div>`;
    document.getElementById('result-endless')!.classList.toggle('hidden', !isVictory);
    document.getElementById('result-retry')!.classList.toggle('hidden', isVictory);
    screen.classList.remove('hidden');
  }

  private ReturnToTitle(): void {
    this.state = 'title';
    this.input.ExitLock();
    this.ClearField();
    this.shop.Close();
    this.hud.SetVisible(false);
    for (const id of ['result-screen', 'pause-screen']) document.getElementById(id)!.classList.add('hidden');
    document.getElementById('title-screen')!.classList.remove('hidden');
    this.player.Reset(this.level.playerStart, this.selectedSubWeapon);
    this.avatar.root.visible = true;
  }

  // ------------------------------------------------------------
  // メインループ
  // ------------------------------------------------------------

  private readonly Loop = (): void => {
    requestAnimationFrame(this.Loop);
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;

    switch (this.state) {
      case 'title':
        this.UpdateTitle(dt);
        break;
      case 'playing':
        this.UpdatePlaying(dt);
        break;
      default:
        break;
    }
    this.input.EndFrame();
    this.renderer.render(this.scene, this.camera);
  };

  private UpdateTitle(dt: number): void {
    this.titleAngle += dt * 0.25;
    const start = this.level.playerStart;
    this.avatar.root.position.copy(start);
    this.avatar.root.rotation.y = 0;
    this.avatar.Update(dt, {
      forwardSpeed: 0, rightSpeed: 0, isCrouching: false, isAiming: false, isSprinting: false,
      isGrounded: true, aimPitch: 0, reloadProgress: -1, recoil: 0,
    });
    this.camera.position.set(start.x + Math.sin(this.titleAngle) * 3.5, 1.6, start.z + Math.cos(this.titleAngle) * 3.5);
    this.camera.lookAt(start.x, 1.1, start.z);
    this.camera.fov = CAMERA_FOV;
    this.camera.updateProjectionMatrix();
    this.level.Update(dt);
    this.effects.Update(dt);
  }

  private UpdatePlaying(dt: number): void {
    if (!this.input.isLocked && performance.now() - this.lockRequestTime > LOCK_GRACE_TIME * 1000) {
      this.OnLockChange(false);
      return;
    }
    this.playTime += dt;
    const player = this.player;

    player.UpdateMovement(dt, this.input, this.level.colliders);
    player.GetTargetPosition(this.playerTarget);
    this.playerSegmentBottom.set(player.position.x, player.position.y + PLAYER_RADIUS, player.position.z);
    this.playerSegmentTop.set(player.position.x, player.position.y + player.GetHeight() - PLAYER_RADIUS, player.position.z);

    this.fireBufferTimer = this.input.isLeftPressed ? FIRE_BUFFER_TIME : Math.max(0, this.fireBufferTimer - dt);
    this.HandleWeaponInput();
    if (player.UpdateTimers(dt)) this.sfx.PlayReload();
    const weapon = player.GetCurrentWeapon();
    if (weapon && weapon.mag === 0 && !player.IsReloading() && player.fireCooldown <= 0 && player.StartReload()) {
      this.sfx.PlayReload();
    }

    this.UpdateSpawning(dt);
    this.navTimer -= dt;
    if (this.navTimer <= 0) {
      this.navTimer = 0.25;
      this.nav.UpdateTarget(player.position);
    }
    for (const enemy of this.enemies) enemy.Update(dt, this.enemyContext);
    this.projectiles.Update(dt, this.projectileContext);
    this.UpdatePendingBarrels(dt);
    this.UpdatePickups(dt);
    this.level.Update(dt);
    this.effects.Update(dt);

    if (this.state !== 'playing') return; // 被弾で倒れた場合

    if (this.isWaveActive && this.spawnQueue.length === 0 && this.enemies.length === 0) {
      this.OnWaveCleared();
    }
    if (this.waveClearTimer > 0) {
      this.waveClearTimer -= dt;
      if (this.waveClearTimer <= 0) {
        if (this.wave === TOTAL_WAVES && !this.isEndless) this.ShowResult(true);
        else this.OpenShop();
      }
    }

    this.UpdateAvatar(dt);
    this.UpdateCamera(dt);
    this.UpdateIndicators(dt);
    this.UpdateHud(dt);
  }

  // ------------------------------------------------------------
  // 武器
  // ------------------------------------------------------------

  private HandleWeaponInput(): void {
    const player = this.player;
    const input = this.input;
    const slotKey = input.GetPressedSlotKey();
    // 所持している武器と同じものは触れるだけで拾う（強化ボーナス）ので、登録の対象外
    const nearby = this.pickups.FindNearestWeapon(player.position, PICKUP_RANGE, (pickup) => this.IsBonusPickup(pickup));

    if (nearby && nearby.weapon) {
      const color = TIER_CSS_COLORS[Math.min(nearby.weapon.def.tier, TIER_CSS_COLORS.length - 1)];
      this.hud.SetPickupPrompt(
        `<span class="pickup-name" style="color:${color}">${nearby.weapon.GetDisplayName()}</span><br><b>[1]〜[4]</b> キーでスロットに登録`,
      );
      if (slotKey >= 0) {
        const weapon = nearby.weapon;
        const dropPosition = nearby.position.clone();
        this.pickups.Remove(nearby);
        const previous = player.AssignWeapon(slotKey, weapon);
        if (previous) this.pickups.SpawnWeapon(dropPosition, previous);
        player.SwitchToSlot(slotKey);
        this.hud.Notify(`${weapon.GetDisplayName()} をスロット ${slotKey + 1} に登録`, 'pickup');
        this.sfx.PlayPickup();
      }
    } else {
      this.hud.SetPickupPrompt(null);
      if (slotKey >= 0) player.SwitchToSlot(slotKey);
    }

    if (input.wheelSteps !== 0) player.CycleWeapon(Math.sign(input.wheelSteps));
    if (input.WasPressed('KeyR') && player.StartReload()) this.sfx.PlayReload();

    const weapon = player.GetCurrentWeapon();
    if (!weapon) return;
    const wantsToFire = weapon.def.isAuto ? input.isLeftDown : this.fireBufferTimer > 0;
    if (!wantsToFire || player.fireCooldown > 0 || player.IsReloading()) return;
    this.fireBufferTimer = 0;
    if (weapon.mag > 0) {
      this.FireWeapon(weapon);
    } else if (!player.StartReload()) {
      this.sfx.PlayEmpty();
    }
  }

  private GetCurrentSpread(weapon: WeaponInstance): number {
    const player = this.player;
    let spread = weapon.def.spread;
    if (player.isAiming) spread *= weapon.def.aimSpreadMultiplier;
    if (player.isCrouching) spread *= 0.8;
    const horizontalSpeed = Math.hypot(player.velocity.x, player.velocity.z);
    spread *= 1 + (horizontalSpeed / WALK_SPEED) * 0.6;
    if (!player.isGrounded) spread *= 2;
    return spread + player.spreadBloom * (player.isAiming ? 0.5 : 1);
  }

  private FireWeapon(weapon: WeaponInstance): void {
    const player = this.player;
    const def = weapon.def;
    weapon.mag--;
    player.fireCooldown = weapon.GetFireInterval();

    this.avatar.root.updateMatrixWorld(true);
    const muzzle = this.avatar.GetMuzzleWorldPosition(tmpMuzzle).clone();
    const aimPoint = this.ComputeAimPoint(tmpAim);
    const baseDirection = aimPoint.sub(muzzle).normalize().clone();
    const spread = this.GetCurrentSpread(weapon);

    for (let i = 0; i < def.pellets; i++) {
      const direction = this.ApplySpread(baseDirection, spread);
      if (def.isProjectile) {
        this.projectiles.SpawnRocket(muzzle, direction, def.projectileSpeed, weapon.GetDamage(), def.explosionRadius);
      } else {
        this.FireHitscan(muzzle, direction, weapon);
      }
    }

    this.effects.ShowMuzzleFlash(muzzle);
    this.sfx.PlayShot(def.id);
    const kick = def.recoil * (player.isAiming ? 0.6 : 1) * (player.isCrouching ? 0.8 : 1);
    player.pitch += kick;
    player.recoilKick += kick;
    player.spreadBloom = Math.min(0.08, player.spreadBloom + def.spread * 0.35 + def.recoil * 0.3);
    this.recoilAnimation = Math.min(0.12, this.recoilAnimation + def.recoil);
    this.cameraShake = Math.min(1, this.cameraShake + def.recoil * 2);
  }

  private ApplySpread(direction: THREE.Vector3, spread: number): THREE.Vector3 {
    if (spread <= 0) return direction.clone();
    tmpUp.set(0, 1, 0);
    if (Math.abs(direction.y) > 0.99) tmpUp.set(1, 0, 0);
    tmpSide.crossVectors(direction, tmpUp).normalize();
    tmpUp.crossVectors(tmpSide, direction).normalize();
    const radius = spread * Math.sqrt(Math.random());
    const angle = Math.random() * Math.PI * 2;
    return direction.clone()
      .addScaledVector(tmpSide, Math.cos(angle) * radius)
      .addScaledVector(tmpUp, Math.sin(angle) * radius)
      .normalize();
  }

  /** 画面中央の照準が指している位置 */
  private ComputeAimPoint(out: THREE.Vector3): THREE.Vector3 {
    this.camera.getWorldDirection(tmpDirection);
    tmpPivot.set(this.player.position.x, this.player.position.y + this.cameraHeight, this.player.position.z);
    // カメラとプレイヤーの間にある物は無視する
    const skip = this.camera.position.distanceTo(tmpPivot);
    const start = tmpPoint.copy(this.camera.position).addScaledVector(tmpDirection, skip);
    let hitDistance = MAX_AIM_DISTANCE;
    const wall = RaycastColliders(start, tmpDirection, hitDistance, this.level.colliders);
    if (wall) hitDistance = wall.distance;
    for (const enemy of this.enemies) {
      for (let s = 0; s < enemy.def.hitSpheres.length; s++) {
        enemy.GetHitSphereCenter(s, tmpCenter);
        const distance = IntersectRaySphere(start, tmpDirection, tmpCenter, enemy.def.hitSpheres[s].radius);
        if (distance >= 0 && distance < hitDistance) hitDistance = distance;
      }
    }
    return out.copy(start).addScaledVector(tmpDirection, hitDistance);
  }

  private FireHitscan(origin: THREE.Vector3, direction: THREE.Vector3, weapon: WeaponInstance): void {
    const def = weapon.def;
    const wall = RaycastColliders(origin, direction, def.range, this.level.colliders);
    const wallDistance = wall ? wall.distance : def.range;

    // 弾道上の敵を近い順に集める
    const hits: { enemy: Enemy; distance: number; multiplier: number }[] = [];
    for (const enemy of this.enemies) {
      if (!enemy.isAlive) continue;
      let best = Infinity;
      let multiplier = 1;
      for (let s = 0; s < enemy.def.hitSpheres.length; s++) {
        const sphere = enemy.def.hitSpheres[s];
        enemy.GetHitSphereCenter(s, tmpCenter);
        const distance = IntersectRaySphere(origin, direction, tmpCenter, sphere.radius);
        if (distance >= 0 && distance < wallDistance && distance < best) {
          best = distance;
          multiplier = sphere.damageMultiplier;
        }
      }
      if (best < Infinity) hits.push({ enemy, distance: best, multiplier });
    }
    hits.sort((a, b) => a.distance - b.distance);

    let pierceLeft = def.pierce;
    let endDistance = wallDistance;
    for (const hit of hits) {
      if (pierceLeft <= 0) break;
      const falloff = hit.distance <= def.falloffStart
        ? 1
        : Math.max(0.4, 1 - ((hit.distance - def.falloffStart) / Math.max(1, def.range - def.falloffStart)) * 0.6);
      const point = origin.clone().addScaledVector(direction, hit.distance);
      this.DamageEnemy(hit.enemy, weapon.GetDamage() * hit.multiplier * falloff, point, hit.multiplier > 1);
      pierceLeft--;
      if (pierceLeft <= 0) endDistance = hit.distance;
    }

    if (pierceLeft > 0 && wall) {
      if (wall.collider.barrel) this.DamageBarrel(wall.collider.barrel, weapon.GetDamage());
      this.effects.SpawnImpact(wall.point, wall.normal, 0xffd080, 5);
    }
    const end = origin.clone().addScaledVector(direction, endDistance);
    this.effects.SpawnTracer(origin, end, def.id === 'sniper' ? 0xd0a0ff : 0xfff2b0);
  }

  // ------------------------------------------------------------
  // ダメージ・撃破・ドロップ
  // ------------------------------------------------------------

  private DamageEnemy(enemy: Enemy, amount: number, point: THREE.Vector3, isCritical: boolean): void {
    if (!enemy.isAlive) return;
    const isKilled = enemy.TakeDamage(amount);
    this.effects.SpawnImpact(point, null, ENEMY_COLORS[enemy.def.kind], isCritical ? 14 : 6);
    this.hud.ShowHitMarker(isKilled);
    this.sfx.PlayHit();
    if (isKilled) this.KillEnemy(enemy);
  }

  private KillEnemy(enemy: Enemy): void {
    const reward = enemy.def.reward;
    this.player.money += reward;
    this.kills++;
    this.hud.Notify(`+$${reward}　${enemy.def.name} を撃破`, 'money');
    this.sfx.PlayKill();
    this.sfx.PlayCoin();
    enemy.GetCenter(tmpCenter);
    const isBoss = enemy.def.kind === 'boss';
    this.effects.SpawnBurst(tmpCenter, ENEMY_COLORS[enemy.def.kind], isBoss ? 160 : 30, isBoss ? 9 : 5);
    this.scene.remove(enemy.mesh, enemy.healthBar);
    const index = this.enemies.indexOf(enemy);
    if (index >= 0) this.enemies.splice(index, 1);
    this.flankers.delete(enemy);

    if (isBoss) {
      this.effects.SpawnExplosion(tmpCenter, 5);
      this.sfx.PlayExplosion();
      this.pickups.SpawnWeapon(enemy.position.clone().add(new THREE.Vector3(1, 0, 0)), PickRandomDropWeapon(this.wave + 2));
      this.pickups.SpawnHealth(enemy.position.clone().add(new THREE.Vector3(-1, 0, 0)));
      this.pickups.SpawnAmmo(enemy.position.clone().add(new THREE.Vector3(0, 0, 1)));
      this.hud.ShowBanner('BOSS DEFEATED', `パンプキンキングを倒した！ +$${reward}`, 2.5);
    } else {
      this.RollDrops(enemy.position, 'enemy');
    }
  }

  private RollDrops(position: THREE.Vector3, source: DropSource): void {
    const chances = DROP_CHANCES[source];
    const dropPosition = position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0, (Math.random() - 0.5) * 0.6));
    const roll = Math.random();
    if (roll < chances.weapon) {
      this.pickups.SpawnWeapon(dropPosition, PickRandomDropWeapon(this.wave));
    } else if (roll < chances.weapon + chances.health) {
      this.pickups.SpawnHealth(dropPosition);
    } else if (roll < chances.weapon + chances.health + chances.ammo) {
      this.pickups.SpawnAmmo(dropPosition);
    }
  }

  private DamageBarrel(barrel: Barrel, amount: number): void {
    if (barrel.TakeDamage(amount)) this.DestroyBarrel(barrel);
  }

  private DestroyBarrel(barrel: Barrel): void {
    this.level.RefreshColliders();
    this.nav.Rebuild(this.level.colliders);
    this.navTimer = 0;
    barrel.GetCenter(tmpCenter);
    this.effects.SpawnBurst(tmpCenter, barrel.isExplosive ? 0xff4020 : 0x9a6a3a, 25, 4);
    this.sfx.PlayBarrelBreak();
    this.player.money += BARREL_REWARD;
    if (barrel.isExplosive) {
      this.Explode(tmpCenter.clone(), EXPLOSIVE_BARREL_RADIUS, EXPLOSIVE_BARREL_DAMAGE, false);
    }
    this.RollDrops(barrel.position, 'barrel');
  }

  private Explode(center: THREE.Vector3, radius: number, damage: number, isFromPlayerWeapon: boolean): void {
    this.effects.SpawnExplosion(center, radius);
    this.sfx.PlayExplosion();
    const playerDistance = center.distanceTo(this.playerTarget);
    this.cameraShake = Math.min(1.5, this.cameraShake + Math.max(0.2, 1 - playerDistance / 25));

    for (const enemy of [...this.enemies]) {
      enemy.GetCenter(tmpCenter);
      const distance = Math.max(0, center.distanceTo(tmpCenter) - enemy.def.hitSpheres[0].radius);
      if (distance >= radius) continue;
      const falloff = Math.max(0.3, 1 - distance / radius);
      this.DamageEnemy(enemy, damage * falloff, tmpCenter.clone(), false);
    }

    for (const barrel of this.level.barrels) {
      if (!barrel.isAlive) continue;
      barrel.GetCenter(tmpCenter);
      if (center.distanceTo(tmpCenter) >= radius) continue;
      if (barrel.isExplosive) {
        // 連鎖爆発は少し遅らせる
        if (!this.pendingBarrels.some((pending) => pending.barrel === barrel)) {
          this.pendingBarrels.push({ barrel, timer: 0.15 + Math.random() * 0.1 });
        }
      } else {
        this.DamageBarrel(barrel, 999);
      }
    }

    if (playerDistance < radius) {
      const selfMultiplier = isFromPlayerWeapon ? 0.4 : 0.7;
      this.DamagePlayer(damage * (1 - playerDistance / radius) * selfMultiplier, center);
    }
  }

  private UpdatePendingBarrels(dt: number): void {
    for (let i = this.pendingBarrels.length - 1; i >= 0; i--) {
      const pending = this.pendingBarrels[i];
      pending.timer -= dt;
      if (pending.timer > 0) continue;
      this.pendingBarrels.splice(i, 1);
      this.DamageBarrel(pending.barrel, 999);
    }
  }

  private OnProjectileHitCollider(projectile: Projectile, hit: ColliderHit): void {
    if (projectile.explosionRadius > 0) {
      this.Explode(hit.point.clone().addScaledVector(hit.normal, 0.2), projectile.explosionRadius, projectile.damage, true);
      return;
    }
    this.effects.SpawnImpact(hit.point, hit.normal, projectile.color, 8);
    if (hit.collider.barrel) this.DamageBarrel(hit.collider.barrel, projectile.damage);
  }

  private DamagePlayer(amount: number, source?: THREE.Vector3): void {
    if (this.state !== 'playing' || amount <= 0) return;
    const player = this.player;
    player.hp = Math.max(0, player.hp - amount);
    if (source) this.AddDamageIndicator(source);
    this.hud.FlashDamage(amount / 30);
    this.sfx.PlayHurt();
    this.cameraShake = Math.min(1.5, this.cameraShake + 0.15);
    if (player.hp <= 0) this.ShowResult(false);
  }

  private AddDamageIndicator(source: THREE.Vector3): void {
    // 近い方向からの連続被弾は 1 つにまとめる
    const existing = this.indicators.find(
      (indicator) => indicator.kind === 'damage' && Math.hypot(indicator.source.x - source.x, indicator.source.z - source.z) < 3,
    );
    if (existing) {
      existing.source.copy(source);
      existing.timer = DAMAGE_INDICATOR_TIME;
      return;
    }
    this.indicators.push({ source: source.clone(), timer: DAMAGE_INDICATOR_TIME, duration: DAMAGE_INDICATOR_TIME, kind: 'damage' });
  }

  private UpdateIndicators(dt: number): void {
    const player = this.player;
    const forwardX = -Math.sin(player.yaw);
    const forwardZ = -Math.cos(player.yaw);
    const rightX = Math.cos(player.yaw);
    const rightZ = -Math.sin(player.yaw);
    const visible: { angle: number; opacity: number; kind: string }[] = [];
    for (let i = this.indicators.length - 1; i >= 0; i--) {
      const indicator = this.indicators[i];
      indicator.timer -= dt;
      if (indicator.timer <= 0) {
        this.indicators.splice(i, 1);
        continue;
      }
      const dx = indicator.source.x - player.position.x;
      const dz = indicator.source.z - player.position.z;
      const angle = Math.atan2(dx * rightX + dz * rightZ, dx * forwardX + dz * forwardZ);
      const opacity = Math.min(1, (indicator.timer / indicator.duration) * 2);
      visible.push({ angle, opacity, kind: indicator.kind });
    }
    this.hud.SetIndicators(visible);
  }

  // ------------------------------------------------------------
  // 敵の出現・アイテム
  // ------------------------------------------------------------

  private UpdateSpawning(dt: number): void {
    // 序盤は同時出現数を抑える
    const maxAlive = Math.min(MAX_ALIVE_ENEMIES, 3 + this.wave);
    if (this.spawnQueue.length === 0 || this.enemies.length >= maxAlive) return;
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = Math.max(0.4, 1.6 - this.wave * 0.08);

    // 基本は主方向のゲートから。中盤以降は一部が横のゲートから回り込んでくる
    const kind = this.spawnQueue.shift()!;
    const isFlankSpawn = kind !== 'boss' && this.wave >= FLANK_SPAWN_START_WAVE && Math.random() < FLANK_SPAWN_RATIO;
    const sidePoints = this.level.GetSpawnPointsOnSide(isFlankSpawn ? this.flankSide : this.primarySide);
    const farPoints = sidePoints.filter((point) => point.distanceTo(this.player.position) > 14);
    const fallback = this.level.spawnPoints.filter((point) => point.distanceTo(this.player.position) > 14);
    const pool = farPoints.length > 0 ? farPoints : fallback.length > 0 ? fallback : this.level.spawnPoints;
    const spawnPoint = pool[Math.floor(Math.random() * pool.length)];
    const position = spawnPoint.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.5, 0, (Math.random() - 0.5) * 1.5));
    this.AddEnemy(kind, position);
    this.effects.SpawnBurst(new THREE.Vector3(position.x, 0.5, position.z), 0x9b30ff, 25, 3);
  }

  private AddEnemy(kind: EnemyKind, position: THREE.Vector3): void {
    const enemy = new Enemy(kind, position, this.wave);
    this.scene.add(enemy.mesh, enemy.healthBar);
    this.enemies.push(enemy);
  }

  /** 所持している武器と同じ種類の武器ピックアップか */
  private IsBonusPickup(pickup: Pickup): boolean {
    const id = pickup.weapon?.def.id;
    return id !== undefined && this.player.slots.some((weapon) => weapon?.def.id === id);
  }

  /** 同じ武器を拾ったときのボーナス：その場で強化 + 弾薬全回復 */
  private AbsorbDuplicateWeapon(pickup: Pickup): void {
    const player = this.player;
    const slotIndex = player.slots.findIndex((weapon) => weapon?.def.id === pickup.weapon!.def.id);
    const owned = player.slots[slotIndex]!;
    const wasMaxLevel = owned.IsMaxLevel();
    const isLevelUp = owned.AbsorbDuplicate(pickup.weapon!);
    if (slotIndex === player.currentSlot) player.CancelReload();
    if (isLevelUp) {
      this.hud.Notify(`⬆ ${owned.GetDisplayName()} に強化！ 弾薬フル補充`, 'bonus');
      this.hud.ShowBanner('WEAPON UP!', `${owned.GetDisplayName()}`, 1.5);
      this.sfx.PlayPowerUp();
    } else {
      this.hud.Notify(`${owned.def.name}${wasMaxLevel ? '（最大レベル）' : ''} 弾薬フル補充`, 'bonus');
      this.sfx.PlayPickup();
    }
    this.pickups.Remove(pickup);
  }

  private UpdatePickups(dt: number): void {
    this.pickups.Update(dt, (pickup) => this.IsBonusPickup(pickup));
    const player = this.player;
    for (const pickup of [...this.pickups.pickups]) {
      const distance = Math.hypot(pickup.position.x - player.position.x, pickup.position.z - player.position.z);
      if (distance > 1.0) continue;
      if (pickup.kind === 'weapon') {
        if (this.IsBonusPickup(pickup)) this.AbsorbDuplicateWeapon(pickup);
        continue;
      }
      if (pickup.kind === 'health') {
        if (player.hp >= player.maxHp) continue;
        player.hp = Math.min(player.maxHp, player.hp + HEALTH_PICKUP_AMOUNT);
        this.hud.Notify(`HP +${HEALTH_PICKUP_AMOUNT}`, 'heal');
      } else {
        const needsAmmo = player.slots.some((weapon) => weapon?.NeedsAmmo());
        if (!needsAmmo) continue;
        for (const weapon of player.slots) weapon?.RefillAmmo(0.35);
        this.hud.Notify('弾薬を補充した', 'pickup');
      }
      this.sfx.PlayPickup();
      this.pickups.Remove(pickup);
    }
  }

  // ------------------------------------------------------------
  // 表示
  // ------------------------------------------------------------

  private IsScoped(): boolean {
    return this.player.isAiming && this.player.GetCurrentWeapon()?.def.id === 'sniper';
  }

  private UpdateAvatar(dt: number): void {
    const player = this.player;
    this.recoilAnimation *= Math.exp(-dt * 12);
    this.avatar.root.position.copy(player.position);
    this.avatar.root.rotation.y = player.yaw + Math.PI;
    this.avatar.root.visible = !this.IsScoped();
    this.avatar.SetWeapon(player.GetCurrentWeapon()?.def.id ?? null);
    this.avatar.Update(dt, {
      forwardSpeed: player.localForwardSpeed,
      rightSpeed: player.localRightSpeed,
      isCrouching: player.isCrouching,
      isAiming: player.isAiming,
      isSprinting: player.isSprinting,
      isGrounded: player.isGrounded,
      aimPitch: player.pitch,
      reloadProgress: player.GetReloadProgress(),
      recoil: this.recoilAnimation,
    });
  }

  private UpdateCamera(dt: number): void {
    const player = this.player;
    const weapon = player.GetCurrentWeapon();
    const isScoped = this.IsScoped();
    const blend = 1 - Math.exp(-dt * 14);

    const targetFov = player.isAiming && weapon ? weapon.def.aimFov : CAMERA_FOV;
    this.currentFov += (targetFov - this.currentFov) * blend;
    this.camera.fov = this.currentFov;
    this.camera.updateProjectionMatrix();

    const targetDistance = isScoped ? 0.1 : player.isAiming ? CAMERA_AIM_DISTANCE : CAMERA_DISTANCE;
    this.cameraDistance += (targetDistance - this.cameraDistance) * blend;
    const targetHeight = player.isCrouching ? 1.15 : 1.6;
    this.cameraHeight += (targetHeight - this.cameraHeight) * blend;

    const cosPitch = Math.cos(player.pitch);
    tmpLook.set(-Math.sin(player.yaw) * cosPitch, Math.sin(player.pitch), -Math.cos(player.yaw) * cosPitch);
    tmpRight.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
    tmpPivot.set(player.position.x, player.position.y + this.cameraHeight, player.position.z);
    const shoulder = isScoped ? 0.15 : CAMERA_SHOULDER_OFFSET;
    tmpDesired.copy(tmpPivot).addScaledVector(tmpRight, shoulder).addScaledVector(tmpLook, -this.cameraDistance);

    // 壁にめり込まないようにカメラを手前に寄せる
    tmpDirection.subVectors(tmpDesired, tmpPivot);
    const length = tmpDirection.length();
    if (length > 1e-4) {
      tmpDirection.divideScalar(length);
      const hit = RaycastColliders(tmpPivot, tmpDirection, length + 0.2, this.level.colliders);
      if (hit) tmpDesired.copy(tmpPivot).addScaledVector(tmpDirection, Math.max(0.1, hit.distance - 0.2));
    }
    tmpDesired.y = Math.max(0.2, tmpDesired.y);

    this.cameraShake *= Math.exp(-dt * 8);
    const shake = this.cameraShake * 0.08;
    this.camera.position.set(
      tmpDesired.x + (Math.random() - 0.5) * shake,
      tmpDesired.y + (Math.random() - 0.5) * shake,
      tmpDesired.z + (Math.random() - 0.5) * shake,
    );
    this.camera.rotation.set(player.pitch, player.yaw, 0);
  }

  private UpdateHud(dt: number): void {
    const player = this.player;
    const weapon = player.GetCurrentWeapon();
    this.hud.UpdatePlayer(player, weapon ? this.GetCurrentSpread(weapon) : 0);
    const isEndlessWave = this.isEndless || this.wave > TOTAL_WAVES;
    this.hud.SetWave(
      isEndlessWave ? `WAVE ${this.wave}  ENDLESS` : `WAVE ${this.wave} / ${TOTAL_WAVES}`,
      this.spawnQueue.length + this.enemies.length,
    );
    const boss = this.enemies.find((enemy) => enemy.def.kind === 'boss');
    this.hud.SetBoss(boss ? boss.def.name : null, boss ? boss.hp / boss.maxHp : 0);
    this.hud.SetScope(this.IsScoped());
    this.hud.Update(dt, player.hp / player.maxHp);
  }
}
