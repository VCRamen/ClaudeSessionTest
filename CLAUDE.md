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

- 作業ブランチ：`claude/ecstatic-noether-arz105`（`claude/great-keller-119vyv` の続き。どちらもまだ `main` にはマージしていない）
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
| `src/Level.ts` | マップ（十字の大通り + 4 区画）の配置・当たり判定・出現口・高所の敵の立ち位置（`perches`）。ステージごとに作り直す |
| `src/Stages.ts` | ステージの定義（商店街・ビル街）と Wave → ステージの対応 |
| `src/CityProps.ts` / `src/CityTextures.ts` | 店・街灯・車・鳥居などのモデル／看板などの Canvas テクスチャ |
| `src/DowntownProps.ts` | ビル街のモデル（ベランダ付きマンション・高層ビル・遠景のビル群・信号機・バナー・コーン・噴水）とベランダ（商店街と共用） |
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
- **建物の角の近く（2m 以内）と、角に続く壁際には物を置かない**（角に張り付いて身を乗り出せなくなるため。ユーザーの要望）。街灯・電柱は縁石寄り（u = ±3.85〜3.9、壁から約 1m）に立て、角から `CORNER_CLEARANCE`（2.2m）以内なら `AvoidBuildingCorners` が通りに沿ってずらす。ビル街の信号機は地面に柱を立てず、建物の角の壁に付ける。小物を足したら、角の近くに当たり判定がないかを確かめること（下の「テスト方法」）。

### ステージ
- 5 Wave（`WAVES_PER_STAGE`）で 1 ステージ。ステージの最後の Wave にボスが出る。次のステージへの切り替えは `Game.StartNextWave` → `ChangeStage` で、`Level` を `Dispose` して作り直し、`enemyContext` / `projectileContext` の `colliders`、NavGrid、ミニマップを差し替える。
- `Level` はステージ ID を受け取り、区画の種類（`STAGE_QUADRANTS`）・大通りの小物（`STAGE_ARM_LAYOUTS`）・建物（`BuildShoppingFacade` / `BuildDowntownFacade`）・空の色（`SkySystem` の palette）を切り替える。
- ビル街の区画 `offices` は路地（`alleys`）と同じブロック形状。`plaza` は大通りに大きく開いた広場。

### 高所の敵（ベランダ）
- ベランダは `Level.AddBalcony` で床の当たり判定（厚さ 0.2m の浮いた箱）と敵の立ち位置（`Perch`：足元の位置と、倒したときにアイテムが落ちる地面の位置）を登録する。立ち位置は床の高さ 8m 以下だけ。落ちる位置が小物の中なら近くの空いた地面へずらし、見つからなければ使わない（`ValidatePerches`）。
- **NavGrid は高さ 2.5m 以上に浮いた箱を無視する**（ベランダの下を通れるように）。ビル街のベランダは街灯（高さ約 4.25m）より上（4.6m〜）に付ける。商店街のベランダ（3.9m）は街灯・電柱と重ならない位置だけに付ける（`CanAttachBalcony`）。
- 高所の敵は `Enemy.perch` を持ち、移動せずにその場で撃つ（撃つ間隔は地上の 1.25 倍）。他の敵の押し合いの対象外。Wave 開始時に `Game.SpawnPerchedEnemies` で配置する（Wave 2 から、プレイヤーから 12〜38m、互いに 5m 以上離す）。Wave 3 から一部が魔女になる（商店街 45%、ビル街 60%）。
- 残りの敵（`spawnQueue` + `enemies`）が `PERCH_DESCEND_REMAINING`（5）以下になると、`Enemy.StartDescent` でベランダから落ちる位置へ飛び降り、着地したら `perch = null` になって地上の敵として動く（放っておかれないように）。
- 魔女（`witch`）は `projectileBurst: 3` で紫の弾を 0.2 秒おきに 3 連射する。2 発目以降も撃つ直前に視線を確かめる。
- ドロップは `PickupManager.SpawnXxx(position, ..., fallFrom)` で高所から落とす。着地するまで拾えない（`PickupManager.IsLanded`）。

### 敵 AI とカバーの関係
- Wave ごとに主な襲来方向（東西南北のどれか）を決め、その辺の出現口から出す。Wave 4 以降は約 2 割が横の辺から回り込む。
- 敵は見えている間は持ち場を守る。射程内で見失ったら 2〜3.5 秒待ち、「回り込み役」の枠（同時に 1〜3 体）を得た敵だけが回り込む。回り込み役は倒されるまで役を持ち続ける。
- 敵は撃つ直前に視線を再確認する。プレイヤーの被弾判定の上端は身長（しゃがみ 1.0m）で、低い遮蔽物（1.1〜1.2m）に完全に隠れられる。この関係を崩さないこと。

