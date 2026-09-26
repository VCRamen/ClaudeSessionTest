// ステージの定義。ボスを倒すごとに次のステージへ進む（仮の進行）

import { WAVES_PER_STAGE } from './Config';

export type StageId = 'shoppingStreet' | 'downtown';

export interface StageDef {
  id: StageId;
  name: string;
  /** ステージ開始時のバナーに出す説明 */
  description: string;
}

export const STAGES: StageDef[] = [
  { id: 'shoppingStreet', name: '商店街', description: 'ハロウィン飾りの夕暮れの商店街' },
  { id: 'downtown', name: 'ビル街', description: '高層ビルとマンションが並ぶ大通り。ベランダの敵に注意' },
];

/** Wave 番号（1 始まり）から、そのステージの番号（STAGES の添字） */
export function GetStageIndexForWave(wave: number): number {
  return Math.floor((Math.max(1, wave) - 1) / WAVES_PER_STAGE) % STAGES.length;
}

/** ステージ内での Wave の順番（0 始まり） */
export function GetWaveInStage(wave: number): number {
  return (Math.max(1, wave) - 1) % WAVES_PER_STAGE;
}
