// ゲーム全体で使う定数

export const MAP_HALF_SIZE = 30;
export const TOTAL_WAVES = 10;

export const PLAYER_RADIUS = 0.35;
export const PLAYER_HEIGHT = 1.7;
export const PLAYER_CROUCH_HEIGHT = 1.0;
/** 敵の弾に対するプレイヤーの当たり判定の半径（移動用の半径より少し細い） */
export const PLAYER_HIT_RADIUS = 0.3;
export const PLAYER_MAX_HP = 100;
export const PLAYER_START_MONEY = 0;

export const STEP_HEIGHT = 0.35;
export const GRAVITY = 22;
export const JUMP_SPEED = 7.5;
export const WALK_SPEED = 4.5;
export const SPRINT_SPEED = 7.5;
export const CROUCH_SPEED = 2.2;
export const AIM_SPEED_MULTIPLIER = 0.6;

export const MOUSE_SENSITIVITY = 0.0022;
export const AIM_SENSITIVITY_MULTIPLIER = 0.6;

export const CAMERA_DISTANCE = 3.2;
export const CAMERA_AIM_DISTANCE = 1.6;
export const CAMERA_SHOULDER_OFFSET = 0.6;
export const CAMERA_FOV = 70;

export const PICKUP_RANGE = 1.8;
export const MAX_ALIVE_ENEMIES = 14;
export const WEAPON_SLOT_COUNT = 4;
export const MAX_WEAPON_LEVEL = 5;

export const HEALTH_PICKUP_AMOUNT = 35;
export const PICKUP_LIFETIME = 90;

/** 落ちている武器に触れてから、1〜4 キーで登録できるようになるまでの時間（秒） */
export const WEAPON_PICKUP_DELAY = 0.7;

/** スコープの倍率の候補（ホイールで切り替える） */
export const SCOPE_MAGNIFICATIONS = [1.5, 2, 3, 4, 6, 8];
/** スコープを初めて覗いたときの倍率 */
export const SCOPE_DEFAULT_MAGNIFICATION = 2;

/** 1 つのステージで戦う Wave の数（最後の Wave でボスが出る） */
export const WAVES_PER_STAGE = 5;