### 張り付き（カバー）
- Q で張り付く。低い遮蔽物（高さ 1.6m 未満）はしゃがみ、高い壁は立つ。どちらも壁に背をつけ、キャラの前面がカメラに映る。
- 張り付き中のキャラの中心は壁の面から `COVER_WALL_GAP`（0.17m。移動時の半径 0.35m より近い）。壁の端では当たり判定（半径 0.3m）がはみ出さないよう、端から `COVER_END_MARGIN`（0.33m）内側までしか動けない。
- 身を乗り出す動き：`Avatar.coverAmount` で張り付きのポーズと構えのポーズを約 0.25 秒かけて混ぜる（VRM は上半身のボーンを slerp、マネキンは回転を lerp、銃の向きも lerp）。体の向きは `Game.UpdateAvatar` で切り替え時だけなめらかに回す。撃てるのは `POP_OUT_READY_TIME`（0.22 秒）後。
- 撃てるのは身を乗り出している間だけ（`Player.CanFire`）。高い壁は端（角、または壁沿いの物で行き止まり）でのみ身を乗り出せる。

### 武器
- 強化ボーナス（触れるだけで強化 + 弾薬全回復）は**全く同じ機種**のときだけ。
- 落ちている武器は、触れて `WEAPON_PICKUP_DELAY`（0.7 秒）たってから 1〜4 キーで登録できる（それまでは 1〜4 は武器切り替え）。触れている武器が変わると数え直す。
- スナイパーのスコープ倍率は `WeaponInstance.scopeMagnification`（初期 ×2）。スコープ中はホイールで `SCOPE_MAGNIFICATIONS` の中から機種ごとの上限（`maxScopeMagnification`）まで切り替える。視野角は倍率から計算し（`Game.GetAimFov`）、視点感度も倍率に応じて下げる（`Player.aimSensitivityScale`）。
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
- 追加で確認した流れ：武器登録の待ち時間（触れた直後は 1〜4 が武器切り替えになる）・スコープ倍率の切り替え・Wave 5 のボス撃破 → STAGE CLEAR → ショップ → ビル街・ビル街での敵の経路・高所の敵の配置と撃破 → ドロップの落下・ゲームオーバー → リトライで商店街に戻る・タイトルへ戻る。ステージを何度切り替えてもシーンのオブジェクト数は増えない。
- ステージを直接確認するには `game.wave = 5; game.StartNextWave();`（ビル街の Wave 6 が始まる）。
- 建物の角の近くの障害物を調べるには、`game.ChangeStage(n)` の後で `game.level.staticColliders`（`box.min.y < 2` のもの、建物ブロックを除く）と `game.level.barrels` から、`game.level.buildingCorners` まで 1.6m 未満のものを列挙する（低い車 h1.4 は許容）。
- さらに確認した流れ：ダブルバレルは Lv5 でも 2 発・壁沿いに張り付いたまま街灯の横を通って角まで行ける・角での身を乗り出しの動き（マネキン／VRM 1.0）・魔女の 3 連射・残り 5 体以下で高所の敵が降りて向かってくる。

## 今後の候補

- オープンワールド（自由探索）モード：Wave 制を残して別モードとして追加する案。目的（結界の破壊・区画の解放など）、敵の出方、マップの広さ、ショップの置き場所を決める必要がある。ビル街のステージ（`Level` の `downtown`）はその下地にも使える。
- ステージ進行は仮（ボスを倒すと次へ）。ステージ選択、ステージごとのボス、3 つ目以降のステージ。
- ベランダ以外の高所（屋上・歩道橋）。魔女を地上の Wave にも混ぜる、ほうきで飛び回る動き。
- カバーの拡張：遮蔽物の乗り越え、隣の遮蔽物への移動、ブラインドファイア、張り付き中のリロードモーション。
- 構えていないときに銃を下げる（ローレディ）。
- 敵の追加（スケルトン、カボチャ頭の大型の敵）、HUD デザインの調整、ブルーム、BGM、設定画面（感度・音量・画質）。
- GitHub Pages での公開（`main` へのマージと Pages の設定）。
