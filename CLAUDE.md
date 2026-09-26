# CLAUDE.md — 引き継ぎメモ

ブラウザで動く TPS ウェーブサバイバル「Halloween Siege」。Three.js + @pixiv/three-vrm、TypeScript + Vite。
仕様の全体像は README.md にある。ここには作業を続けるうえで必要な約束事・設計上の注意・テスト方法をまとめる。

## ユーザーとのやり取り

- 返答は日本語。コード内のコメントと UI 文言も日本語。
- 大きな変更は先に方針を短く説明してから実装し、スクリーンショットで結果を見せると喜ばれる。
- 確認できていないこと（実機の操作感、VRM 0.x の見た目など）は、確認できていないとはっきり伝える。

## 命名規則（必ず守る）

- 関数名・メソッド名：UpperPascalCase（例：`UpdateMovement`、`GetCurrentWeapon`、関数を入れた変数も `const Step = () => ...`）
- 変数名・フィールド名：lowerCamelCase
- 定数：UPPER_SNAKE_CASE
- モジュール（ファイル）名：UpperPascalCase（例外：エントリーの `src/main.ts`）
- クラス・型・インターフェース名：PascalCase

## コマンド

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck  # tsc --noEmit（noUnusedLocals / noUnusedParameters が有効）
npm run build      # tsc + vite build → dist/
```

## Git

- 作業ブランチ：`claude/great-keller-119vyv`（まだ `main` にはマージしていない）
- `.github/workflows/deploy-pages.yml`：`main` に push されると GitHub Pages へ公開する。公開には `main` へのマージと、リポジトリ設定で Pages の Source を「GitHub Actions」にすることが必要（まだ行っていない）。
- コミットメッセージは英語で、変更点を箇条書きにしている。

## ファイル構成

| ファイル | 役割 |
| --- | --- |
| `src/main.ts` | エントリー。開発時のみ `window.game` にゲームを公開（テスト用） |
| `src/Game.ts` | 全体の進行。状態遷移（title/playing/paused/shop/result）、Wave、射撃・ダメージ・爆発、カメラ、HUD 更新、ミニマップ更新 |
| `src/Player.ts` | 移動・視点・武器スロット・リロード、壁への張り付き（カバー）の移動 |
| `src/Cover.ts` | 張り付ける壁の判定（`FindCover`） |
| `src/Avatar.ts` | VRM 読み込み、マネキン、コードで作るモーション（歩き・しゃがみ・エイム・リロード・張り付きポーズ）、手に銃を持たせる処理 |
| `src/Weapons.ts` | 武器の定義（6 種類 × 機種 17 個）と `WeaponInstance`（弾数・レベル） |
| `src/WeaponModels.ts` / `src/WeaponStats.ts` | 武器モデル／性能の数値表示（基礎値 + 強化値） |
| `src/Enemy.ts` / `src/EnemyModels.ts` | 敵の定義・AI／モデル |
| `src/Level.ts` | マップ（十字の大通り + 4 区画）の配置・当たり判定・出現口 |
| `src/CityProps.ts` / `src/CityTextures.ts` | 店・街灯・車・鳥居などのモデル／看板などの Canvas テクスチャ |
| `src/SkySystem.ts` | 空・光・霧の時間帯（夕方 → 夜） |
| `src/StaticBatcher.ts` | 動かない背景をマテリアルごとに結合してドローコールを減らす |
| `src/NavGrid.ts` | 敵の経路探索（1m グリッドのフローフィールド） |
| `src/Collision.ts` | AABB の当たり判定・レイキャスト |
| `src/Projectiles.ts` / `src/Pickups.ts` / `src/Effects.ts` | 弾／落ちているアイテム／演出 |
| `src/Hud.ts` / `src/Shop.ts` / `src/Minimap.ts` | HUD／ショップ（左右 2 分割）／ミニマップ |
| `src/Audio.ts` | 効果音（WebAudio で合成、音声ファイルなし） |
| `src/Config.ts` | 調整用の定数 |

## 設計上の約束・注意点

### 座標と向き
- ワールドは Y が上、北が -Z。カメラの `yaw = 0` で -Z を向く。正面は `(-sin yaw, 0, -cos yaw)`、右は `(cos yaw, 0, -sin yaw)`。
- キャラクター・小物のモデルは **+Z が正面**で作る。向けたい方向 `d` に対して `rotation.y = atan2(d.x, d.z)`。プレイヤーのモデルは `yaw + π`。

### VRM
- ポーズは VRM 1.0 の正規化ボーン（T ポーズで回転 0、+Z が正面、+X がキャラの左）を前提に作る。
- **VRM 0.x は正規化ボーンの向きが 180 度違う**ので、`Avatar.ConvertPoseToVrm0()` で全ボーンのクォータニオンを `(-x, y, -z, w)` に変換している。ポーズを追加するときは、VRM 1.0 前提で書き、変換は既存の処理に任せる。全ボーンを毎フレーム設定し直すこと（設定しないボーンがあると変換が二重にかかる）。
- VRM は Head ボーンの高さがマネキンの頭（1.62m）に揃うよう拡大縮小する。
- 銃は毎フレーム右手ボーンの位置に置く（`AttachGunToHand`）。
- 腕の向きは `PointBone` / `BlendArmTowards`（方向ベクトル指定）で決めると VRM・マネキンで扱いやすい。

### マップ（Level.ts）
- 区画は「区画ローカル座標」(a, b) で定義し、符号 (sx, sz) を掛けてワールド座標にする（`QUADRANT_BLOCKS`、`QUADRANT_PROPS`、`QUADRANT_SPAWNS`）。
- 大通りの小物は (u, v)＝(通りを横切る方向, 中心からの距離) で `ARM_LAYOUTS` に定義。路地の入口（v = 13〜18）の歩道はあけておく。
- 建物は「歩ける場所に面したブロックの面」に自動で並ぶ（`BuildBlockBuildings`）。
- 背景は最後に `BatchStaticMeshes` で結合される。**動かすもの（提灯・ポータル・樽など）は `MarkDynamic` を付ける**。
- 当たり判定を足したら NavGrid が自動で反映する（`nav.Rebuild`）。路地は幅 4m で、障害物の余白 0.55m を考えると 1.6m 以上の隙間を残すこと。

### 敵 AI とカバーの関係
- Wave ごとに主な襲来方向（東西南北のどれか）を決め、その辺の出現口から出す。Wave 4 以降は約 2 割が横の辺から回り込む。
- 敵は見えている間は持ち場を守る。射程内で見失ったら 2〜3.5 秒待ち、「回り込み役」の枠（同時に 1〜3 体）を得た敵だけが回り込む。回り込み役は倒されるまで役を持ち続ける。
- 敵は撃つ直前に視線を再確認する。プレイヤーの被弾判定の上端は身長（しゃがみ 1.0m）で、低い遮蔽物（1.1〜1.2m）に完全に隠れられる。この関係を崩さないこと。

### 張り付き（カバー）
- Q で張り付く。低い遮蔽物（高さ 1.6m 未満）はしゃがみ、高い壁は立つ。どちらも壁に背をつけ、キャラの前面がカメラに映る。
- 撃てるのは身を乗り出している間だけ（`Player.CanFire`）。高い壁は端（角、または壁沿いの物で行き止まり）でのみ身を乗り出せる。

### 武器
- 強化ボーナス（触れるだけで強化 + 弾薬全回復）は**全く同じ機種**のときだけ。
- レベル効果：威力 +20%／装弾数 +15%／予備弾 +15%／リロード -8%／射撃間隔 -4%（1 レベルごと、最大 Lv5）。

## テスト方法（ヘッドレスブラウザ）

この環境には GPU がなく、ソフトウェア描画は 1fps 程度と非常に遅い。次のやり方で確認している。

- Playwright はグローバルにある：`require('/opt/node22/lib/node_modules/playwright')`。Chromium は `/opt/pw-browsers`（`playwright install` はしない）。起動引数：`--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`。
- 開発サーバーを `npx vite --port 5173 --strictPort` でバックグラウンド起動し、`window.game` を操作する。
- ポインタロックはヘッドレスで使えないので、`addInitScript` で `Element.prototype.requestPointerLock` と `document.exitPointerLock` を差し替え、`pointerlockchange` を発火させる。
- 描画を待たずにゲームを進めるには、`page.evaluate` の中で `game.UpdatePlaying(1 / 30); game.input.EndFrame();` を必要な回数だけ呼ぶ。キー入力は `game.input.IsDown` を差し替えるか `game.input.keysPressed.add('KeyQ')` を使う。
- 速くするには `game.renderer.shadowMap.enabled = false` と小さいビューポートを使う。待ち時間が短いと 1 フレームも描画されないことがあるので、キー操作の結果を見るときは長めに待つ。
- VRM のテスト用サンプル（VRM 1.0）：`https://raw.githubusercontent.com/pixiv/three-vrm/dev/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm`。VRM 0.x のサンプルは入手できていない。
- 日本語フォントは IPA ゴシックなどがあるので、看板のテキストも確認できる。
- 確認してきた流れ：撃破・武器の登録と入れ替え・強化ボーナス・爆発樽・Wave クリア → ショップ → 次の Wave・ゲームオーバー → リトライ・全 Wave クリア → エンドレス・張り付き（低い遮蔽物／高い壁の角／行き止まり）・敵の経路。

## 今後の候補

- オープンワールド（自由探索）モード：Wave 制を残して別モードとして追加する案。目的（結界の破壊・区画の解放など）、敵の出方、マップの広さ、ショップの置き場所を決める必要がある。
- カバーの拡張：遮蔽物の乗り越え、隣の遮蔽物への移動、ブラインドファイア、張り付き中のリロードモーション。
- 構えていないときに銃を下げる（ローレディ）。
- 敵の追加（スケルトン、カボチャ頭の大型の敵）、HUD デザインの調整、ブルーム、BGM、設定画面（感度・音量・画質）。
- GitHub Pages での公開（`main` へのマージと Pages の設定）。
